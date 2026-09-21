import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { DARK_MODE_ENABLED, NEWS_ENABLED, OAUTH_PROVIDERS_ENABLED } from "@/lib/feature-flags";
import { primaryNavItems } from "@/components/shell/primary-nav";

/**
 * BG-0091 — News is hidden at launch (owner decision, 2026-09-21).
 *
 * The decision lives in exactly one exported constant and every News entry
 * point is gated on it. These are source-shape assertions rather than render
 * assertions (this codebase has no React component-test harness — see the
 * BG-0012 builder report), so their job is to catch a surface drifting back
 * out from behind the flag, and to catch a second, ad-hoc copy of the
 * decision appearing somewhere else.
 *
 * Nothing here asserts that the flag is `false`. Flipping it back on is the
 * supported way to ship News later, and these tests must keep passing when it
 * is flipped.
 */
const repoRoot = join(import.meta.dir, "..", "..");
const read = (relative: string) => readFileSync(join(repoRoot, relative), "utf8");

describe("NEWS_ENABLED", () => {
  test("is a single boolean constant", () => {
    expect(typeof NEWS_ENABLED).toBe("boolean");
  });

  test("the decision is recorded once, with its owner and date", () => {
    const source = read("src/lib/feature-flags.ts");
    expect(source).toContain("Owner decision, 2026-09-21 (BG-0091)");
    expect(source.match(/export const NEWS_ENABLED/g)).toHaveLength(1);
  });

  test("the primary nav offers News only while the flag is on", () => {
    const hasNews = primaryNavItems.some((item) => item.to === "/news");
    expect(hasNews).toBe(NEWS_ENABLED);
  });

  test("the nav filter reads the flag rather than hardcoding the answer", () => {
    const source = read("src/components/shell/primary-nav.ts");
    expect(source).toContain('NEWS_ENABLED || item.to !== "/news"');
  });

  test.each([
    ["src/routes/news.tsx", "beforeLoad: redirectWhileNewsIsHidden"],
    [
      "src/routes/news.$articleId.tsx",
      'if (!NEWS_ENABLED) throw redirect({ to: "/", replace: true });',
    ],
    ["src/routes/fantasy.index.tsx", "{NEWS_ENABLED && ("],
    ["src/routes/profile.tsx", "{NEWS_ENABLED && ("],
    ["src/routes/index.tsx", "{NEWS_ENABLED && ("],
    ["src/lib/saved-articles.ts", "enabled: NEWS_ENABLED &&"],
  ])("%s gates its News surface on the flag", (file, needle) => {
    const source = read(file);
    expect(source).toContain('from "@/lib/feature-flags"');
    expect(source).toContain(needle);
  });

  test("both News routes redirect to Home rather than rendering an empty page", () => {
    for (const file of ["src/routes/news.tsx", "src/routes/news.$articleId.tsx"]) {
      const source = read(file);
      // `beforeLoad` runs before the loader and before any render, on the
      // server render and on client navigation alike: no flash, no News RPC.
      expect(source).toContain("beforeLoad");
      expect(source).toContain('redirect({ to: "/", replace: true })');
    }
  });

  test("News components, routes and services stay in the tree", () => {
    // This is a launch-time hide, not a deletion — the owner may licence
    // content later and switch it back on.
    for (const file of [
      "src/routes/news.tsx",
      "src/routes/news.$articleId.tsx",
      "src/services/news.ts",
      "src/components/news/news-data.ts",
      "src/components/news/LatestFeed.tsx",
      "src/components/news/FeaturedGrid.tsx",
    ]) {
      expect(read(file).length).toBeGreaterThan(0);
    }
  });
});

/**
 * BG-0111 — signup and login rendered Google and Apple buttons against a
 * project with no OAuth provider enabled at all, so every tap landed on
 * `{"error_code":"validation_failed","msg":"Unsupported provider: provider is
 * not enabled"}`. Same shape as News: one constant, every entry point gated on
 * it, nothing deleted. Nothing here asserts the flag is `false` — these must
 * keep passing when a provider is finally enabled and it is flipped.
 */
describe("OAUTH_PROVIDERS_ENABLED", () => {
  test("is a single boolean constant with its evidence recorded", () => {
    expect(typeof OAUTH_PROVIDERS_ENABLED).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source.match(/export const OAUTH_PROVIDERS_ENABLED/g)).toHaveLength(1);
    expect(source).toContain("Unsupported provider: provider is not enabled");
  });

  test.each(["src/routes/auth.login.tsx", "src/routes/auth.register.tsx"])(
    "%s gates its provider buttons on the flag",
    (file) => {
      const source = read(file);
      expect(source).toContain('from "@/lib/feature-flags"');
      expect(source).toContain("{OAUTH_PROVIDERS_ENABLED && (");
      // The divider goes inside the gate: "ou continuer avec" over an empty
      // gap is the same defect wearing a hat.
      const gate = source.indexOf("{OAUTH_PROVIDERS_ENABLED && (");
      expect(source.indexOf("<AuthDivider")).toBeGreaterThan(gate);
    },
  );

  test("the provider marks and copy stay in the tree", () => {
    const shell = read("src/components/auth/AuthShell.tsx");
    expect(shell).toContain("export function GoogleGlyph");
    expect(shell).toContain("export function AppleGlyph");
    const dictionary = read("src/i18n/dictionaries.ts");
    for (const key of ['"auth.google"', '"auth.apple"', '"auth.or_continue_with"']) {
      expect(dictionary).toContain(key);
    }
  });
});

/**
 * BG-0111 — the theme switcher was gated but the row around it was not, so
 * Profile showed an "Apparence" label with nothing under it.
 */
describe("DARK_MODE_ENABLED", () => {
  test("is a single boolean constant", () => {
    expect(typeof DARK_MODE_ENABLED).toBe("boolean");
    expect(read("src/lib/feature-flags.ts").match(/export const DARK_MODE_ENABLED/g)).toHaveLength(
      1,
    );
  });

  test("profile gates the whole Appearance row, label included", () => {
    const source = read("src/routes/profile.tsx");
    expect(source).toContain('from "@/lib/feature-flags"');
    const row = source.slice(source.indexOf("function ThemeRow"));
    const body = row.slice(0, row.indexOf("\n}\n"));
    // The early return is what takes the label and the glyph with it.
    expect(body).toContain("if (!DARK_MODE_ENABLED) return null;");
    expect(body.indexOf("if (!DARK_MODE_ENABLED) return null;")).toBeLessThan(
      body.indexOf('t("theme.switch")'),
    );
  });
});
