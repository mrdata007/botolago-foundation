import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { renderToString } from "react-dom/server";

import type { UiDifficulty } from "@/components/ui-kit";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import { FdrFixtureCell } from "./fantasy.fixtures";

/**
 * BG-0155 (6): the fixture difficulty grid is readable without colour.
 *
 * Before, a cell printed "FUS (D)" on a coloured fill and told a screen
 * reader only "FUS Rabat (Domicile)", so the rating lived in the colour
 * alone; levels 1/2 and 4/5 differ only in shade. Now every cell prints the
 * figure beside the token in the fill's own on-fill colour, its name says
 * "difficulté {n} sur 5", and the key says "Difficulté" (not the English
 * "FDR") and explains D/E.
 *
 * The cell is rendered with `react-dom/server`, as the hub and match tests
 * render theirs, in both languages (it takes `t`, so Arabic needs no
 * provider); the page's wiring is checked on its source, with comments
 * stripped so a sentence about a marker cannot stand in for the marker.
 */

const ROOT = join(import.meta.dir, "..", "..");
const code = (path: string) =>
  readFileSync(join(ROOT, path), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/(^|[^:])\/\/.*$/gm, "$1");
const ROUTE = code("src/routes/fantasy.fixtures.tsx");

type Lang = "fr" | "ar";
const tIn = (lang: Lang) => (key: TranslationKey) => dictionaries[lang][key];
const LEVELS = [1, 2, 3, 4, 5] as const satisfies readonly UiDifficulty[];
const FUS = { fr: "FUS Rabat", ar: "الفتح الرباطي" } as const;

function render(
  difficulty: UiDifficulty,
  {
    lang = "fr",
    isHome = true,
    token = "FUS",
    club = FUS[lang],
  }: Partial<{
    lang: Lang;
    isHome: boolean;
    token: string;
    club: string;
  }> = {},
) {
  return renderToString(
    <FdrFixtureCell
      t={tIn(lang)}
      difficulty={difficulty}
      isHome={isHome}
      token={token}
      club={club}
    />,
  )
    .replace(/<!-- -->/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'");
}

/** The visible half of a rendered cell: what is hidden from screen readers. */
const visiblePart = (html: string) =>
  (
    /<span aria-hidden="true"[^>]*>([\s\S]*?)<\/span><span class="sr-only"/.exec(html)?.[1] ?? ""
  ).replace(/<[^>]+>/g, "");
const srPart = (html: string) => /<span class="sr-only">([\s\S]*?)<\/span>/.exec(html)?.[1] ?? "";
const titleOf = (html: string) => /title="([^"]*)"/.exec(html)?.[1] ?? null;

describe("a fixture cell says its difficulty in words", () => {
  test.each(LEVELS)("French, level %i", (n) => {
    expect(srPart(render(n))).toBe(`FUS Rabat (Domicile), difficulté ${n} sur 5`);
  });

  test.each(LEVELS)("Arabic, level %i, with Latin digits", (n) => {
    expect(srPart(render(n, { lang: "ar" }))).toBe(`الفتح الرباطي (أرضه)، الصعوبة ${n} من 5`);
  });

  test("away fixtures name the venue as the screen-reader text did before", () => {
    expect(srPart(render(4, { isHome: false, club: "Raja CA", token: "RCA" }))).toBe(
      "Raja CA (Extérieur), difficulté 4 sur 5",
    );
    expect(srPart(render(4, { lang: "ar", isHome: false, club: "الرجاء", token: "RCA" }))).toBe(
      "الرجاء (خارج أرضه)، الصعوبة 4 من 5",
    );
  });

  test("an unknown opponent still has its difficulty said, with no stray space", () => {
    expect(srPart(render(3, { club: "", token: "" }))).toBe("(Domicile), difficulté 3 sur 5");
  });

  test.each(["fr", "ar"] as const)(
    "%s: the hover title is exactly what a screen reader hears",
    (lang) => {
      const html = render(2, { lang });
      expect(titleOf(html)).toBe(srPart(html));
      // The visible token and figure are hidden, so nothing is heard twice.
      expect(html).toContain('<span aria-hidden="true"');
    },
  );
});

