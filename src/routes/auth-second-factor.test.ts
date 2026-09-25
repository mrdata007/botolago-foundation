import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * Audit 2026-09-25, A03: the one-time code was a navigation step. The login
 * page treated a failed assurance lookup as a successful sign-in, the e-mail /
 * OAuth callback navigated on without asking at all, and the challenge page's
 * way out walked past it. The decisions themselves are tested as functions in
 * `src/auth/second-factor.test.ts`; these pin that the three screens use them.
 * Source-level, like `auth-redirects.test.ts`: the routes need a router and a
 * DOM to render, and the repository tests neither.
 */

/** Source without comments, so a note that NAMES the old code cannot trip a rule. */
const code = (file: string) =>
  readFileSync(join(import.meta.dir, file), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

describe("/auth/login", () => {
  const login = code("auth.login.tsx");

  it("routes on the status the sign-in returned, through the shared decision", () => {
    expect(login).toContain("secondFactorStep(status)");
    expect(login).toContain("continueAfterAuth(res.status, res.data?.profileComplete)");
  });

  it("no longer runs its own lookup, whose failure it treated as success", () => {
    expect(login).not.toContain("getAssuranceLevels");
    expect(login).not.toContain("requiresLoginChallenge");
  });

  it("stops on the retry panel, with a way to sign out, when the lookup failed", () => {
    expect(login).toContain('case "retry":');
    expect(login).toContain("<AssuranceRetry");
    expect(login).toContain("authService.signOut()");
  });
});

describe("/auth/callback", () => {
  const callback = code("auth.callback.tsx");

  it("decides where to land from the refreshed session's status", () => {
    const refresh = callback.indexOf("await authService.refreshSession()");
    expect(refresh).toBeGreaterThan(-1);
    expect(callback.slice(refresh, refresh + 200)).toContain("land(");
    expect(callback).toContain("secondFactorStep(status)");
    expect(callback).toContain('navigate({ to: "/auth/mfa-challenge", search: { next: to } })');
  });

  it("shows the retry panel instead of navigating when the lookup failed", () => {
    expect(callback).toContain('setError("unconfirmed")');
    expect(callback).toContain("<AssuranceRetry");
  });

  it("still scrubs the URL before any asynchronous work", () => {
    const scrub = callback.indexOf("scrubUrl();", callback.indexOf("const refreshToken"));
    const firstAwait = callback.indexOf("await ", callback.indexOf("const refreshToken"));
    expect(scrub).toBeGreaterThan(-1);
    expect(scrub).toBeLessThan(firstAwait);
  });
});

describe("/auth/mfa-challenge", () => {
  const challenge = code("auth.mfa-challenge.tsx");

  it("lists factors only for a session that owes its code", () => {
    expect(challenge).toContain('if (status !== "mfa_required") return;');
  });

  it("leaves only once the session is complete", () => {
    expect(challenge).toContain('if (status === "authenticated") leave(user);');
    expect(challenge).toContain('if (session.status === "authenticated") leave(session.user);');
  });

  it("the way on without a factor asks the server again, and is labelled for what it does", () => {
    expect(challenge).not.toContain('onClick={() => navigate({ to: "/" })}');
    expect(challenge).toContain("onClick={() => void recheck(true)}");
    // Was "Continuer sans vérification", which it no longer does.
    expect(challenge).toContain('t("auth.mfa_challenge.recheck")');
    expect(challenge).not.toContain("continue_without");
    // A recheck that still owes a code says so, instead of the first message again.
    expect(challenge).toContain('"auth.mfa_challenge.error_still_owed"');
  });

  it("always offers a way to sign out, and the retry panel when the lookup failed", () => {
    expect(challenge).toContain('t("profile.sign_out")');
    expect(challenge).toContain('status === "mfa_unconfirmed" ? (');
  });
});

describe("/.lovable/oauth/consent", () => {
  // An app asks to act as the reader. The loader can hand an already-approved
  // client its redirect before anything renders, so the second factor has to
  // be checked in `beforeLoad` itself (the rule is `secondFactorGuard`, tested
  // in `src/auth/second-factor.test.ts`).
  const consent = code("[.]lovable.oauth.consent.tsx");

  it("sends a session that owes its code to the challenge before the loader runs", () => {
    const guard = consent.indexOf("await secondFactorGuard(supabase.auth.mfa, location)");
    expect(guard).toBeGreaterThan(consent.indexOf("beforeLoad:"));
    expect(guard).toBeLessThan(consent.indexOf("loader:"));
    expect(consent).toContain("if (owed) throw redirect(owed);");
  });
});
