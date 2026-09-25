import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { Route as LoginRoute } from "./auth.login";
import { Route as MfaRoute } from "./auth.mfa-challenge";
import { Route as ProfileSetupRoute } from "./auth.profile-setup";
import { Route as RegisterRoute } from "./auth.register";
import { Route as VerifyRoute } from "./auth.verify";

/**
 * Every auth screen that takes a `next` destination must keep it on this
 * site. The live login page (audit 2026-09-24, P1-1) had its own prefix-only
 * check, which the strings below pass: each starts with one "/", yet a
 * browser resolves it to another site. These run the routes' own
 * `validateSearch`, the step that turns the address bar into the `next` the
 * page later navigates to.
 */
const offSite = [
  "https://attacker.invalid",
  "//attacker.invalid",
  "/\\attacker.invalid",
  "/\\/attacker.invalid",
  "/\t/attacker.invalid",
  "/\n/attacker.invalid",
  "/\r//attacker.invalid",
  "javascript:alert(1)",
  "data:text/html,<script>alert(1)</script>",
];

const routes = {
  login: LoginRoute,
  register: RegisterRoute,
  verify: VerifyRoute,
  "mfa-challenge": MfaRoute,
  "profile-setup": ProfileSetupRoute,
} as const;

type Validator = (search: Record<string, unknown>) => { next?: string };

function validatorOf(route: { options: unknown }): Validator {
  return (route.options as { validateSearch: Validator }).validateSearch;
}

describe("auth redirects stay on BotolaGO", () => {
  for (const [name, route] of Object.entries(routes)) {
    test(`/auth/${name} overwrites every off-site next`, () => {
      const validate = validatorOf(route);
      for (const candidate of offSite) {
        const raw = { next: candidate, email: "fan@example.test" };
        // The router lays the validated search over the raw query, exactly
        // like this spread: a `next` left out would survive from `raw`.
        const seen = { ...raw, ...validate(raw) };
        const landing = new URL(seen.next ?? "/", "https://botolago.com/auth/" + name);
        expect({ candidate, origin: landing.origin }).toEqual({
          candidate,
          origin: "https://botolago.com",
        });
        expect(seen.next).toBeUndefined();
      }
    });

    test(`/auth/${name} keeps an ordinary destination`, () => {
      expect(validatorOf(route)({ next: "/fantasy/team", email: "fan@example.test" }).next).toBe(
        "/fantasy/team",
      );
    });
  }

  test("the e-mail callback reads next through the same sanitiser", () => {
    const source = readFileSync(join(import.meta.dir, "auth.callback.tsx"), "utf8");
    expect(source).toContain('sanitizeAuthCallbackNext(params.get("next"))');
    expect(source).not.toMatch(/searchParams\.get\("next"\)(?!\))/);
  });

  test("no route keeps a private redirect check of its own", () => {
    const offenders = readdirSync(import.meta.dir)
      .filter((file) => file.endsWith(".tsx"))
      .filter((file) =>
        /function sanitize\w*Next|startsWith\("\/\/"\)/.test(
          readFileSync(join(import.meta.dir, file), "utf8"),
        ),
      );
    expect(offenders).toEqual([]);
  });
});
