import { afterEach, describe, expect, it, spyOn } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { MutationObserver, QueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { STEP_UP_TOAST_ID } from "@/auth/step-up-notice";
import { PredictionsError } from "@/backend/predictions/errors";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { predictionsService } from "@/services/predictions";
import { isLeagueOwner, leagueInviteMutation } from "./fantasy.leagues.$leagueId";

/**
 * BG-0157 (4) — a private Fantasy league can invite, and leaving asks first.
 *
 * - The invite, from the owner's confirmation to the code on screen, runs
 *   here through React Query's own mutation observer over the Pronostics
 *   reset call stubbed (one league serves both games; the mock repository
 *   does not hold the Fantasy sample leagues, so the success path cannot run
 *   in local mock mode).
 * - The screen's wiring (who sees what, that only a confirmation calls the
 *   reset or `leave()`, that "Annuler" only closes) is pinned at the source,
 *   like `step-up-screens.test.ts`: the page needs a router, the Fantasy
 *   screen gate and a DOM to press anything, and the tests have no DOM.
 * - The wording is the brief's, in both languages.
 */

const fr = dictionaries.fr;
const ar = dictionaries.ar;
const LEAGUE = "00000000-0000-4000-8000-000000000301";
const NEW_CODE = "9F2C4E1A7B3D5C6E8A0B1C2D3E4F5A6B";

const ROOT = join(import.meta.dir, "..", "..");
/** Source without comments, whitespace collapsed, so layout cannot trip a rule. */
function code(path: string): string {
  return readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1")
    .replace(/\s+/g, " ");
}

const spies: Array<{ mockRestore: () => void }> = [];
afterEach(() => {
  while (spies.length) spies.pop()?.mockRestore();
});

/** The owner confirms "Inviter des amis"; the server answers `reply`. */
async function confirmInvite(reply: () => Promise<{ leagueId: string; inviteCode: string }>) {
  const reset = spyOn(predictionsService, "resetInviteCode").mockImplementation(reply);
  const error = spyOn(toast, "error").mockImplementation(() => 0);
  const message = spyOn(toast, "message").mockImplementation(() => 0);
  spies.push(reset, error, message);
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false } } });
  const invalidate = spyOn(queryClient, "invalidateQueries");
  spies.push(invalidate);
  const codes: string[] = [];
  const observer = new MutationObserver(
    queryClient,
    leagueInviteMutation(LEAGUE, {
      t: (key: TranslationKey) => fr[key],
      queryClient,
      onCode: (value) => codes.push(value),
    }),
  );
  await observer.mutate().catch(() => undefined);
  return { reset, error, message, invalidate, codes };
}

describe("who may invite", () => {
  it("the owner (the server's 'owner', the mock store's 'creator'), and no one else", () => {
    expect(isLeagueOwner({ role: "owner" })).toBe(true);
    expect(isLeagueOwner({ role: "creator" })).toBe(true);
    // The database checks `owner_user_id`: an admin cannot issue a code.
    expect(isLeagueOwner({ role: "admin" })).toBe(false);
    expect(isLeagueOwner({ role: "member" })).toBe(false);
    expect(isLeagueOwner({})).toBe(false);
    expect(isLeagueOwner(undefined)).toBe(false);
  });
});

describe("the owner's invite, once confirmed", () => {
  it("asks the server for a new code for this league and hands it to the screen", async () => {
    const run = await confirmInvite(async () => ({ leagueId: LEAGUE, inviteCode: NEW_CODE }));
    expect(run.reset).toHaveBeenCalledTimes(1);
    expect(run.reset).toHaveBeenCalledWith(LEAGUE);
    expect(run.codes).toEqual([NEW_CODE]);
    expect(run.invalidate).toHaveBeenCalledWith({ queryKey: ["predictions", "league", LEAGUE] });
    expect(run.error).not.toHaveBeenCalled();
    expect(run.message).not.toHaveBeenCalled();
  });

  for (const refusal of [
    new PredictionsError("league_access_denied", "league_access_denied"),
    new PredictionsError("predictions_unavailable", "predictions_unavailable"),
    // What supabase-js hands back for a refusal raised by the function itself.
    { code: "PT403", message: "predictions_unavailable", details: null, hint: null },
    new TypeError("Failed to fetch"),
  ]) {
    it(`a refusal (${(refusal as { message: string }).message}) is said in plain words`, async () => {
      const run = await confirmInvite(() => Promise.reject(refusal));
      expect(run.codes).toEqual([]);
      expect(run.error).toHaveBeenCalledTimes(1);
      expect(run.error).toHaveBeenCalledWith(fr["fantasy.leagues.invite_failed"]);
      expect(run.message).not.toHaveBeenCalled();
    });
  }

  for (const refusal of [
    new PredictionsError("mfa_required", "Confirm the second factor to continue."),
    { code: "PT403", message: "mfa_required", details: null, hint: null },
  ]) {
    it(`a code owed (${refusal instanceof Error ? "mapped" : "raw"}) is the step-up notice, once`, async () => {
      const run = await confirmInvite(() => Promise.reject(refusal));
      expect(run.codes).toEqual([]);
      expect(run.message).toHaveBeenCalledWith(fr["auth.step_up.toast"], { id: STEP_UP_TOAST_ID });
      expect(run.error).not.toHaveBeenCalled();
    });
  }
});

