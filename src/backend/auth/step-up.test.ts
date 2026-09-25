import { afterEach, describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { isMfaStepUpError, onMfaStepUpRequired, reportMfaStepUp } from "./step-up";
import { mapFantasyError } from "@/backend/fantasy/errors";
import { IdentityError, mapIdentityError } from "@/backend/identity/errors";
import { mapNewsError } from "@/backend/news/errors";
import { mapNotificationError } from "@/backend/notifications/errors";
import { mapPredictionsError } from "@/backend/predictions/errors";
import { mapSupabaseError } from "@/services/fantasy-cloud-repo";
import { toRepoError } from "@/services/fantasy-errors";
import { createTeamErrorKey } from "@/services/fantasy-create-service";
import { classifyRepoError } from "@/services/fantasy-mutation-controller";
import { leagueErrorMessage } from "@/components/predictions/leagues/leagues-copy";
import type { TranslationKey } from "@/i18n/dictionaries";

// The server contract (database lane, 2026-09-25): a write to the account's
// own data, or a sensitive account RPC, from a password-only session of an
// account with a verified factor fails with PostgREST code PT403 and the
// message `mfa_required`. The shape below is what supabase-js hands back.
const stepUp = () => ({
  code: "PT403",
  message: "mfa_required",
  details: null,
  hint: null,
});

let unsubscribe: (() => void) | null = null;
afterEach(() => {
  unsubscribe?.();
  unsubscribe = null;
});

function countReports(): { readonly count: number } {
  const counter = { count: 0 };
  unsubscribe = onMfaStepUpRequired(() => {
    counter.count++;
  });
  return counter;
}

describe("isMfaStepUpError", () => {
  it("recognises the raw PostgREST refusal", () => {
    expect(isMfaStepUpError(stepUp())).toBe(true);
    // PostgREST passes the raised message through as is; whitespace and case
    // are not meaning.
    expect(isMfaStepUpError({ code: "PT403", message: " MFA_REQUIRED " })).toBe(true);
  });

  it("finds it inside the error a domain mapper wrapped around it", () => {
    const wrapped = new IdentityError("internal", "wrapped", { cause: stepUp() });
    const twice = new Error("outer", { cause: wrapped });
    expect(isMfaStepUpError(wrapped)).toBe(true);
    expect(isMfaStepUpError(twice)).toBe(true);
  });

  it("does not claim the other PT403 refusals or the staff MFA codes", () => {
    expect(isMfaStepUpError({ code: "PT403", message: "account_banned" })).toBe(false);
    expect(isMfaStepUpError({ code: "PT403", message: "predictions_unavailable" })).toBe(false);
    // Admin/editorial codes belong to their own screens.
    expect(isMfaStepUpError({ code: "PT403", message: "staff_user_mfa_required" })).toBe(false);
    expect(isMfaStepUpError({ code: "PT403", message: "mfa_assurance_insufficient" })).toBe(false);
    // The message alone, under another code, is not the contract.
    expect(isMfaStepUpError({ code: "P0001", message: "mfa_required" })).toBe(false);
    expect(isMfaStepUpError(new Error("mfa_required"))).toBe(false);
    expect(isMfaStepUpError(null)).toBe(false);
    expect(isMfaStepUpError("mfa_required")).toBe(false);
  });

  it("survives a cause chain that loops back on itself", () => {
    const a: { cause?: unknown } = {};
    const b = { cause: a };
    a.cause = b;
    expect(isMfaStepUpError(a)).toBe(false);
  });
});

describe("reportMfaStepUp", () => {
  it("tells every listener about a step-up refusal, and says so", () => {
    const reports = countReports();
    expect(reportMfaStepUp(stepUp())).toBe(true);
    expect(reports.count).toBe(1);
  });

  it("stays silent for anything else", () => {
    const reports = countReports();
    expect(reportMfaStepUp({ code: "PT403", message: "account_banned" })).toBe(false);
    expect(reportMfaStepUp(new Error("Failed to fetch"))).toBe(false);
    expect(reports.count).toBe(0);
  });

  it("stops telling a listener once it unsubscribes", () => {
    const reports = countReports();
    unsubscribe?.();
    unsubscribe = null;
    reportMfaStepUp(stepUp());
    expect(reports.count).toBe(0);
  });

  it("is not broken by a listener that throws", () => {
    const off = onMfaStepUpRequired(() => {
      throw new Error("listener bug");
    });
    const reports = countReports();
    try {
      expect(reportMfaStepUp(stepUp())).toBe(true);
      expect(reports.count).toBe(1);
    } finally {
      off();
    }
  });
});

describe("the ordinary-account error mappers report it", () => {
  // Each one used to turn the refusal into its own generic failure.
  const mappers: ReadonlyArray<readonly [string, (error: never) => unknown]> = [
    ["identity (follows, profile, account security)", mapIdentityError],
    ["Fantasy repository", mapFantasyError],
    ["Fantasy owned repository adapter", toRepoError],
    ["Fantasy cloud repository", mapSupabaseError],
    ["Pronostics", mapPredictionsError],
    ["notification preferences", mapNotificationError],
    ["saved articles", mapNewsError],
  ];

  for (const [name, map] of mappers) {
    it(name, () => {
      const reports = countReports();
      const mapped = map(stepUp() as never);
      expect(reports.count).toBeGreaterThanOrEqual(1);
      // The raw refusal stays reachable from what the mapper returns, so a
      // screen can recognise it and skip its generic message.
      expect(isMfaStepUpError(mapped)).toBe(true);
    });
  }

  it("gives the identity refusal its own code instead of `internal`", () => {
    expect(mapIdentityError(stepUp()).code).toBe("mfa_required");
    expect(mapIdentityError({ code: "PT403", message: "something_else" }).code).toBe("internal");
  });

  it("leaves the admin mappers alone: staff MFA has its own server-enforced flow", () => {
    const root = join(import.meta.dir, "..", "..", "..");
    for (const file of [
      "src/backend/admin/errors.ts",
      "src/backend/admin/route-access.ts",
      "src/backend/admin/users-repository.ts",
      "src/backend/prizes/admin-repository.ts",
    ]) {
      expect({ file, reports: readFileSync(join(root, file), "utf8").includes("step-up") }).toEqual(
        { file, reports: false },
      );
    }
  });
});

describe("the screens get the refusal as its own code, not a catch-all", () => {
  // Review of the first fix: the mappers reported the refusal, but the screens
  // still read it as their generic failure ("Les transferts n'ont pas pu être
  // confirmés.", "Pronostics indisponibles") next to the auth layer's message.

  it("Fantasy: `mfa_required`, whichever mapper saw it first", () => {
    for (const error of [stepUp(), mapFantasyError(stepUp()), mapSupabaseError(stepUp())]) {
      expect(toRepoError(error).code).toBe("mfa_required");
    }
    // The other PT403 refusals keep their meaning.
    expect(toRepoError({ code: "PT403", message: "account_banned" }).code).not.toBe("mfa_required");
  });

  it("Fantasy screens: a step-up, and a permission refusal for the screens that only know that", () => {
    const flags = classifyRepoError(toRepoError(stepUp()));
    expect(flags.isStepUp).toBe(true);
    expect(flags.isPermission).toBe(true);
    expect(flags.isConflict || flags.isNetwork || flags.isValidation).toBe(false);
    expect(classifyRepoError(toRepoError({ code: "42501", message: "denied" })).isStepUp).toBe(
      false,
    );
  });

  it("Fantasy team creation says what is owed instead of its generic refusal", () => {
    expect(createTeamErrorKey(toRepoError(stepUp()))).toBe("auth.step_up.toast");
    expect(createTeamErrorKey({ code: "unknown" })).toBe("fantasy.create.error.generic");
  });

  it("Pronostics: `mfa_required` for the exact contract only", () => {
    expect(mapPredictionsError(stepUp()).code).toBe("mfa_required");
    // The message under another code is not the contract.
    expect(mapPredictionsError({ code: "P0001", message: "mfa_required" }).code).toBe(
      "data_unavailable",
    );
  });

  it("Pronostics leagues say what is owed instead of 'indisponible'", () => {
    const t = (key: TranslationKey) => key;
    expect(leagueErrorMessage(mapPredictionsError(stepUp()).code, t)).toBe("auth.step_up.toast");
    expect(leagueErrorMessage("data_unavailable", t)).toBe("predictions.state.unavailable");
  });
});
