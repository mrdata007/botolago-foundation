import { describe, expect, test } from "bun:test";

import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";
import { gapLabel, placeLabel, pointsLabel, roundsLabel, zoneLabel } from "./standings-copy";

const inLanguage = (lang: Language) => (key: TranslationKey) => dictionaries[lang][key];
const format = (value: number) => String(value);

describe("the table page's counted phrases", () => {
  test("rounds agree with their number in French and Arabic", () => {
    const fr = (n: number) => roundsLabel(n, "fr", inLanguage("fr"), format);
    const ar = (n: number) => roundsLabel(n, "ar", inLanguage("ar"), format);
    expect([1, 2, 5, 30].map(fr)).toEqual([
      "après 1 journée",
      "après 2 journées",
      "après 5 journées",
      "après 30 journées",
    ]);
    // One and two are words of their own; 3–10 the plural; 11+ the singular.
    expect([1, 2, 5, 30].map(ar)).toEqual([
      "بعد جولة واحدة",
      "بعد جولتين",
      "بعد 5 جولات",
      "بعد 30 جولة",
    ]);
  });

  test("points agree with their number", () => {
    expect([1, 56].map((n) => pointsLabel(n, "fr", inLanguage("fr"), format))).toEqual([
      "1 pt",
      "56 pts",
    ]);
    expect([1, 2, 7, 56].map((n) => pointsLabel(n, "ar", inLanguage("ar"), format))).toEqual([
      "نقطة واحدة",
      "نقطتان",
      "7 نقاط",
      "56 نقطة",
    ]);
  });

  test("a club on no points reads 0, not the one-point phrase French files 0 under", () => {
    expect(pointsLabel(0, "fr", inLanguage("fr"), format)).toBe("0 pts");
    expect(pointsLabel(0, "ar", inLanguage("ar"), format)).toBe("0 نقطة");
  });

  test("a place is 1re, then 2e… in French, المركز in Arabic", () => {
    expect([1, 2, 14].map((n) => placeLabel(n, "fr", inLanguage("fr"), format))).toEqual([
      "1re place",
      "2e place",
      "14e place",
    ]);
    expect(placeLabel(2, "ar", inLanguage("ar"), format)).toBe("المركز 2");
  });

  test("the gap reads as distance, lead or level", () => {
    const fr = (gap: Parameters<typeof gapLabel>[0]) =>
      gapLabel(gap, "fr", inLanguage("fr"), format);
    expect(fr({ kind: "behind", points: 1, to: 2 })).toBe("à 1 point de la 2e place");
    expect(fr({ kind: "behind", points: 4, to: 1 })).toBe("à 4 points de la 1re place");
    expect(fr({ kind: "lead", points: 2, over: 2 })).toBe("2 points d'avance sur la 2e place");
    expect(fr({ kind: "level", with: 9 })).toBe("à égalité de points avec la 9e place");

    const ar = (gap: Parameters<typeof gapLabel>[0]) =>
      gapLabel(gap, "ar", inLanguage("ar"), format);
    expect(ar({ kind: "behind", points: 3, to: 5 })).toBe("على بعد 3 نقاط من المركز 5");
    expect(ar({ kind: "lead", points: 2, over: 2 })).toBe("بفارق نقطتين عن المركز 2");
    expect(ar({ kind: "lead", points: 12, over: 2 })).toBe("بفارق 12 نقطة عن المركز 2");
  });

  test("names the zones in both languages", () => {
    expect(zoneLabel("champions_league", inLanguage("fr"))).toBe("Ligue des champions CAF");
    expect(zoneLabel("confederation_cup", inLanguage("ar"))).toBe("كأس الكونفدرالية الإفريقية");
    expect(zoneLabel("relegation", inLanguage("ar"))).toBe("الهبوط");
  });
});
