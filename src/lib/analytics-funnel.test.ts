import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The sign-up funnel's events (landing → account → first saved team) fire at
 * the moments they name, and only there. Source-shape assertions, like
 * `launch-sequence.test.ts`: a completion is counted after the server said
 * yes, never on the click that asked it.
 */
const repoRoot = join(import.meta.dir, "..", "..");
const code = (relative: string) =>
  readFileSync(join(repoRoot, relative), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

const after = (source: string, anchor: string, event: string) => {
  const at = source.indexOf(anchor);
  expect(at).toBeGreaterThan(-1);
  const fired = source.indexOf(`track("${event}")`, at);
  expect(fired).toBeGreaterThan(at);
  return fired - at;
};

describe("sign-up funnel events", () => {
  test("each is fired exactly once in the code base", () => {
    const sources = [
      "src/routes/auth.register.tsx",
      "src/routes/auth.verify.tsx",
      "src/routes/auth.callback.tsx",
      "src/routes/auth.profile-setup.tsx",
      "src/routes/fantasy.create.tsx",
    ].map(code);
    const count = (event: string) => sources.join("\n").split(`track("${event}")`).length - 1;
    expect(count("signup_submitted")).toBe(1);
    expect(count("signup_verified")).toBe(2); // the code, and the e-mail link
    expect(count("profile_setup_complete")).toBe(1);
    expect(count("fantasy_team_created")).toBe(1);
  });

  test("a registration is counted once the server accepted it, not on submit", () => {
    const source = code("src/routes/auth.register.tsx");
    expect(after(source, "if (!res.ok) {", "signup_submitted")).toBeGreaterThan(0);
  });

  test("a verification is counted after the code was accepted", () => {
    const source = code("src/routes/auth.verify.tsx");
    expect(after(source, "if (!res.ok) {", "signup_verified")).toBeGreaterThan(0);
  });

  test("an e-mail link counts only a sign-up confirmation", () => {
    const source = code("src/routes/auth.callback.tsx");
    expect(source).toContain('if (otpType === "signup") track("signup_verified");');
  });

  test("onboarding is counted for a first setup, not for a later profile edit", () => {
    const source = code("src/routes/auth.profile-setup.tsx");
    expect(source).toContain("const firstSetup = user?.profileComplete === false;");
    expect(source).toContain('if (firstSetup) track("profile_setup_complete");');
    expect(source.indexOf("const firstSetup")).toBeLessThan(
      source.indexOf("authService.completeProfile("),
    );
  });

  test("a team is counted on the server's confirmation, not on the draft", () => {
    const source = code("src/routes/fantasy.create.tsx");
    const ok = source.indexOf("if (res.ok) {");
    const fired = source.indexOf('track("fantasy_team_created")');
    expect(ok).toBeGreaterThan(-1);
    expect(fired).toBeGreaterThan(ok);
    expect(fired - ok).toBeLessThan(200);
  });

  test("the landing page counts visitors without an account, and only the 'create' action", () => {
    const source = code("src/components/landing/LandingPage.tsx");
    expect(source).toContain('if (cta.kind === "create" && signedOutStatus(status)) track(event);');
    for (const placement of ["header", "hero", "final", "sticky"]) {
      expect(source).toContain(`event="landing_cta_${placement}"`);
    }
    expect(source).toContain('track("landing_view")');
    // Visitors without an account only: a manager on /jouer is not in the funnel.
    expect(source).toContain('return status === "anonymous" || status === "guest";');
    expect(source).toMatch(/if \(!measured \|\| viewTracked\.current\) return;/);
  });
});
