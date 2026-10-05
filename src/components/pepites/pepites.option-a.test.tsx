import { describe, expect, it } from "bun:test";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";

import { MovementMark, RatingChip, Seg10Bar } from "./PepitesVisuals";

/**
 * Pépites on the main design (BG-0152).
 *
 * The owner decided on 2026-10-05 that Pépites looks like the rest of the
 * app: no night bands, no energy gradient, no mono meta lines, no slant, no
 * `--pepites-*` palette. Every screen is built from the kit
 * (`src/components/ui-kit`). This file checks, as source, the rules every
 * screen owes the design system on every Pépites screen file, that the old
 * layer stays deleted, and a few of the shared glyphs on rendered markup —
 * as the club pages' own test does.
 *
 * The share images (`share-image.ts`) are canvas code, not screens, and are
 * out of this lane's scope: they keep their own drawing until they are
 * redrawn with the Fantasy recap image. They are `.ts`, so the `.tsx` scan
 * below never reads them.
 */

const ROOT = join(import.meta.dir, "..", "..", "..");
/** Source without comments, so a note that NAMES a forbidden construct does not trip a rule. */
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");

/** Every `.tsx` under `dir`, as repository-relative paths, tests excluded. */
function tsxUnder(dir: string): string[] {
  return readdirSync(join(ROOT, dir), { recursive: true, encoding: "utf8" })
    .filter((name) => name.endsWith(".tsx") && !name.includes(".test."))
    .map((name) =>
      relative(ROOT, join(ROOT, dir, name))
        .split("\\")
        .join("/"),
    )
    .sort();
}

/** The screens' source: every Pépites component, and the public and admin Pépites routes. */
const FILES = [
  ...tsxUnder("src/components/pepites"),
  ...readdirSync(join(ROOT, "src/routes"))
    .filter((name) => /^(?:admin\.)?pepites\b.*\.tsx$/.test(name))
    .map((name) => `src/routes/${name}`)
    .sort(),
];

/**
 * The opening tags of the raw interactive elements in `source` (`<button>`,
 * `<a>`, `<Link>`, `<summary>`), each read up to its own closing `>`: a `>`
 * inside a `{…}` expression or an arrow (`=>`) does not end the tag. Kit
 * controls (`UiButton`, `UiChip`, …) carry the tap floor themselves and are
 * not listed.
 */
function interactiveTags(source: string): string[] {
  const tags: string[] = [];
  const opener = /<(?:button|a|Link|summary)(?=[\s>])/g;
  for (let match = opener.exec(source); match; match = opener.exec(source)) {
    let depth = 0;
    let end = match.index + match[0].length;
    for (; end < source.length; end += 1) {
      const char = source[end];
      if (char === "{") depth += 1;
      else if (char === "}") depth -= 1;
      else if (char === ">" && depth === 0 && source[end - 1] !== "=") break;
    }
    tags.push(source.slice(match.index, end + 1));
  }
  return tags;
}

/** Spacing steps below 11 (44px), the tap floor (`--ui-tap-min`). */
const UNDER_TAP = String.raw`(?:[1-9]|10|[0-9]\.5)`;

