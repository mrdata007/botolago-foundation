import { describe, expect, it } from "bun:test";

import {
  initials,
  printedRatingBand,
  ratingBand,
  sectorPath,
  segments,
  shirtName,
  sliceAngles,
  sliceReach,
  teamKit,
} from "./pepites-design";
import { formatCount, nextSeasonLabel, playerMetaLine } from "./pepites-format";

describe("the Figma parts' helpers", () => {
  it("takes initials from the first and last words, a note in brackets aside", () => {
    expect(initials("Abdelhamid Maali")).toBe("AM");
    expect(initials("Baba Bello Ilou")).toBe("BI");
    expect(initials("Achraf V. (fictif)")).toBe("AV");
    expect(initials("Hakimi")).toBe("H");
  });

  it("prints the surname on the shirt, in capitals", () => {
    expect(shirtName("Baba Bello Ilou")).toBe("BELLO ILOU");
    expect(shirtName("Achraf V. (fictif)")).toBe("V");
    expect(shirtName("Hakimi")).toBe("HAKIMI");
  });

  it("lights round(value / 10) of the ten segments", () => {
    expect([segments(86), segments(73), segments(4), segments(100), segments(null)]).toEqual([
      9, 7, 0, 10, 0,
    ]);
  });

  it("puts each rating on the chip's fixed scale, lower bounds included", () => {
    expect([5.9, 6, 6.49, 6.5, 7, 7.49, 7.5].map(ratingBand)).toEqual([1, 2, 2, 3, 4, 4, 5]);
  });

  it("bands a rating as it is printed, to one decimal", () => {
    // 6.49 prints "6,5", so it takes 6.5's band; 6.44 prints "6,4" and keeps its own.
    expect([5.96, 6.44, 6.45, 6.49, 6.96, 7.44, 7.45].map(printedRatingBand)).toEqual([
      2, 2, 3, 3, 4, 4, 5,
    ]);
  });

  it("dresses a club the kit table does not know in the default kit", () => {
    const unknown = { id: "x", name: { fr: "Club X", ar: "س" }, shortName: { fr: "CX", ar: "س" } };
    expect(teamKit(unknown).primary).toMatch(/^#[0-9a-f]{6}$/i);
  });

  it("groups thousands in French only, and names the next season", () => {
    expect(formatCount(1275, "fr")).toBe("1 275");
    expect(formatCount(1275, "ar")).toBe("1275");
    expect(nextSeasonLabel("2025-26")).toBe("2026-27");
    expect(nextSeasonLabel("2099-00")).toBe("2100-01");
    expect(nextSeasonLabel("2025/2026")).toBe("2026/2027");
    expect(nextSeasonLabel("2025-2026")).toBe("2026-2027");
    expect(nextSeasonLabel("saison")).toBe("saison");
  });

  it("builds the row's mono meta line with the figures isolated", () => {
    const t = (key: string) =>
      ({
        "pepites.position_short.fwd": "ATT",
        "pepites.meta.age_short": "{n}A",
        "pepites.meta.goals_assists": "{g}B {a}PD",
      })[key] ?? key;
    const line = playerMetaLine(
      {
        team: { id: "t", name: { fr: "Ittihad Tanger", ar: "" }, shortName: { fr: "IRT", ar: "" } },
        positionGroup: "FWD",
        age: 20,
      },
      { minutes: 1275, goals: 0, assists: 8 },
      { t: t as never, tr: (value) => value.fr, lang: "fr" },
    );
    expect(line.replace(/[⁨⁩]/g, "")).toBe(
      "IRT\u00a0· ATT\u00a0· 20A\u00a0· 1\u202f275’\u00a0· 0B 8PD",
    );
    // A dot never starts a line: the space before it does not break.
    expect(line).not.toContain(" ·");
  });
});

describe("the percentile wheel's geometry", () => {
  it("cuts five slices from twelve o'clock, clockwise, each a 72° step less its gaps", () => {
    const [from, to] = sliceAngles(0, false);
    expect(from).toBeCloseTo(-Math.PI / 2 + 0.05, 10);
    expect(to).toBeCloseTo(-Math.PI / 2 + (2 * Math.PI) / 5 - 0.05, 10);
    for (let index = 1; index < 5; index += 1) {
      expect(sliceAngles(index, false)[0] - sliceAngles(index - 1, false)[0]).toBeCloseTo(
        (2 * Math.PI) / 5,
        10,
      );
    }
  });

  it("runs counter-clockwise in Arabic: each slice is the French one reflected", () => {
    for (let index = 0; index < 5; index += 1) {
      const [from, to] = sliceAngles(index, false);
      const [arFrom, arTo] = sliceAngles(index, true);
      expect(arFrom).toBeCloseTo(Math.PI - to, 10);
      expect(arTo).toBeCloseTo(Math.PI - from, 10);
      // Mirrored across the vertical axis: x flips, y holds.
      expect(Math.cos(arTo)).toBeCloseTo(-Math.cos(from), 10);
      expect(Math.sin(arTo)).toBeCloseTo(Math.sin(from), 10);
    }
  });

  it("draws an annular sector: out along the outer arc clockwise, back along the inner one", () => {
    // The top-right quarter of a ring of radii 10 and 20 around (50, 50).
    const path = sectorPath(50, 50, 10, 20, -Math.PI / 2, 0);
    expect(path).toBe("M50 30 A20 20 0 0 1 70 50 L60 50 A10 10 0 0 0 50 40 Z");
    // A ring with no thickness, or no angle, draws nothing.
    expect(sectorPath(50, 50, 10, 10, 0, 1)).toBe("");
    expect(sectorPath(50, 50, 10, 20, 1, 1)).toBe("");
  });

  it("reaches out from the ring by the percentile, held to 0–100, and not at all for none", () => {
    expect(sliceReach(50, 30, 70)).toBe(50);
    expect(sliceReach(100, 30, 70)).toBe(70);
    expect(sliceReach(0, 30, 70)).toBe(30);
    expect(sliceReach(140, 30, 70)).toBe(70);
    expect(sliceReach(-5, 30, 70)).toBe(30);
    expect(sliceReach(null, 30, 70)).toBe(30);
    expect(sliceReach(Number.NaN, 30, 70)).toBe(30);
  });
});
