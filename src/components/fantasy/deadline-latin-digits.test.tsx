import { afterAll, describe, expect, it, mock } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";

import type { DeadlineParts } from "@/components/fpl/deadline";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Gameweek, Language } from "@/types/domain";

/**
 * BG-0155 (3): the Fantasy deadline countdown writes Latin digits in both
 * languages, the padding zero included. Both components used to pad with an
 * Arabic-Indic zero (U+0660) in Arabic while `Intl.NumberFormat("ar-MA")`
 * already gives Latin digits, so 4 minutes rendered as a dot beside a 4.
 *
 * The server render is French and has no clock (the language and the
 * countdown both arrive after mount), so this file stands in for the two
 * hooks that carry them: `useI18n` answers in the language under test, and
 * `useSecondCountdown` returns the time left under test. Both modules are put
 * back once the file is done (`src/test-isolation.test.ts`).
 */

const ROOT = join(import.meta.dir, "..", "..", "..");

const realI18n = { ...(await import("@/i18n/provider")) };
const realDeadline = { ...(await import("@/components/fpl/deadline")) };

let language: Language | null = null;
let countdown: DeadlineParts | null = null;

mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    if (language === null) return real;
    const dictionary = dictionaries[language];
    return {
      ...real,
      lang: language,
      dir: language === "ar" ? "rtl" : "ltr",
      t: (key: TranslationKey) => dictionary[key],
    };
  },
}));
mock.module("@/components/fpl/deadline", () => ({
  ...realDeadline,
  useSecondCountdown: (deadlineIso: string | null | undefined) => {
    const real = realDeadline.useSecondCountdown(deadlineIso);
    return countdown ?? real;
  },
}));
afterAll(() => {
  language = null;
  countdown = null;
  mock.module("@/i18n/provider", () => realI18n);
  mock.module("@/components/fpl/deadline", () => realDeadline);
});

const { DeadlineStrip } = await import("./DeadlineStrip");
const { DeadlineCard } = await import("./DeadlineCard");

const ARABIC_INDIC_DIGIT = /[٠-٩]/;
const LANGUAGES: Language[] = ["fr", "ar"];
const SINGLE_DIGITS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9];
const DEADLINE = "2026-10-09T17:30:00.000Z";

const GAMEWEEK: Gameweek = {
  number: 14,
  deadline: DEADLINE,
  isCurrent: true,
  averagePoints: null,
  highestPoints: null,
};

async function render(lang: Language, node: ReactElement): Promise<string> {
  language = lang;
  const router = createRouter({
    routeTree: createRootRoute({ component: () => node }),
    history: createMemoryHistory({ initialEntries: ["/"] }),
  });
  await router.load();
  try {
    return renderToString(
      <realI18n.I18nProvider>
        <RouterProvider router={router} />
      </realI18n.I18nProvider>,
    ).replace(/<!-- -->/g, "");
  } finally {
    language = null;
  }
}

const text = (html: string) => html.replace(/<[^>]+>/g, "");

/** The text of every `<bdi>`: the card's date, then its hours, minutes and seconds tiles. */
const bdis = (html: string) => [...html.matchAll(/<bdi[^>]*>([^<]*)<\/bdi>/g)].map((m) => m[1]);

