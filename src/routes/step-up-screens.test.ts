import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * A write refused until the one-time code is in (`PT403 mfa_required`) is
 * announced once, by the auth layer's notice (`showStepUpNotice`: one toast
 * under its id, however many layers say so), and never beside -- or instead
 * of -- the screen's own failure: "Accès refusé. Reconnectez-vous",
 * "Indisponible", "Une erreur est survenue", or the notice's own sentence
 * toasted a second time as an error. Every other refusal keeps the screen's
 * message.
 *
 * The mappers and classifiers that name the refusal (`isStepUp`, the
 * `mfa_required` codes) run as functions in `src/backend/auth/step-up.test.ts`,
 * and the Fantasy chain -- repository, adapter, the screens' typing, mutation
 * controller, classifier -- runs in `src/services/fantasy-owned-step-up.test.ts`.
 * These pin that each write path branches on it before its own toast, and
 * that the Fantasy writes whose refusals the adapter leaves untyped are typed
 * on the way. Source-level, like `auth-second-factor.test.ts`: the handlers
 * live inside screens that need a router and a DOM to run, and the repository
 * tests neither.
 */

const ROOT = join(import.meta.dir, "..", "..");

/** Source without comments, whitespace collapsed, so layout cannot trip a rule. */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

/** One handler: from its declaration up to the next landmark. */
function handler(source: string, start: string, end: string): string {
  const from = source.indexOf(start);
  expect({ start, found: from > -1 }).toEqual({ start, found: true });
  const to = source.indexOf(end, from + start.length);
  expect({ end, found: to > from }).toEqual({ end, found: true });
  return source.slice(from, to);
}

const IMPORT = 'import { showStepUpNotice } from "@/auth/step-up-notice";';

/** The step-up arm, then the screen's own toast as the `else`: one message either way. */
const stepUpThen = (check: string, fallback: string) =>
  `if (${check}) showStepUpNotice(t); else ${fallback}`;

/**
 * The screens' typing of an owned write's refusal (`withTypedRefusal`). The V2
 * adapter hands the transfer and chip refusals on untyped and the controller
 * files those as `unknown`, so without it `isStepUp` -- and `isConflict` --
 * never held there.
 */
const TYPED_REFUSAL =
  "function withTypedRefusal<T>(write: Promise<T>): Promise<T> { return write.catch((error: unknown) => { throw toRepoError(error); }); }";
const TO_REPO_ERROR = 'import { toRepoError } from "@/services/fantasy-errors";';
/** `action: () => withTypedRefusal(owned.repo.<method>(`, whatever the line breaks. */
const typedWrite = (method: string) =>
  new RegExp(`action: \\(\\) => withTypedRefusal\\( ?owned\\.repo\\.${method}\\(`);
