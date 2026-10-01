import { describe, expect, test } from "bun:test";

import { fr } from "@/i18n/dictionary-fr";
import { ar } from "@/i18n/dictionary-ar";
import { pointsUnit } from "@/lib/points-unit";

const tFr = (key: keyof typeof fr) => fr[key];
const tAr = (key: keyof typeof ar) => ar[key];

describe("pointsUnit", () => {
  test('French: "1 pt", never "1 pts"', () => {
    expect(pointsUnit(1, tFr)).toBe("pt");
    expect(pointsUnit(-1, tFr)).toBe("pt");
  });

  test("French: every other figure keeps the plural, zero included", () => {
    for (const n of [0, 2, 9, 11, 58, -4]) expect(pointsUnit(n, tFr)).toBe("pts");
  });

  test("Arabic: the one-letter abbreviation is the same at every figure", () => {
    for (const n of [0, 1, 2, 3, 11, -4]) expect(pointsUnit(n, tAr)).toBe("ن");
  });
});
