import { describe, expect, test } from "bun:test";
import { axisTop, formatCount, formatDay } from "./analytics-format";

const ARABIC_INDIC_DIGITS = /[٠-٩۰-۹]/;

describe("dashboard formatting", () => {
  test("the value axis tops out on a clean number with whole-number ticks", () => {
    const cases: [number, number][] = [
      [0, 2],
      [1, 2],
      [3, 4],
      [7, 8],
      [19, 20],
      [21, 30],
      [150, 160],
      [1234, 1600],
    ];
    for (const [max, top] of cases) {
      expect({ max, top: axisTop(max) }).toEqual({ max, top });
      expect(Number.isInteger(axisTop(max) / 2)).toBe(true);
      expect(axisTop(max)).toBeGreaterThanOrEqual(max);
    }
  });

  test("counts are grouped, and compacted from ten thousand", () => {
    expect(formatCount(1284, "fr").replace(/\s/g, "")).toBe("1284");
    expect(formatCount(12900, "fr").replace(/\s/g, "")).toBe("12,9k");
    expect(formatCount(1284, "ar")).not.toMatch(ARABIC_INDIC_DIGITS);
  });

  test("a calendar day stays that day in every time zone", () => {
    expect(formatDay("2026-09-24", "fr")).toBe("24 sept.");
    expect(formatDay("2026-09-24", "fr", true)).toBe("24 sept. 2026");
    expect(formatDay("2026-09-24", "ar")).not.toMatch(ARABIC_INDIC_DIGITS);
  });
});

describe("counted nouns", () => {
  test("French: zero and one are singular", async () => {
    const { frCount } = await import("./analytics-format");
    expect(frCount(0, "ligue", "ligues")).toBe("0 ligue");
    expect(frCount(1, "suppression demandée", "suppressions demandées")).toBe(
      "1 suppression demandée",
    );
    expect(frCount(3, "ligue", "ligues")).toBe("3 ligues");
  });

  test("Arabic: the noun takes each of its plural forms", async () => {
    const { signupsLabel } = await import("./analytics-format");
    expect(signupsLabel(1, "ar")).toBe("تسجيل واحد");
    expect(signupsLabel(2, "ar")).toBe("تسجيلان");
    expect(signupsLabel(5, "ar")).toBe("5 تسجيلات");
    expect(signupsLabel(21, "ar")).toBe("21 تسجيلاً");
    expect(signupsLabel(100, "ar")).toBe("100 تسجيل");
    expect(signupsLabel(12, "fr")).toBe("12 inscriptions");
  });
});