describe("DeadlineStrip writes Latin digits in both languages", () => {
  for (const lang of LANGUAGES) {
    const hours = dictionaries[lang]["home.hours"];

    it(`pads minutes 0-9 with a Latin zero (${lang})`, async () => {
      for (const minutes of SINGLE_DIGITS) {
        const html = await render(
          lang,
          <DeadlineStrip gameweek={14} deadline={DEADLINE} time={{ hours: 37, minutes }} />,
        );
        expect(html).toContain('data-testid="deadline-strip"');
        expect(text(html)).toContain(`37 ${hours} 0${minutes}`);
        expect(html).not.toMatch(ARABIC_INDIC_DIGIT);
      }
    });

    it(`keeps two-digit minutes and single-digit hours as they are (${lang})`, async () => {
      const html = await render(
        lang,
        <DeadlineStrip gameweek={14} deadline={DEADLINE} time={{ hours: 5, minutes: 42 }} />,
      );
      expect(text(html)).toContain(`5 ${hours} 42`);
      expect(html).not.toMatch(ARABIC_INDIC_DIGIT);
    });
  }

  it("keeps the round, the time left and the deadline in the sentence's order", async () => {
    const fr = text(
      await render(
        "fr",
        <DeadlineStrip gameweek={14} deadline={DEADLINE} time={{ hours: 37, minutes: 4 }} />,
      ),
    );
    expect(fr).toStartWith("Fantasy J14 : plus que 37 h 04 · ");
    const ar = text(
      await render(
        "ar",
        <DeadlineStrip gameweek={14} deadline={DEADLINE} time={{ hours: 37, minutes: 4 }} />,
      ),
    );
    // Logical order: hours, then the hour mark, then the minutes. RTL layout
    // puts the hours on the right; the browser check is in the BG-0155 report.
    expect(ar).toStartWith("فانتازي ج14: بقي 37 س 04 · ");
  });
});

describe("DeadlineCard writes Latin digits in both languages", () => {
  for (const lang of LANGUAGES) {
    it(`pads minutes 0-9 with a Latin zero in the minutes tile (${lang})`, async () => {
      for (const minutes of SINGLE_DIGITS) {
        countdown = { hours: 37, minutes, seconds: 7, passed: false };
        try {
          const html = await render(lang, <DeadlineCard gameweek={GAMEWEEK} />);
          const tiles = bdis(html).slice(1);
          expect(tiles).toEqual(["37", `0${minutes}`, "07"]);
          expect(html).not.toMatch(ARABIC_INDIC_DIGIT);
        } finally {
          countdown = null;
        }
      }
    });

    it(`pads single-digit hours and seconds the same way (${lang})`, async () => {
      for (const digit of SINGLE_DIGITS) {
        countdown = { hours: digit, minutes: 30, seconds: digit, passed: false };
        try {
          const html = await render(lang, <DeadlineCard gameweek={GAMEWEEK} />);
          expect(bdis(html).slice(1)).toEqual([`0${digit}`, "30", `0${digit}`]);
          expect(html).not.toMatch(ARABIC_INDIC_DIGIT);
        } finally {
          countdown = null;
        }
      }
    });
  }

  it("shows dashes, not digits, before the countdown has started", async () => {
    const html = await render("ar", <DeadlineCard gameweek={GAMEWEEK} />);
    expect(bdis(html).slice(1)).toEqual(["–", "–", "–"]);
  });
});

function sourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name) ? [path] : [];
  });
}

describe("no source pads numbers with an Arabic-Indic digit", () => {
  const files = sourceFiles(join(ROOT, "src"));

  it("scans the source tree", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain(join(ROOT, "src/components/fantasy/DeadlineStrip.tsx"));
    expect(files).toContain(join(ROOT, "src/components/fantasy/DeadlineCard.tsx"));
  });

  it("never fills padStart or padEnd with an Arabic-Indic digit", () => {
    const offenders = files.filter((path) =>
      /\.pad(?:Start|End)\([^)]*[٠-٩]/.test(readFileSync(path, "utf8")),
    );
    expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
  });

  it("never holds a lone Arabic-Indic digit as a string to build a number with", () => {
    // A string literal made only of Arabic-Indic digits ("٠", '٠٠') is a digit
    // waiting to be glued to a number; copy that merely contains one is not.
    const offenders = files.filter((path) => /(["'`])[٠-٩]+\1/.test(readFileSync(path, "utf8")));
    expect(offenders.map((path) => relative(ROOT, path))).toEqual([]);
  });

  it("pads both countdowns with a Latin zero", () => {
    for (const file of ["DeadlineStrip.tsx", "DeadlineCard.tsx"]) {
      const source = readFileSync(join(import.meta.dir, file), "utf8");
      expect(source).toContain('.padStart(2, "0")');
      expect(source).toContain('"ar-MA-u-nu-latn"');
      expect(source).not.toMatch(ARABIC_INDIC_DIGIT);
    }
  });
});