describe("the league page (/fantasy/leagues/$leagueId)", () => {
  const source = code("src/routes/fantasy.leagues.$leagueId.tsx");
  const from = (start: string, end: string) => {
    const at = source.indexOf(start);
    expect({ start, found: at > -1 }).toEqual({ start, found: true });
    const to = source.indexOf(end, at + start.length);
    expect({ end, found: to > at }).toEqual({ end, found: true });
    return source.slice(at, to);
  };
  const foot = from('leagueQ.data?.type === "private" ? (', ") : null} </> ) : (");

  it("a private league only: the owner gets the invite, anyone else one quiet line", () => {
    expect(foot).toContain("isLeagueOwner(leagueQ.data) ? (");
    const owner = from("isLeagueOwner(leagueQ.data) ? (", ") : ( <p");
    expect(owner).toContain('variant="ink"');
    expect(owner).toContain('{t("fantasy.leagues.invite_friends")}');
    expect(owner).toContain("onClick={() => setConfirmInvite(true)}");
    // The new code grouped in fours (as on the leagues page), then the share
    // buttons without a second copy of the code; focused when it arrives.
    expect(owner).toContain('<LeagueInviteCode code={inviteCode} once className="mt-0" />');
    expect(owner).toContain(
      '<InviteLinkShare game="fantasy" league={leagueQ.data.name} code={inviteCode} />',
    );
    expect(owner).not.toContain("showCode");
    expect(owner).toContain("ref={shared} tabIndex={-1}");
    expect(source).toContain("if (inviteCode) shared.current?.focus();");
    expect(owner).not.toContain("fantasy.leagues.invite_owner_only");
    const member = from(") : ( <p", "</p>");
    expect(member).toContain('{t("fantasy.leagues.invite_owner_only")}');
    expect(member).toContain("ui.tone.muted");
    expect(member).not.toContain("<UiButton");
  });

  it("the invite's confirmation is the only thing that asks for a new code", () => {
    expect(source.match(/invite\.mutate\(\)/g)).toHaveLength(1);
    const modal = from("open={confirmInvite}", "/>");
    expect(modal).toContain('description={t("fantasy.leagues.invite_confirm")}');
    expect(modal).toContain("setConfirmInvite(false); invite.mutate();");
    expect(modal).toContain(
      '<UiButton variant="ghost" size="sm" onClick={() => setConfirmInvite(false)}> {t("common.cancel")}',
    );
  });

  it("'Quitter la ligue' stays at the foot, and only opens a confirmation naming the league", () => {
    const button = from('<UiButton variant="outline"', "</UiButton>");
    expect(button).toContain("onClick={() => setConfirmLeave(true)}");
    expect(button).toContain('{t("fpl.leave_league")}');
    // The leave button comes after the invite and the member line.
    expect(foot.indexOf('<UiButton variant="outline"')).toBeGreaterThan(
      foot.indexOf("fantasy.leagues.invite_owner_only"),
    );
    const modal = from("open={confirmLeave}", "/> </> ) : null}");
    expect(modal).toContain(
      'title={withLeagueName(t("fantasy.leagues.leave_title"), leagueQ.data.name)}',
    );
    expect(modal).toContain('description={t("fantasy.leagues.leave_body")}');
    expect(modal).toContain('variant="destructive"');
  });

  it("never offers 'Quitter la ligue' to the owner, whom the server refuses", () => {
    // api.leave_fantasy_league only removes a member whose role is not owner.
    const leave = from("{isLeagueOwner(leagueQ.data) ? null : (", "</UiButton>");
    expect(leave).toContain('{t("fpl.leave_league")}');
    expect(source.match(/t\("fpl\.leave_league"\)/g)).toHaveLength(2);
  });

  it("returns focus to the control that opened each confirmation", () => {
    expect(source).toContain("onCloseAutoFocus={refocus(inviteOpener)}");
    expect(source).toContain("onCloseAutoFocus={refocus(leaveOpener)}");
  });

  it("after leaving goes to the leagues list, not back in history", () => {
    expect(source).toContain('void navigate({ to: "/fantasy/leagues", replace: true });');
    expect(source).not.toContain("history.back()");
  });

  it("only the confirmation's destructive button calls leave(); 'Annuler' only closes", () => {
    expect(source.match(/leave\(\)/g)).toHaveLength(1);
    const modal = from("open={confirmLeave}", "/> </> ) : null}");
    expect(modal).toContain(
      'variant="destructive" onClick={() => { setConfirmLeave(false); void leave(); }} > {t("fpl.leave_league")}',
    );
    expect(modal).toContain(
      '<UiButton variant="ghost" size="sm" onClick={() => setConfirmLeave(false)}> {t("common.cancel")}',
    );
  });

  it("names the league with its own direction isolated", () => {
    const helper = from("function withLeagueName(", "</> );");
    expect(helper).toContain('template.split("{league}")');
    expect(helper).toContain("<bdi>{name}</bdi>");
  });
});