describe("a fixture cell shows its figure, in the fill's own on-fill colour", () => {
  test.each(LEVELS)("level %i prints its number beside the token, in both languages", (n) => {
    expect(visiblePart(render(n))).toBe(`FUS (D)${n}`);
    expect(visiblePart(render(n, { lang: "ar" }))).toBe(`FUS (م)${n}`);
    expect(visiblePart(render(n, { isHome: false }))).toBe(`FUS (E)${n}`);
  });

  test.each(LEVELS)("level %i: fill and text come from the kit's --ui-fdr-%i pair", (n) => {
    const style = /<div[^>]*style="([^"]*)"/.exec(render(n))?.[1] ?? "";
    expect(style).toContain(`background-color:var(--ui-fdr-${n})`);
    expect(style).toContain(`color:var(--ui-on-fdr-${n})`);
  });

  test("the number sets no colour of its own, so it inherits the on-fill colour", () => {
    const number = /<span class="([^"]*)">5<\/span>/.exec(render(5));
    expect(number).not.toBeNull();
    const classes = number![1].split(/\s+/);
    // No inline style and no text-colour utility (`text-white`, `text-[…]`,
    // a tone class) and no dimming: the kit's `--ui-on-fdr-N` reaches it by
    // inheritance, at full strength.
    expect(number![0]).not.toContain("style=");
    expect(classes.filter((c) => /^(text-|dark:text-|opacity-)/.test(c))).toEqual([]);
    // Tabular, and quieter than the token's 900.
    expect(classes).toContain("fpl-tabular");
    expect(classes).toContain("[font-weight:var(--ui-weight-strong)]");
  });

  test("token and number never wrap apart, and the token stays left-to-right", () => {
    const html = render(2);
    expect(html).toMatch(/<span aria-hidden="true" class="[^"]*\bwhitespace-nowrap\b/);
    expect(html).toContain('<span dir="ltr">FUS (D)</span>');
  });
});

describe("the page wires every fixture through the cell, and keeps its markers", () => {
  test("one data-fdr-fixture marker in the file, wrapping the one cell per service row", () => {
    expect(ROUTE.match(/data-fdr-fixture=""/g)?.length).toBe(1);
    expect(ROUTE.match(/data-fdr-gameweek=\{f\.gameweek\}/g)?.length).toBe(1);
    const marker = ROUTE.slice(ROUTE.indexOf('data-fdr-fixture=""'));
    const inside = marker.slice(0, marker.indexOf("</div>"));
    expect(inside).toContain("<FdrFixtureCell");
    expect(inside).toContain("difficulty={f.difficulty as UiDifficulty}");
    expect(inside).toContain("isHome={f.isHome}");
    expect(ROUTE.match(/<FdrFixtureCell\b/g)?.length).toBe(1);
  });

  test("the key's info button says what it opens, not only the key's title", () => {
    expect(ROUTE).toContain('aria-label={t("fantasy.fixtures.key_explain")}');
    expect(ROUTE.match(/t\("fpl\.fdr_key"\)/g)?.length).toBe(1);
  });

  test("the D/E line is built from the letters the cells print", () => {
    expect(ROUTE).toMatch(
      /t\("fantasy\.fixtures\.venue_key"\)\s*\.replace\("\{home\}", t\("fpl\.home_short"\)\)\s*\.replace\("\{away\}", t\("fpl\.away_short"\)\)/,
    );
  });
});

describe("the key's wording", () => {
  const venueLine = (lang: Lang) => {
    const d = dictionaries[lang];
    return d["fantasy.fixtures.venue_key"]
      .replace("{home}", d["fpl.home_short"])
      .replace("{away}", d["fpl.away_short"]);
  };

  test("French says Difficulté, never the English FDR", () => {
    expect(dictionaries.fr["fpl.fdr_key"]).toBe("Difficulté");
    expect(dictionaries.fr["fpl.fdr_key"]).not.toContain("FDR");
  });

  test("Arabic keeps مفتاح الصعوبة", () => {
    expect(dictionaries.ar["fpl.fdr_key"]).toBe("مفتاح الصعوبة");
  });

  test("the panel explains D and E in both languages", () => {
    expect(venueLine("fr")).toBe("D = à domicile · E = à l'extérieur");
    expect(venueLine("ar")).toBe("م = على أرضه · خ = خارج أرضه");
  });

  test("the info button has a name of its own in both languages", () => {
    expect(dictionaries.fr["fantasy.fixtures.key_explain"]).toBe("Explication de la difficulté");
    expect(dictionaries.ar["fantasy.fixtures.key_explain"]).toBe("شرح مؤشر الصعوبة");
  });
});
