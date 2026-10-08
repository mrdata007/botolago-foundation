import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import {
  DARK_MODE_ENABLED,
  MANAGER_CARD_BUILD,
  MANAGER_CARD_ENABLED,
  MANAGER_CARD_PREVIEW,
  NEWS_ENABLED,
  OAUTH_PROVIDERS_ENABLED,
  PRIZES_ENABLED,
  PRONOSTICS_ENABLED,
  PRONOSTICS_PROMOTED,
  ANALYTICS_ENABLED,
  PEPITES_ENABLED,
  PEPITES_PROMOTED,
} from "@/lib/feature-flags";
import { SITEMAP_STATIC_PATHS } from "@/lib/sitemap";
import { liveNavItems, primaryNavItems } from "@/components/shell/primary-nav";

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

/**
 * Block and line comments removed, so an assertion about CODE cannot be
 * satisfied by prose. Crude on purpose: it does not understand strings or
 * regex literals, which is acceptable because the only thing read out of the
 * result is whether an identifier appears.
 */
const stripComments = (source: string): string =>
  source.replace(/\/\*[\s\S]*?\*\//g, " ").replace(/\/\/[^\n]*/g, " ");

/**
 * Every shipped `.ts`/`.tsx` under `src/`, repo-relative, tests excluded — a
 * test that references the News service is describing it, not exposing it.
 */
const sourceFiles = (): string[] =>
  readdirSync(join(repoRoot, "src"), { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry) && !/\.test\.tsx?$/.test(entry))
    .map((entry) => join("src", entry))
    .sort();

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
    ["src/routes/matches.$matchId.tsx", "{NEWS_ENABLED && related.length > 0 && ("],
    ["src/routes/clubs.$clubId.tsx", "enabled: NEWS_ENABLED && validId"],
    ["src/components/clubs/ClubOverview.tsx", "{NEWS_ENABLED && ("],
  ])("%s gates its News surface on the flag", (file, needle) => {
    const source = read(file);
    expect(source).toContain('from "@/lib/feature-flags"');
    expect(source).toContain(needle);
  });

  /**
   * The list above is maintained by hand, and the match page proves a hand-kept
   * list is not enough: it called `newsService.getArticles` on every fixture and
   * nobody noticed, because the stand-down had emptied the feed and an empty
   * section is indistinguishable from a gated one until the first article is
   * published.
   *
   * So this asserts the property instead of the enumeration. Anything that
   * CALLS the News service is a News surface by definition and must reference
   * the flag. A new consumer added without a gate fails here on the day it is
   * written, not on the day an editor clicks publish.
   */
  test("every newsService caller references the flag", () => {
    const callers = sourceFiles().filter((file) => {
      const source = read(file);
      // The module that DEFINES the service is not a surface that exposes it,
      // and it names itself in its own comments. Excluded by identity rather
      // than by a hardcoded path, so moving the file does not silently widen
      // this test's blind spot to whatever lands at the old one.
      if (/^export const newsService\b/m.test(source)) return false;
      return /\bnewsService\s*\./.test(source);
    });
    // If this ever reads 0 the regex has drifted and the test is vacuous.
    expect(callers.length).toBeGreaterThan(0);
    // Comments are stripped first. Every gated file explains itself in prose
    // that names the flag, so matching raw source would let a file satisfy
    // this test with a comment saying it is gated while the code is not --
    // which is precisely the failure mode being tested for. Verified by
    // removing the gate from the match route and watching this go red.
    const ungated = callers.filter((file) => !/\bNEWS_ENABLED\b/.test(stripComments(read(file))));
    expect(ungated).toEqual([]);
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
    // One file per language since the Arabic dictionary is loaded on demand:
    // the copy has to stay in both.
    for (const file of ["src/i18n/dictionary-fr.ts", "src/i18n/dictionary-ar.ts"]) {
      const dictionary = read(file);
      for (const key of ['"auth.google"', '"auth.apple"', '"auth.or_continue_with"']) {
        expect(`${file} ${key}: ${dictionary.includes(key)}`).toBe(`${file} ${key}: true`);
      }
    }
  });
});