describe("the leagues page (/fantasy/leagues)", () => {
  const source = code("src/routes/fantasy.leagues.tsx");

  it("the create toggle is 'Créer une ligue' with a plus, not a cog called 'Gérer les ligues'", () => {
    expect(source).toContain(
      '<Plus className="h-4 w-4 shrink-0" aria-hidden /> <span className="line-clamp-2 whitespace-normal text-balance"> {t("fpl.create_league")} </span>',
    );
    expect(source).not.toContain("fpl.configure_leagues");
    expect(source).not.toMatch(/\bSettings\b/);
  });

  it("the form's button says 'Créer'", () => {
    expect(source).toContain('{busy ? t("fpl.saving") : t("fantasy.leagues.create_submit")}');
  });

  it("after creation the share buttons follow the code, in their own card", () => {
    const share = '<InviteLinkShare game="fantasy" league={created.name} code={created.code} />';
    expect(source).toContain(share);
    // Under the form's card, not inside it, and not a second copy of the code.
    expect(source.indexOf(share)).toBeGreaterThan(source.indexOf("</form> </UiCard>"));
    expect(source).toContain("<LeagueInviteCode code={created.code} />");
    expect(source).not.toMatch(/<InviteLinkShare[^>]*showCode/);
  });
});

describe("the wording (brief BG-0157, improvement 4)", () => {
  const cases: Array<[TranslationKey, string, string]> = [
    ["fantasy.leagues.invite_friends", "Inviter des amis", "ادعُ أصدقاءك"],
    [
      "fantasy.leagues.invite_confirm",
      "Un nouveau code est créé pour inviter vos amis. L'ancien code ne fonctionnera plus.",
      "سيُنشأ رمز جديد لدعوة أصدقائك، ولن يعمل الرمز القديم بعد الآن.",
    ],
    [
      "fantasy.leagues.invite_failed",
      "Impossible de créer un lien d'invitation pour le moment.",
      "تعذّر إنشاء رابط دعوة الآن.",
    ],
    [
      "fantasy.leagues.invite_owner_only",
      "Seul le créateur de la ligue peut inviter de nouveaux membres.",
      "وحده منشئ الدوري يمكنه دعوة أعضاء جدد.",
    ],
    ["fantasy.leagues.leave_title", "Quitter « {league} » ?", "مغادرة «{league}»؟"],
    [
      "fantasy.leagues.leave_body",
      "Vous disparaîtrez de son classement. Pour revenir, il vous faudra un code d'invitation.",
      "ستختفي من ترتيبه، ولن تعود إليه إلا برمز دعوة.",
    ],
    ["fantasy.leagues.create_submit", "Créer", "إنشاء"],
    ["fpl.create_league", "Créer une ligue", "إنشاء دوري"],
    ["fpl.leave_league", "Quitter la ligue", "مغادرة الدوري"],
  ];
  for (const [key, french, arabic] of cases) {
    it(key, () => {
      expect(fr[key]).toBe(french);
      expect(ar[key]).toBe(arabic);
    });
  }

  it("the join screen points to the button by its name, in both languages", () => {
    expect(fr["fpl.create_own_league"]).toContain(`« ${fr["fpl.create_league"]} »`);
    expect(ar["fpl.create_own_league"]).toContain(`«${ar["fpl.create_league"]}»`);
    expect(fr["fpl.create_own_league"]).not.toContain("Gérer les ligues");
    expect(ar["fpl.create_own_league"]).not.toContain("إدارة الدوريات");
  });
});
