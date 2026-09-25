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
 * the Fantasy chain -- repository, adapter, mutation controller, classifier --
 * in `src/services/fantasy-owned-step-up.test.ts`, and the Fantasy league
 * writes in `src/services/fantasy-leagues-step-up.test.ts`. These pin that
 * each write path branches on it before its own toast. Source-level, like
 * `auth-second-factor.test.ts`: the handlers live inside screens that need a
 * router and a DOM to run, and the repository tests neither.
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
 * A stale version reloads the team. The conflict reaches these screens typed:
 * the adapter types the transfer and chip refusals itself
 * (`fantasy-owned-step-up.test.ts` runs that), so the screens call it bare.
 */
const RELOAD_ON_CONFLICT = "if (c.isConflict) await owned.reload();";

describe("Fantasy, Transfers (/fantasy/transfers)", () => {
  const source = code("src/routes/fantasy.transfers.tsx");

  it("imports the shared notice", () => {
    expect(source).toContain(IMPORT);
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
    expect(confirm).toContain(RELOAD_ON_CONFLICT);
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
    expect(activate).toContain('"fantasy.error.version_conflict"');
    expect(activate).toContain(RELOAD_ON_CONFLICT);
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

describe("Fantasy, the leagues (/fantasy/leagues and below)", () => {
  // The refusal reaches these screens as the Fantasy repository's error, with
  // the server's answer as its `cause` (run in `fantasy-leagues-step-up.test.ts`).
  const TEST = 'import { isMfaStepUpError } from "@/backend/auth/step-up";';

  it("creating one: a code owed is not 'Une erreur est survenue'", () => {
    const source = code("src/routes/fantasy.leagues.tsx");
    expect(source).toContain(IMPORT);
    expect(source).toContain(TEST);
    const create = handler(source, "const createLeague = async", "return (");
    expect(create).toContain("catch (error)");
    expect(create).toContain(
      stepUpThen("isMfaStepUpError(error)", 'toast.error(t("state.error"));'),
    );
  });

  it("leaving one: the same", () => {
    const source = code("src/routes/fantasy.leagues.$leagueId.tsx");
    expect(source).toContain(IMPORT);
    expect(source).toContain(TEST);
    const leave = handler(source, "const leave = async", "const updated =");
    expect(leave).toContain("catch (error)");
    expect(leave).toContain(
      stepUpThen("isMfaStepUpError(error)", 'toast.error(t("state.error"));'),
    );
  });

  it("joining, with a code or a public one: a code owed is the notice, and nothing is marked invalid", () => {
    // `invalid` reads "Code invalide…" under the code field, and "Une erreur
    // est survenue" in the public tab's alert.
    const source = code("src/routes/fantasy.leagues.join.tsx");
    expect(source).toContain(IMPORT);
    expect(source).toContain(TEST);
    const joinPrivate = handler(source, "const joinPrivate = async", "const joinPublic = async");
    expect(joinPrivate).toContain(stepUpThen("isMfaStepUpError(error)", "setInvalid(true);"));
    const joinPublic = handler(source, "const joinPublic = async", "if (joined)");
    expect(joinPublic).toContain(stepUpThen("isMfaStepUpError(error)", "setInvalid(true);"));
    // Every other refusal still marks it, and only through those two arms.
    expect(source.match(/setInvalid\(true\)/g)).toHaveLength(2);
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
