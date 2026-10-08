import { describe, expect, it } from "bun:test";

import { AR_NAME, AR_TIER, N6, N7, N8 } from "./charts";
import { bw, trim } from "./knit";
import { knitName } from "./knit-name";
import { arabicName, latinName, nameArt, type RasterText } from "./names";
import { ARABIC_CHARTS, ARABIC_TIER_ROWS, LATIN_WIDTHS, estimateAspect } from "./estimate";
import { echarpeRenderer as R } from "./index";
import { AR, FR, LANGS, PROFILES } from "./test-data";
import type { CardProfile } from "../types";
import { trimRows } from "./knit";
import { innerStitches } from "./geometry";

const none: RasterText = () => null;
/** A stand-in for the canvas sampler: a block as wide as the text is long, `rows` tall. */
const block: RasterText = (text, rows) => ({
  bmp: Array.from({ length: rows }, () =>
    "#".repeat(Math.max(1, Math.round((text.length * 0.7 * rows) / 4))),
  ),
  base: rows - 3,
});

const art = (name: string, founder: number | null, inner: number, ar = false, r = none) =>
  nameArt(knitName(name), founder, ar, inner, r);

describe("the Latin ladder", () => {
  it("a short name takes the 8-row capitals, and nothing is cut", () => {
    const a = art("Ali", null, 33);
    expect(a.rows).toBe(8);
    expect(a.bmp.length).toBe(8);
    expect(bw(a.bmp)).toBe(6 + 5 + 2 + 2);
    expect(a.bmp.join("")).not.toContain("*");
    expect(a.blank).toBe(false);
  });
  it("the founder year (·26) is knitted after the name on its baseline, marked '*'", () => {
    const a = art("Ali", 2026, 33);
    expect(a.rows).toBe(8);
    expect(a.bmp.join("")).toContain("*");
    expect(bw(a.bmp)).toBeLessThanOrEqual(33);
  });
  it("steps down 8 → 7 → 6 rows, then stacks the year, then breaks into lines", () => {
    // KARIM: 32 stitches at 8 rows; with ·26 it no longer fits on one line at 33
    expect(art("Karim", null, 33).rows).toBe(8);
    const withYear = art("Karim", 2026, 33);
    expect(withYear.bmp.join("")).toContain("*");
    expect(bw(withYear.bmp)).toBeLessThanOrEqual(33);
    // a narrow gauge (HOMA, 27) breaks KARIM into two lines
    const homa = art("Karim", null, 27);
    expect(homa.rows).toBeLessThan(8);
    expect(homa.bmp.length).toBeGreaterThan(8);
    // the longest name still knits, in lines
    const huge = art("Mohammed Abderrahmane", 2026, 33);
    expect(huge.bmp.length).toBeGreaterThan(14);
    expect(bw(huge.bmp)).toBeLessThanOrEqual(33);
  });
  it("never cuts a name to an initial, and never overflows", () => {
    const names = [
      "A",
      "Ali",
      "Karim",
      "Salma",
      "Yasmine",
      "Othmane",
      "Hamza",
      "Abdelkarim",
      "Jean-Pierre",
      "Mohammed Abderrahmane",
      "Bouchra El Idrissi",
      "Zakaria",
      "Anas",
      "X Æ A-12",
    ];
    for (const n of names)
      for (const tier of [null, "homa", "stade", "pro", "champion"] as const)
        for (const founder of [null, 2026]) {
          const inner = innerStitches(tier);
          const a = art(n, founder, inner);
          const k = knitName(n).text.replace(/[\s-]/g, "");
          expect(bw(a.bmp)).toBeLessThanOrEqual(inner);
          expect(a.bmp.every((r) => r.length === bw(a.bmp))).toBe(true);
          // at least as many stitch-rows as the smallest capitals, and every letter is there
          expect(a.bmp.filter((r) => r.includes("#")).length).toBeGreaterThanOrEqual(6);
          if (k.length >= 2)
            expect((a.bmp.join("").match(/#/g) ?? []).length).toBeGreaterThan(k.length * 6);
        }
  });
  it("30-character names are cut to 24 characters first, then fitted", () => {
    const a = art("Abdelrahmanabdelrahmanabdelrahman", null, 33);
    expect(a.blank).toBe(false);
    expect(bw(a.bmp)).toBeLessThanOrEqual(33);
  });
  it("latinName is the same ladder when called straight", () => {
    expect(latinName("ALI", "", 33).rows).toBe(8);
  });
});

describe("the Arabic ladder", () => {
  it("the five hand-charted names are used as drawn, bold first", () => {
    for (const n of ["علي", "سلمى", "ياسمين", "عثمان", "حمزة"]) {
      const a = art(n, null, 33, true);
      expect(a.blank).toBe(false);
      expect(a.bmp.length).toBeGreaterThanOrEqual(9);
      expect(bw(a.bmp)).toBeLessThanOrEqual(33);
      expect(Object.keys(AR_NAME)).toContain(n);
    }
    // the bold chart of علي is 17 wide and fits; the founder year goes before it in visual order
    const y = art("علي", 2026, 33, true);
    expect(y.bmp.join("")).toContain("*");
    expect(bw(y.bmp)).toBeLessThanOrEqual(33);
  });
  it("a name with no chart and no canvas is an empty rib band (server, tests)", () => {
    const a = art("فاطمة الزهراء", null, 33, true, none);
    expect(a.blank).toBe(true);
    expect(a.bmp.every((r) => r === "")).toBe(true);
    expect(a.rows).toBe(12);
  });
  it("a name with no chart is sampled, stepping down in rows until it fits", () => {
    const a = art("محمد", null, 33, true, block);
    expect(a.blank).toBe(false);
    expect(bw(a.bmp)).toBeLessThanOrEqual(33);
    expect(a.rows).toBeLessThanOrEqual(12);
    // a long name falls to several lines
    const long = arabicName("عبد الله يوسف المهدي", "", 33, block);
    expect(long.blank).toBe(false);
    expect(bw(long.bmp)).toBeLessThanOrEqual(33);
  });
  it("an empty name is an empty band, in the height a name would take", () => {
    expect(art("", null, 33, false).bmp.length).toBe(8);
    expect(art("", null, 33, true).bmp.length).toBe(12);
    expect(art("😀", 2026, 33, false).blank).toBe(true);
  });
});

describe("the estimate copies the charts", () => {
  it("letter widths", () => {
    const charts = { 8: N8, 7: N7, 6: N6 } as const;
    for (const { rows, w } of LATIN_WIDTHS)
      for (const [ch, width] of Object.entries(w))
        expect(
          `${rows} ${JSON.stringify(ch)} ${(charts[rows as 8 | 7 | 6] as Record<string, readonly string[]>)[ch][0].length}`,
        ).toBe(`${rows} ${JSON.stringify(ch)} ${width}`);
    // every chart letter is in the copy
    for (const { rows, w } of LATIN_WIDTHS)
      expect(Object.keys(w).sort()).toEqual(Object.keys(charts[rows as 8 | 7 | 6]).sort());
  });
  it("Arabic tier word rows", () => {
    for (const [tier, rows] of Object.entries(ARABIC_TIER_ROWS))
      expect(trimRows(AR_TIER[tier as keyof typeof AR_TIER]).length).toBe(rows);
  });
});

describe("estimateAspect (the box reserved before the renderer loads)", () => {
  const profiles = (name: string, tier: (typeof TIERS)[number], founder: number | null) =>
    ({ ...PROFILES.rated, name, tier, founder }) as CardProfile;
  const TIERS = [null, "homa", "stade", "pro", "champion", "legend"] as const;
  const NAMES = [
    "Ali",
    "Salma",
    "Yasmine",
    "Othmane",
    "Hamza",
    "Karim",
    "Abdelkarim",
    "Jean-Pierre",
    "Mohammed Abderrahmane",
    "Bouchra El Idrissi",
    "Zakaria",
    "Anas",
    "Fatima Zahra",
    "Youssef",
    "Reda",
    "Soufiane El Amrani",
    "Mehdi",
    "سلمى",
    "ياسمين",
    "علي",
    "عثمان",
    "حمزة",
    "",
  ];
  it("is exact for the fixtures that are not founders with long names or sampled Arabic", () => {
    for (const name of [
      "rated",
      "homa",
      "stade",
      "champion",
      "legend",
      "born0",
      "forming1",
      "first",
      "clubNull",
      "guest",
      "unnamed",
      "arabicCharted",
    ] as const)
      for (const s of LANGS) {
        const p = PROFILES[name] as CardProfile;
        expect(Math.abs(estimateAspect(p, s.lang) - R.aspect(p, s)) / R.aspect(p, s)).toBeLessThan(
          0.005,
        );
      }
  });
  it("stays within 11% of the drawn card for any name and tier; 98% of non-founders within 2%", () => {
    const stat = (founder: number | null) => {
      let total = 0;
      let within2 = 0;
      let within5 = 0;
      let worst = 0;
      for (const name of NAMES)
        for (const tier of TIERS)
          for (const s of LANGS) {
            const p = profiles(name, tier, founder);
            const real = R.aspect(p, s);
            const err = Math.abs(estimateAspect(p, s.lang) - real) / real;
            worst = Math.max(worst, err);
            total++;
            if (err < 0.02) within2++;
            if (err < 0.05) within5++;
          }
      return { within2: within2 / total, within5: within5 / total, worst };
    };
    const plain = stat(null);
    expect(plain.worst).toBeLessThan(0.11);
    expect(plain.within2).toBeGreaterThan(0.95);
    // the year (·26) sits after the name, above its end, or on a line of its own: the estimate
    // cannot see which without the charts, so a founder's box is looser
    const founder = stat(2026);
    expect(founder.worst).toBeLessThan(0.11);
    expect(founder.within5).toBeGreaterThan(0.9);
  });
  it("needs nothing the renderer loads: no chart, no drawing, no wordmark", async () => {
    const src = await Bun.file(new URL("./estimate.ts", import.meta.url)).text();
    const imports = [...src.matchAll(/from "([^"]+)"/g)].map((m) => m[1]);
    expect(imports.sort()).toEqual(["../types", "./geometry", "./knit-name"].sort());
    for (const f of ["geometry.ts", "knit-name.ts"]) {
      const s = await Bun.file(new URL(`./${f}`, import.meta.url)).text();
      expect(
        [...s.matchAll(/from "([^"]+)"/g)].map((m) => m[1]).filter((i) => i !== "../types"),
      ).toEqual([]);
    }
  });
  it("Arabic charts", () => {
    for (const [name, [rows, bold, thin]] of Object.entries(ARABIC_CHARTS)) {
      const a = trim(AR_NAME[name as keyof typeof AR_NAME].bmp);
      const b = trim(AR_NAME[`${name}~` as keyof typeof AR_NAME].bmp);
      expect([a.bmp.length, a.bmp[0].length, b.bmp[0].length]).toEqual([rows, bold, thin]);
    }
  });
});