const WRITES = /owned\.repo\.(confirmTransfers|activateChip|cancelChip)\(/g;
const TYPED_WRITES =
  /withTypedRefusal\( ?owned\.repo\.(confirmTransfers|activateChip|cancelChip)\(/g;
/** The transfer and chip writes on a screen that are not typed on the way. */
const untypedWrites = (source: string) =>
  (source.match(WRITES) ?? []).length - (source.match(TYPED_WRITES) ?? []).length;

describe("Fantasy, Transfers (/fantasy/transfers)", () => {
  const source = code("src/routes/fantasy.transfers.tsx");

  it("imports the shared notice", () => {
    expect(source).toContain(IMPORT);
  });

  it("types the confirmation's and the chip's refusals before the controller files them", () => {
    expect(source).toContain(TO_REPO_ERROR);
    expect(source).toContain(TYPED_REFUSAL);
    const confirm = handler(source, "const confirm = async", "fantasyService.saveTeam(");
    expect(confirm).toMatch(typedWrite("confirmTransfers"));
    const chip = handler(source, "const activateTransferChip = async", "const confirm = async");
    expect(chip).toMatch(typedWrite("activateChip"));
    expect(untypedWrites(source)).toBe(0);
  });

  it("confirming: a code owed is not 'Accès refusé. Reconnectez-vous'", () => {
    const confirm = handler(source, "const confirm = async", "fantasyService.saveTeam(");
    expect(confirm).toContain("const c = classifyRepoError(res.error);");
    expect(confirm).toContain(stepUpThen("c.isStepUp", "toast.error("));
    // Everything else keeps its sentence, the permission refusal included.
    for (const key of [
      "fantasy.error.version_conflict",
      "fantasy.error.network",
      "fantasy.error.permission",
      "fantasy.error.transfer_failed",
    ]) {
      expect(confirm).toContain(`"${key}"`);
    }
    // The transfers are kept for when the code is in.
    expect(confirm.indexOf("fantasyDraftsStore.save")).toBeLessThan(
      confirm.indexOf("showStepUpNotice(t)"),
    );
  });

  it("a chip from the confirmation screen: a code owed is not 'Indisponible'", () => {
    const chip = handler(source, "const activateTransferChip = async", "const confirm = async");
    expect(chip).toContain(
      `else ${stepUpThen("classifyRepoError(res.error).isStepUp", 'toast.error(t("fantasy.chip.state.unavailable"));')}`,
    );
  });
});

describe("Fantasy, Pick Team (/fantasy/team)", () => {
  const source = code("src/routes/fantasy.team.tsx");

  it("imports the shared notice", () => {
    expect(source).toContain(IMPORT);
  });

  it("types the chips' refusals before the controller files them; the lineup save types its own", () => {
    expect(source).toContain(TO_REPO_ERROR);
    expect(source).toContain(TYPED_REFUSAL);
    const activate = handler(source, "const confirmChip = async", "const cancelActiveChip = async");
    expect(activate).toMatch(typedWrite("activateChip"));
    const cancel = handler(source, "const cancelActiveChip = async", "const confirmPending =");
    expect(cancel).toMatch(typedWrite("cancelChip"));
    expect(untypedWrites(source)).toBe(0);
  });

  it("saving the lineup: a code owed is not 'Accès refusé. Reconnectez-vous'", () => {
    const save = handler(source, "const save = async", "const chipViews =");
    expect(save).toContain(stepUpThen("c.isStepUp", "toast.error("));
    expect(save).toContain('"fantasy.error.permission"');
    expect(save).toContain('"fantasy.error.transfer_failed"');
  });

  it("activating a chip: a code owed is not 'Indisponible'", () => {
    const activate = handler(source, "const confirmChip = async", "const cancelActiveChip = async");
    expect(activate).toContain(stepUpThen("c.isStepUp", "toast.error("));
    expect(activate).toContain('"fantasy.chip.state.unavailable"');
  });

  it("cancelling a chip: the same", () => {
    const cancel = handler(source, "const cancelActiveChip = async", "const confirmPending =");
    expect(cancel).toContain(
      `else ${stepUpThen("classifyRepoError(res.error).isStepUp", 'toast.error(t("fantasy.chip.state.unavailable"));')}`,
    );
  });
});

describe("Fantasy, team creation (/fantasy/create)", () => {
  const source = code("src/routes/fantasy.create.tsx");

  it("keeps the step-up sentence in its alert, and toasts it once, as the auth layer's", () => {
    expect(source).toContain(IMPORT);
    const save = handler(source, "const save = async", 'if (step === "name")');
    // `createTeamErrorKey` names the step-up sentence for the alert (tested in
    // step-up.test.ts); the toast is the shared notice's, not a second one.
    expect(save).toContain("setSaveError(key);");
    expect(save).toContain(stepUpThen("classifyRepoError(res.error).isStepUp", "toast.error("));
    expect(save.indexOf("setSaveError(key);")).toBeLessThan(save.indexOf("showStepUpNotice(t)"));
  });
});

describe("Profile (/profile): the account-deletion request", () => {
  const source = code("src/routes/profile.tsx");

  it("imports the shared notice", () => {
    expect(source).toContain(IMPORT);
  });

  it("requesting and withdrawing it: a code owed is not 'Une erreur est survenue'", () => {
    const fallback = 'toast.error(t("profile.delete_error_toast"));';
    const request = handler(source, "const confirmDelete = async", "const cancelDeletion = async");
    expect(request).toContain(stepUpThen('res.errorCode === "mfa_required"', fallback));
    const withdraw = handler(source, "const cancelDeletion = async", "return (");
    expect(withdraw).toContain(stepUpThen('res.errorCode === "mfa_required"', fallback));
  });
});

describe("Fantasy hub: the reminder switches", () => {
  const source = code("src/components/fantasy/FantasyHubPersonal.tsx");

  it("imports the shared notice and the refusal's test", () => {
    expect(source).toContain(IMPORT);
    expect(source).toContain('import { isMfaStepUpError } from "@/backend/auth/step-up";');
  });

  it("the deadline reminder (saved with the profile): a code owed is not 'Une erreur est survenue'", () => {
    const reminders = handler(source, "const toggleReminders = async", "const toggleEmail = async");
    expect(reminders).toContain(
      stepUpThen('result.errorCode === "mfa_required"', 'toast.error(t("state.error"));'),
    );
  });

  it("the e-mail switch (its own preferences row): the same", () => {
    const email = handler(source, "const toggleEmail = async", "return (");
    expect(email).toContain("catch (error)");
    expect(email).toContain(
      stepUpThen("isMfaStepUpError(error)", 'toast.error(t("state.error"));'),
    );
  });
});

describe("Pronostics, a league's page (/pronostics/ligues/$leagueId)", () => {
  const source = code("src/components/predictions/leagues/LeaguePage.tsx");

  it("a new invite code or leaving: the step-up sentence is toasted once, not also as an error", () => {
    expect(source).toContain(IMPORT);
    const onWriteError = handler(source, "const onWriteError = ", "const reset = useMutation");
    expect(onWriteError).toContain(
      stepUpThen('code === "mfa_required"', "toast.error(leagueErrorMessage(code, t));"),
    );
    // Both writes go through it; nothing toasts `leagueErrorMessage` on its own.
    expect(source.match(/onError: onWriteError,/g)).toHaveLength(2);
    expect(source.match(/toast\.error\(leagueErrorMessage/g)).toHaveLength(1);
  });
});

describe("Pronostics, the league forms (/pronostics?tab=ligues)", () => {
  // `UiInput` marks a field with an error `aria-invalid`: the step-up sentence
  // there said, a second time, that the code or the name typed was wrong.
  for (const [form, typed] of [
    ["JoinLeagueForm", "the invite code typed"],
    ["CreateLeagueForm", "the league name typed"],
  ] as const) {
    it(`${form}: a code owed is the notice, and ${typed} is not marked invalid`, () => {
      const source = code(`src/components/predictions/leagues/${form}.tsx`);
      expect(source).toContain(IMPORT);
      const onError = handler(source, "onError: (failure) => {", "},");
      expect(onError).toContain("const refusal = mapPredictionsError(failure).code;");
      expect(onError).toContain(
        stepUpThen('refusal === "mfa_required"', "setError(leagueErrorMessage(refusal, t));"),
      );
      // Every other refusal still reaches the field, and only through that arm.
      expect(source.match(/setError\(leagueErrorMessage/g)).toHaveLength(1);
    });
  }
});