describe("Pépites — the screens are on the kit", () => {
  it("scans every Pépites screen file, and only screen files", () => {
    expect(FILES.length).toBeGreaterThanOrEqual(30);
    expect(FILES).toContain("src/components/pepites/PepitesPlayerPage.tsx");
    expect(FILES).toContain("src/components/pepites/admin/PepitesAdminEditions.tsx");
    expect(FILES).toContain("src/routes/pepites.index.tsx");
    expect(FILES).toContain("src/routes/admin.pepites.donnees.tsx");
    expect(FILES.some((file) => file.includes("share-image"))).toBe(false);
  });

  for (const file of FILES) {
    const source = code(file);

    it(`${file}: logical properties only`, () => {
      // A class ends at a dash, a space, a quote or a brace — not at "é", so
      // the French " précis" in a label is not read as `pr`.
      expect(source).not.toMatch(
        /["'`\s](?:m[lr]|p[lr]|border-[lr]|rounded-[lr]|rounded-(?:tl|tr|bl|br)|text-(?:left|right)|float-(?:left|right)|scroll-[mp][lr])(?:-|(?=[\s"'`}]))/,
      );
      expect(source).not.toMatch(/["'`\s]-?(?:left|right)-(?:\d|\[|1\/2|full|px)/);
      // Inline styles. (The compare page's `left`/`right` data fields name
      // the two players, not sides of the screen, so only style objects count.)
      expect(source).not.toMatch(
        /style=\{\{[^}]*\b(?:left|right|marginLeft|marginRight|paddingLeft|paddingRight|borderLeft\w*|borderRight\w*)\s*:/,
      );
      expect(source).not.toMatch(/\b(?:marginLeft|marginRight|paddingLeft|paddingRight):/);
    });

    it(`${file}: every tracking is ltr:-only`, () => {
      expect(source).not.toMatch(/(?<!ltr:)tracking-/);
      expect(source).not.toMatch(/letter-?spacing/i);
    });

    it(`${file}: no literal colour, and no --ui-ink as a foreground`, () => {
      expect(source).not.toMatch(/#[0-9a-fA-F]{3,8}\b/);
      expect(source).not.toMatch(/\b(?:rgba?|hsla?)\(/);
      expect(source).not.toMatch(
        /\b(?:bg|text|border|ring|fill|stroke|from|via|to|outline|divide)-(?:white|black)\b/,
      );
      expect(source).not.toMatch(/(?:text|ring|border)-\[color:var\(--ui-ink\)\]/);
      expect(source).not.toMatch(/--brand-|--fpl-|--color-|--text-|--background-|--border-subtle/);
    });

    it(`${file}: no angled or physical gradient, and never a <bdi> as a flex container`, () => {
      expect(source).not.toMatch(/gradient\([^)]*\d+deg/);
      expect(source).not.toMatch(/\b(?:bg-gradient-to|bg-linear-to)-[lr]\b|\bto_(?:right|left)\b/);
      expect(source).not.toMatch(/<bdi[^>]*className=[^>]*\bflex\b/);
    });

    it(`${file}: type sizes and radii come from the kit`, () => {
      // No literal px size (a `text-[13px]`, a `h-[38px]`), no clamp() size.
      expect(source).not.toMatch(/\[[\d.]+px\]/);
      expect(source).not.toMatch(/text-\[clamp\(/);
      expect(source).not.toMatch(/\bfontSize:/);
      // The kit's display and figure steps carry their own leading; a
      // `leading-none` clips Changa and Arabic glyphs.
      expect(source).not.toMatch(/\bleading-none\b/);
      // Radii are `ui.radius.*`, `rounded-full` or `rounded-none`.
      expect(source).not.toMatch(/\brounded-(?:xs|sm|md|lg|xl|2xl|3xl)\b/);
      expect(source).not.toMatch(/["'`\s]rounded["'`\s]/);
    });

    it(`${file}: no manual mirroring of an icon`, () => {
      // styles.css mirrors arrows and chevrons in Arabic already; a manual
      // flip composes with it and points the icon backwards.
      expect(source).not.toMatch(/rtl:(?:-?scale-x-(?:100|\[-1\])|-?rotate-180)/);
      expect(source).not.toMatch(/[→←]/);
    });

    it(`${file}: none of the old Pépites layer`, () => {
      expect(source).not.toMatch(/--pepites-/);
      expect(source).not.toMatch(/pepites-night-band/);
      expect(source).not.toMatch(/\bpp\.[a-zA-Z]/);
      expect(source).not.toMatch(
        /\b(?:GoMark|NightBand|EnergyStreak|MonoLine|FilterChip|FactsStrip|ShortBand|TiltFrame|Headshot|PepitesTopBar|SEGMENT_COLOURS)\b/,
      );
      expect(source).not.toMatch(/skew/i);
      expect(source).not.toMatch(/IBM Plex|font-mono/);
      expect(source).not.toMatch(/\bonNight\b/);
      expect(source).not.toMatch(/tone="night"/);
      // Copy comes from the dictionaries, in French and Arabic.
      expect(source).not.toMatch(/>\s*(?:DATA|VS|U23)\s*</);
      expect(source).not.toMatch(/["'`](?:DATA|VS|U23)["'`]/);
    });

    it(`${file}: no control set below the 44px tap floor`, () => {
      // A minimum height exists to hold a floor; one under 44px holds none.
      expect(source).not.toMatch(new RegExp(String.raw`\bmin-h-${UNDER_TAP}\b`));
      for (const tag of interactiveTags(source)) {
        const fixed = tag.match(new RegExp(String.raw`(?<![\w:-])(?:h|size)-${UNDER_TAP}\b`));
        if (!fixed) continue;
        // A fixed small height on a raw control must come with the floor.
        expect(tag).toMatch(
          /ui\.space\.tap|--ui-tap-min|--ui-row-min|\bmin-h-(?:1[1-9]|[2-9]\d)\b/,
        );
      }
    });
  }
});

describe("Pépites — the old layer stays deleted", () => {
  it("the night top bar and the tilt frame are gone", () => {
    expect(existsSync(join(ROOT, "src/components/pepites/PepitesTopBar.tsx"))).toBe(false);
    expect(existsSync(join(ROOT, "src/components/pepites/TiltFrame.tsx"))).toBe(false);
  });

  it("the stylesheet declares no --pepites-* token and no night band", () => {
    const styles = code("src/styles.css");
    expect(styles).not.toMatch(/--pepites-/);
    expect(styles).not.toMatch(/pepites-night-band/);
  });

  it("the global top bar has no night tone", () => {
    const topBar = code("src/components/shell/TopBar.tsx");
    expect(topBar).not.toMatch(/--pepites-/);
    expect(topBar).not.toMatch(/["']night["']/);
  });

  it("pepites-design holds pure helpers only: no class strings, no colours", () => {
    const design = code("src/components/pepites/pepites-design.ts");
    expect(design).not.toMatch(/export const pp\b/);
    expect(design).not.toMatch(/SEGMENT_COLOURS/);
    expect(design).not.toMatch(/#[0-9a-fA-F]{6}\b(?!\$)/);
    for (const helper of ["initials", "shirtName", "teamKit", "segments", "ratingBand"]) {
      expect(design).toContain(`export function ${helper}(`);
    }
  });

  it("every page frames itself in the default app shell, with the global top bar", () => {
    const shell = code("src/components/pepites/PepitesShell.tsx");
    expect(shell).toContain("<AppShell");
    expect(shell).not.toMatch(/\btopBar=/);
  });

  it("the compare card keeps one id per row, and the cards row answers alone to its id", () => {
    // tests/e2e/pepites.e2e.ts reads `pepites-compare-cards`: the yellow and
    // red cards row, built from the row key. A literal copy of that id on any
    // other element would make two elements answer to it.
    const compare = code("src/components/pepites/PepitesComparePage.tsx");
    expect(compare).toContain("data-testid={`pepites-compare-${row.key}`}");
    expect(compare).toMatch(/key: "cards",/);
    expect(compare).not.toContain('"pepites-compare-cards"');
  });

  it("the player tabs are the kit's, with the ids the e2e suite reads", () => {
    const player = code("src/components/pepites/PepitesPlayerPage.tsx");
    expect(player).toMatch(/<UiTabs[\s\S]*?idBase="pepites-player"/);
    expect(player).toMatch(/aria-labelledby=\{`pepites-player-tab-\$\{/);
  });
});

// ---------------------------------------------------------------- markup

const inFrench = (node: ReactElement) => renderToStaticMarkup(<I18nProvider>{node}</I18nProvider>);

describe("Pépites — the shared glyphs on the kit", () => {
  it("paints a rating on the kit's rating scale, with its measured foreground", () => {
    const cases: Array<[number, number]> = [
      [5.4, 1],
      [6.2, 2],
      [6.8, 3],
      [7.3, 4],
      [8.1, 5],
    ];
    for (const [rating, band] of cases) {
      const html = inFrench(<RatingChip rating={rating} />);
      expect(html).toContain(`data-band="${band}"`);
      expect(html).toContain(`bg-[color:var(--ui-rating-${band})]`);
      expect(html).toContain(`text-[color:var(--ui-on-rating-${band})]`);
    }
    // The number is always printed, so colour is never the only cue.
    expect(inFrench(<RatingChip rating={7.3} />)).toContain("<bdi>7,3</bdi>");
    // No rating: a muted dash, no band.
    const none = inFrench(<RatingChip rating={null} />);
    expect(none).not.toContain("data-band");
    expect(none).toContain("–");
  });

  it("lights round(value / 10) of ten segments in the brand foreground, over the sunken track", () => {
    const html = inFrench(<Seg10Bar value={64} />);
    expect(html.match(/bg-\[color:var\(--ui-ink-fg\)\]/g)).toHaveLength(6);
    expect(html.match(/bg-\[color:var\(--ui-surface-sunken\)\]/g)).toHaveLength(4);
    expect(html).not.toMatch(/skew|#[0-9a-f]{6}/i);
  });

  it("marks last week's movement with the kit's quiet movement, and a newcomer with a badge", () => {
    const up = inFrench(<MovementMark movement={{ kind: "up", by: 3 }} />);
    expect(up).toContain('data-testid="pepites-movement"');
    expect(up).toContain(">3<");
    const fresh = inFrench(<MovementMark movement={{ kind: "new" }} />);
    expect(fresh).toContain('data-testid="pepites-movement"');
    expect(fresh).toContain("sr-only");
    expect(inFrench(<MovementMark movement={null} />)).toBe("");
  });
});
