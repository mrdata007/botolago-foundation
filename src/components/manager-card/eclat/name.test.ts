import { describe, expect, it } from "bun:test";

import { HOSTILE_NAMES } from "../markup-safety";
import { RULE_Y, NAME_BUDGET, POINT_Y } from "./geometry";
import { measureTable } from "./measure";
import { cleanName, fitLabel, layoutName, PARTICLES } from "./name";

const lay = (name: string, o: { plaque?: boolean; compact?: boolean } = {}) =>
  layoutName(name, {
    plaque: o.plaque ?? true,
    compact: o.compact ?? false,
    measure: measureTable,
  });

/** The fixtures of plan 4. */
const FIXTURES = [
  "Ali",
  "Les Lions du Derb Sidi Maarouf",
  "Abdelkarim Benjelloun-Alaoui",
  "فاطمة الزهراء",
  "عبد الرحمن بن جلون العلوي",
  "Mohammedabdelhakimalaoui",
  "Yasmine Alaoui",
  "Karim Bennani",
  "سلمى",
  "Hamza",
] as const;

describe("cleanName (plan 4)", () => {
  const table: [string, string][] = [
    ["ali", "ALI"],
    ["  Ali   Ben  ", "ALI BEN"],
    // accents are kept, uppercased in French
    ["Élodie Côté", "ÉLODIE CÔTÉ"],
    ["Hélène", "HÉLÈNE"],
    // apostrophes, hyphens and dots stay; other punctuation and symbols go
    ["M'Barek", "M'BAREK"],
    ["M’Barek", "M'BAREK"],
    ["Jean – Pierre", "JEAN-PIERRE"],
    ["A. Benali", "A. BENALI"],
    ["Ali 😀", "ALI"],
    ["Ali★Best", "ALIBEST"],
    ["😀🔥", ""],
    ["", ""],
    ["   ", ""],
    // Arabic: no tatweel, no harakat
    ["عـلـي", "علي"],
    ["عَلِيّ", "علي"],
    ["فاطمة الزهراء", "فاطمة الزهراء"],
    // control and direction characters go
    ["‮evil‬", "EVIL"],
    ["A​B", "AB"],
    ["Ali\nBen", "ALI BEN"],
  ];
  for (const [raw, clean] of table)
    it(`${JSON.stringify(raw)} → ${JSON.stringify(clean)}`, () => {
      expect(cleanName(raw)).toBe(clean);
    });

  it("only ever returns letters, digits, spaces, apostrophes, dots and hyphens", () => {
    for (const raw of [...HOSTILE_NAMES, "\u0000\u0007x", "A​B", "<<>>&&\"\"''"]) {
      expect(cleanName(raw)).toMatch(/^[\p{L}\p{N} '.-]*$/u);
    }
  });
});

describe("the split (plan 4)", () => {
  const split = (name: string) => lay(name).lines.map((l) => l.text);

  it("puts one word on one line, two words on two", () => {
    expect(split("Ali")).toEqual(["ALI"]);
    expect(split("Ali Ben")).toEqual(["ALI", "BEN"]);
  });

  it("takes the first word, or the first two when it is a particle (three words or more)", () => {
    expect(split("Les Lions du Derb Sidi Maarouf")).toEqual(["LES LIONS", "DU DERB SIDI MAAROUF"]);
    expect(split("عبد الرحمن بن جلون العلوي")).toEqual(["عبد الرحمن", "بن جلون العلوي"]);
    expect(split("Abdelkarim Benjelloun-Alaoui")).toEqual(["ABDELKARIM", "BENJELLOUN-ALAOUI"]);
    // two words keep the particle on its own line: the rule needs three words
    expect(split("El Bakkali")).toEqual(["EL", "BAKKALI"]);
    expect(split("Karim El Bakkali")).toEqual(["KARIM", "EL BAKKALI"]);
    expect(PARTICLES.has("ABD")).toBe(true);
  });

  it("sets the faces: Changa over the serif; Changa over Changa Light in Arabic", () => {
    expect(lay("Yasmine Alaoui").lines.map((l) => l.face)).toEqual(["d", "s"]);
    expect(lay("فاطمة الزهراء").lines.map((l) => l.face)).toEqual(["d", "dl"]);
    expect(lay("Ali").lines.map((l) => l.face)).toEqual(["s"]);
    expect(lay("سلمى").lines.map((l) => l.face)).toEqual(["d"]);
    expect(lay("فاطمة الزهراء").rtl).toBe(true);
    expect(lay("Ali").rtl).toBe(false);
  });

  it("draws an empty name as the empty name's rule", () => {
    const empty = lay("");
    expect(empty.empty).toBe(true);
    expect(empty.lines).toEqual([]);
    expect(empty.emptyY).toBe(1300);
    expect(lay("", { plaque: false }).emptyY).toBe(1229);
  });
});

describe("the fit (plan 4)", () => {
  it("fits every fixture inside the 790 budget, in both script faces", () => {
    for (const name of FIXTURES) {
      for (const compact of [false, true]) {
        for (const l of lay(name, { compact }).lines) {
          const width = measureTable(l.text, l.face).w * l.size;
          // a line spaced to the budget is the budget; the rest fit with the rounding of one tenth
          expect(l.textLength ?? width, `${name} ${l.kind}`).toBeLessThanOrEqual(NAME_BUDGET + 1.5);
        }
      }
    }
  });

  it("keeps the sizes of the plan: 80 / 120 for two words, 144 for a short one", () => {
    expect(lay("Ali").lines[0]!.size).toBe(144);
    const two = lay("Yasmine Alaoui").lines;
    expect(two[0]!.size).toBe(80);
    expect(two[1]!.size).toBe(120);
  });

  it("measured: BENJELLOUN-ALAOUI fits at about 92 and the 24-letter word at about 67", () => {
    const benj = lay("Abdelkarim Benjelloun-Alaoui").lines[1]!;
    expect(benj.size).toBeGreaterThan(90);
    expect(benj.size).toBeLessThan(105);
    const long = lay("Mohammedabdelhakimalaoui").lines[0]!;
    expect(long.size).toBeGreaterThan(64);
    expect(long.size).toBeLessThan(70);
    expect(long.textLength).toBeUndefined();
  });

  it("drops the last words of a second line that is below its minimum, never part of a word", () => {
    const l = lay(
      "Mohammed Abderrahmane Benjelloun Touimi Alaoui Hassani Idrissi Sidi Karim",
    ).lines;
    expect(l).toHaveLength(2);
    const words = l[1]!.text.split(" ");
    const full = "ABDERRAHMANE BENJELLOUN TOUIMI ALAOUI HASSANI IDRISSI SIDI KARIM".split(" ");
    expect(words.length).toBeLessThan(full.length);
    expect(words).toEqual(full.slice(0, words.length));
    expect(l[1]!.size).toBeGreaterThanOrEqual(80);
  });

  it("sets a single word that still does not fit at its minimum with its spacing opened or closed", () => {
    const l = lay("Ab".repeat(30)).lines[0]!;
    expect(l.size).toBe(64);
    expect(l.textLength).toBe(NAME_BUDGET);
    const first = lay("Mohammedabdelhakimalaoui Ali").lines[0]!;
    expect(first.size).toBeGreaterThanOrEqual(56);
  });

  it("fits the face-à-face card's first line at 60 at least", () => {
    for (const name of FIXTURES) {
      const lines = lay(name, { compact: true }).lines;
      const first = lines[0]!;
      expect(first.size, name).toBeGreaterThanOrEqual(lines.length === 2 ? 60 : 64);
    }
  });

  it("fits an Arabic stat label to 165 units, never below 26", () => {
    for (const label of ["القائد", "التشكيلة", "الانتقالات", "الثبات"]) {
      const size = fitLabel(label, measureTable);
      expect(size).toBeGreaterThanOrEqual(26);
      expect(size).toBeLessThanOrEqual(34);
      expect(measureTable(label, "a").w * size).toBeLessThanOrEqual(165 + 1);
    }
  });
});

describe("the placement by ink (plan 4)", () => {
  it("ends the last line's ink at least 14 above the rule and keeps 12 between two lines", () => {
    for (const name of FIXTURES) {
      for (const plaque of [true, false]) {
        const { lines } = lay(name, { plaque });
        const last = lines[lines.length - 1]!;
        const m = measureTable(last.text, last.face);
        expect(last.y + m.d * last.size, `${name} ink to the rule`).toBeLessThanOrEqual(
          RULE_Y - 14 + 0.1,
        );
        if (lines.length === 2) {
          const f = lines[0]!;
          const mf = measureTable(f.text, f.face);
          const gap = last.y - m.a * last.size - (f.y + mf.d * f.size);
          expect(gap, `${name} between the lines`).toBeGreaterThanOrEqual(12 - 0.1);
        }
      }
    }
  });

  it("keeps the first line's ink 20 below the plaque (or the point), none too tall", () => {
    for (const name of FIXTURES) {
      const withPlaque = lay(name);
      expect(withPlaque.tooTall, name).toBe(false);
      const f = withPlaque.lines[0]!;
      expect(f.y - measureTable(f.text, f.face).a * f.size).toBeGreaterThanOrEqual(1142 + 20);
      const bare = lay(name, { plaque: false });
      expect(bare.tooTall, name).toBe(false);
    }
  });

  it("centres a name with no plaque by its ink between the shield's point and the rule", () => {
    const { lines } = lay("Ali", { plaque: false });
    const l = lines[0]!;
    const m = measureTable(l.text, l.face);
    const top = l.y - m.a * l.size;
    const bottom = l.y + m.d * l.size;
    expect(top - POINT_Y).toBeCloseTo(RULE_Y - bottom, 0);
  });

  it("keeps the rated cards' baselines under a plaque, forming or not", () => {
    expect(lay("Ali").lines[0]!.y).toBe(1316);
    const two = lay("Yasmine Alaoui").lines;
    expect(two[0]!.y).toBeLessThanOrEqual(1236);
    expect(two[0]!.y).toBeGreaterThan(1200);
  });
});