/**
 * BG-0111 — the theme switcher was gated but the row around it was not, so
 * Profile showed an "Apparence" label with nothing under it.
 *
 * BG-0149 — dark mode is ON (owner decision, 2026-10-05). Like the blocks
 * above, nothing here asserts the value: the flag is the one-line rollback
 * switch, so these must pass with it either way. They pin that every place
 * the flag gates still reads it, so flipping it back really does restore
 * light for everyone.
 */
describe("DARK_MODE_ENABLED", () => {
  test("is a single boolean constant, recorded with the owner decision", () => {
    expect(typeof DARK_MODE_ENABLED).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source.match(/export const DARK_MODE_ENABLED/g)).toHaveLength(1);
    expect(source).toContain("Owner decision, 2026-10-05 (BG-0149)");
  });

  test("its comment keeps the list of gated places, and each of them reads the flag", () => {
    const source = read("src/lib/feature-flags.ts");
    const comment = source.slice(
      source.lastIndexOf("/**", source.indexOf("export const DARK_MODE_ENABLED")),
      source.indexOf("export const DARK_MODE_ENABLED"),
    );
    for (const file of [
      "src/routes/__root.tsx",
      "src/theme/provider.tsx",
      "src/routes/profile.tsx",
    ]) {
      expect(comment).toContain(`\`${file}\``);
      expect(stripComments(read(file))).toContain("DARK_MODE_ENABLED");
    }
  });

  test("the pre-paint theme script is in the head only behind the flag", () => {
    const root = stripComments(read("src/routes/__root.tsx"));
    expect(root).toContain("...(DARK_MODE_ENABLED ? [{ children: THEME_INIT_SCRIPT }] : [])");
    // …and nowhere else: a second, ungated copy would serve dark mode to
    // every dark phone with the flag off.
    expect(root.match(/THEME_INIT_SCRIPT/g)).toHaveLength(2); // the import and the gated use
  });

  test("the provider's three effects and the cross-fade all check the flag", () => {
    const provider = stripComments(read("src/theme/provider.tsx"));
    // Storage adoption, class application and the OS listener each return
    // early while the flag is off.
    expect(provider.match(/if \(!DARK_MODE_ENABLED\b/g)).toHaveLength(3);
    expect(provider).toContain("if (DARK_MODE_ENABLED) withViewTransition(");
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

/**
 * Fantasy prizes (owner decision, 2026-09-24): the public pages, the hub row
 * and the first-visit welcome show only while the flag is on. Like the News
 * block above, nothing here asserts the value -- flipping it is the supported
 * way to launch or withdraw them -- only that every surface reads it.
 */
describe("PRIZES_ENABLED", () => {
  test("is a single boolean constant, recorded once with its owner and date", () => {
    expect(typeof PRIZES_ENABLED).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source).toContain("Owner decision, 2026-09-24");
    expect(source.match(/export const PRIZES_ENABLED/g)).toHaveLength(1);
  });

  test.each([
    ["src/routes/prizes.index.tsx", "beforeLoad: redirectWhilePrizesAreHidden"],
    [
      "src/routes/prizes.index.tsx",
      'if (!PRIZES_ENABLED) throw redirect({ to: "/fantasy", replace: true });',
    ],
    [
      "src/routes/prizes.terms.tsx",
      'if (!PRIZES_ENABLED) throw redirect({ to: "/fantasy", replace: true });',
    ],
    // The welcome also waits for the owner's dashboard (audit 2026-09-25,
    // A16); the flag still gates it first.
    ["src/routes/fantasy.index.tsx", "{PRIZES_ENABLED && layout.prizeWelcome && <PrizeWelcome />}"],
    // The proposition's prize line reads the catalog only while the flag is on.
    ["src/routes/fantasy.index.tsx", "enabled: PRIZES_ENABLED && layout.intro !== null"],
    ["src/routes/fantasy.index.tsx", "...(PRIZES_ENABLED"],
    ["src/lib/sitemap.ts", "...(PRIZES_ENABLED ?"],
  ])("%s gates its prize surface on the flag", (file, needle) => {
    const source = stripComments(read(file));
    expect(source).toContain('from "@/lib/feature-flags"');
    expect(source).toContain(needle);
  });

  test("the production legal gate reads the flag for the prize terms", () => {
    const source = stripComments(read("scripts/qa/legal-placeholder-gate.ts"));
    expect(source).toContain("includePrizeTerms: boolean = PRIZES_ENABLED");
  });

  test("the sitemap lists the prize pages only while they are on", () => {
    const listed = (SITEMAP_STATIC_PATHS as readonly string[]).includes("/prizes");
    expect(listed).toBe(PRIZES_ENABLED);
  });

  test("the admin console is not gated: the catalog is prepared before launch", () => {
    const source = stripComments(read("src/routes/admin.prizes.tsx"));
    expect(source).not.toContain("PRIZES_ENABLED");
  });
});

/**
 * BG-0146 — Pronostics. Two build flags; the database `mode` is the real gate.
 * Like the others, these assert that each surface READS the flag, and they
 * keep passing whichever way the flags are set.
 */
describe("PRONOSTICS_ENABLED / PRONOSTICS_PROMOTED", () => {
  test("are single boolean constants, recorded once with the decision", () => {
    expect(typeof PRONOSTICS_ENABLED).toBe("boolean");
    expect(typeof PRONOSTICS_PROMOTED).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source.match(/export const PRONOSTICS_ENABLED/g)).toHaveLength(1);
    expect(source.match(/export const PRONOSTICS_PROMOTED/g)).toHaveLength(1);
    expect(source).toContain("BG-0146");
  });

  test("the /pronostics routes redirect Home while the page is off", () => {
    const source = stripComments(read("src/routes/pronostics.tsx"));
    expect(source).toContain(
      'if (!PRONOSTICS_ENABLED) throw redirect({ to: "/", replace: true });',
    );
    expect(source).toContain("beforeLoad: redirectWhilePronosticsAreHidden");
  });

  test.each([
    ["src/routes/pronostics.index.tsx", "PRONOSTICS_PROMOTED && loaderData?.indexable"],
    ["src/lib/sitemap.ts", "...(PRONOSTICS_PROMOTED ?"],
    ["src/routes/index.tsx", "{PRONOSTICS_PROMOTED && ("],
    ["src/components/matches/MatchesTabs.tsx", "...(PRONOSTICS_PROMOTED"],
    ["src/routes/matches.$matchId.tsx", "{PRONOSTICS_PROMOTED && wideLayout && ("],
    ["src/routes/fantasy.leagues.$leagueId.tsx", "...(PRONOSTICS_PROMOTED"],
  ])("%s gates its entry point on PRONOSTICS_PROMOTED", (file, needle) => {
    const source = stripComments(read(file));
    expect(source).toContain('from "@/lib/feature-flags"');
    expect(source).toContain(needle);
  });

  test("the sitemap lists /pronostics only once promoted", () => {
    const listed = (SITEMAP_STATIC_PATHS as readonly string[]).includes("/pronostics");
    expect(listed).toBe(PRONOSTICS_PROMOTED);
  });

  test("no other source file mentions the promoted flag", () => {
    const allowed = new Set([
      "src/lib/feature-flags.ts",
      "src/routes/pronostics.index.tsx",
      "src/lib/sitemap.ts",
      "src/routes/index.tsx",
      "src/components/matches/MatchesTabs.tsx",
      "src/routes/matches.$matchId.tsx",
      "src/routes/fantasy.leagues.$leagueId.tsx",
    ]);
    const strays = sourceFiles().filter(
      (file) => !allowed.has(file) && stripComments(read(file)).includes("PRONOSTICS_PROMOTED"),
    );
    expect(strays).toEqual([]);
  });
});

/** Owner-approved Pépites public release; database gates still apply. */
describe("PEPITES_ENABLED / PEPITES_PROMOTED", () => {
  test("exposes the approved pages and navigation in production builds", () => {
    expect(PEPITES_ENABLED).toBe(true);
    expect(PEPITES_PROMOTED).toBe(true);
    expect(primaryNavItems.some((item) => item.to === "/pepites")).toBe(true);
    expect((SITEMAP_STATIC_PATHS as readonly string[]).includes("/pepites")).toBe(true);
  });

  test("the /pepites routes redirect while Pépites is off, the admin ones too", () => {
    expect(stripComments(read("src/routes/pepites.tsx"))).toContain(
      'if (!PEPITES_ENABLED) throw redirect({ to: "/", replace: true });',
    );
    expect(stripComments(read("src/routes/admin.pepites.tsx"))).toContain(
      'if (!PEPITES_ENABLED) throw redirect({ to: "/admin", replace: true });',
    );
  });

  test("no other source file mentions the promoted flag", () => {
    const allowed = new Set([
      "src/lib/feature-flags.ts",
      "src/components/shell/primary-nav.ts",
      "src/components/shell/TopBar.tsx",
      "src/routes/index.tsx",
      "src/lib/sitemap.ts",
      "src/components/pepites/pepites-route.ts",
    ]);
    const strays = sourceFiles().filter(
      (file) => !allowed.has(file) && stripComments(read(file)).includes("PEPITES_PROMOTED"),
    );
    expect(strays).toEqual([]);
  });
});

/**
 * BG-0146 — audience measurement. The script, the page views, the events and
 * the privacy policy's lines about them all read this one switch, so the
 * policy can never describe a tool the build does not load, or the reverse.
 */
describe("ANALYTICS_ENABLED", () => {
  test("is a single boolean constant, recorded once with the decision", () => {
    expect(typeof ANALYTICS_ENABLED).toBe("boolean");
    const source = read("src/lib/feature-flags.ts");
    expect(source.match(/export const ANALYTICS_ENABLED/g)).toHaveLength(1);
  });

  test("measurement needs the switch AND a production build", () => {
    const source = stripComments(read("src/lib/analytics.ts"));
    expect(source).toContain("ANALYTICS_ENABLED && import.meta.env.PROD === true");
  });

  test("the root page loads the script and counts pages only when measuring", () => {
    const source = stripComments(read("src/routes/__root.tsx"));
    expect(source).toContain("...(ANALYTICS_ACTIVE");
    expect(source).toContain("{ANALYTICS_ACTIVE && <AnalyticsPageviews />}");
  });

  test("the privacy policy's analytics lines follow it", () => {
    expect(stripComments(read("src/content/legal/documents.ts"))).toContain("ANALYTICS_ENABLED");
  });

  test("no other source file reads the switch directly", () => {
    const allowed = new Set([
      "src/lib/feature-flags.ts",
      "src/lib/analytics.ts",
      "src/content/legal/documents.ts",
    ]);
    const strays = sourceFiles().filter(
      (file) => !allowed.has(file) && stripComments(read(file)).includes("ANALYTICS_ENABLED"),
    );
    expect(strays).toEqual([]);
  });
});

/**
 * Gradins (the Manager Card section), owner decision 2026-10-08: built behind a switch so that
 * merging and publishing change nothing anyone sees. Unlike the flags above, this one's value IS
 * asserted: shipping it on is the owner's one-line commit, and this test is what tells the
 * reviewer of any other change that the switch is still off.
 */
describe("MANAGER_CARD_ENABLED / MANAGER_CARD_PREVIEW / MANAGER_CARD_BUILD", () => {
  test("the build constant is false", () => {
    expect(MANAGER_CARD_ENABLED).toBe(false);
    expect(read("src/lib/feature-flags.ts")).toContain(
      "export const MANAGER_CARD_ENABLED: boolean = false;",
    );
  });

  test("the preview is the development-only expression, written so Vite can replace it", () => {
    const source = stripComments(read("src/lib/feature-flags.ts"));
    expect(source).toContain(
      'import.meta.env.DEV === true && import.meta.env.VITE_MANAGER_CARD_PREVIEW === "1"',
    );
    // Only the plain form is replaced statically in a production build.
    expect(source).not.toContain("import.meta.env?.");
    expect(MANAGER_CARD_PREVIEW).toBe(false);
  });

  test("the build lets Gradins exist when either layer says so, and is off under test", () => {
    expect(stripComments(read("src/lib/feature-flags.ts"))).toContain(
      "export const MANAGER_CARD_BUILD: boolean = MANAGER_CARD_ENABLED || MANAGER_CARD_PREVIEW;",
    );
    expect(MANAGER_CARD_BUILD).toBe(false);
  });

  test("each constant is declared once, with the decision recorded", () => {
    const source = read("src/lib/feature-flags.ts");
    for (const name of ["MANAGER_CARD_ENABLED", "MANAGER_CARD_PREVIEW", "MANAGER_CARD_BUILD"]) {
      expect(source.match(new RegExp(`export const ${name}\\b`, "g"))).toHaveLength(1);
    }
    expect(source).toContain("Owner decision, 2026-10-08");
  });

  test("the gated surfaces its comment lists exist, and the ones this package owns read the build", () => {
    const source = read("src/lib/feature-flags.ts");
    const comment = source.slice(
      source.lastIndexOf("/**", source.indexOf("export const MANAGER_CARD_ENABLED")),
      source.indexOf("export const MANAGER_CARD_ENABLED"),
    );
    const listed = [...comment.matchAll(/^ \*   - `(src\/[^`]+)`/gm)].map((match) => match[1]!);
    expect(listed).toEqual([
      "src/components/shell/primary-nav.ts",
      "src/routes/__root.tsx",
      "src/routes/gradins.tsx",
      "src/routes/fantasy.index.tsx",
      "src/components/pepites/PepitesHome.tsx",
    ]);
    for (const file of listed) expect(read(file).length).toBeGreaterThan(0);
    expect(stripComments(read("src/components/shell/primary-nav.ts"))).toContain(
      "MANAGER_CARD_BUILD",
    );
    expect(stripComments(read("src/routes/__root.tsx"))).toContain(
      "...(MANAGER_CARD_BUILD ? { beforeLoad: rootBeforeLoad } : {})",
    );
    expect(stripComments(read("src/routes/gradins.tsx"))).toContain("shouldRedirectFromGradins");
  });

  test("no other source file reads the build constant or the preview directly", () => {
    const allowed = new Set([
      "src/lib/feature-flags.ts",
      "src/components/shell/primary-nav.ts",
      "src/routes/__root.tsx",
      "src/services/manager-card-status.ts",
    ]);
    const strays = sourceFiles().filter(
      (file) =>
        !allowed.has(file) &&
        /\bMANAGER_CARD_(ENABLED|PREVIEW|BUILD)\b/.test(stripComments(read(file))),
    );
    expect(strays).toEqual([]);
  });

  test("with the switch off the bar is today's, and Gradins is only in the live list", () => {
    expect(primaryNavItems.map((item) => item.to)).not.toContain("/gradins");
    expect(liveNavItems.map((item) => item.to)).toContain("/gradins");
  });

  test("the Gradins routes redirect to Fantasy and are never cached or indexed", () => {
    expect(stripComments(read("src/routes/gradins.tsx"))).toContain(
      'throw redirect({ to: "/fantasy", replace: true })',
    );
    expect(read("src/routes/gradins.tsx")).toContain('"Cache-Control": "private, no-store"');
    for (const file of [
      "src/routes/gradins.index.tsx",
      "src/routes/gradins.carte.tsx",
      "src/routes/gradins.les-votres.tsx",
      "src/routes/gradins.saisons.tsx",
    ]) {
      expect(read(file)).toContain('{ name: "robots", content: "noindex" }');
    }
  });

  test("Gradins is not in the sitemap", () => {
    expect(
      (SITEMAP_STATIC_PATHS as readonly string[]).some((path) => path.startsWith("/gradins")),
    ).toBe(false);
  });
});
