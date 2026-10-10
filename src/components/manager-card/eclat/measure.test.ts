import { describe, expect, it } from "bun:test";

import { GLYPHS, KERN, NUMBERS } from "./metrics";
import { measureTable, measureText, tableInk } from "./measure";

describe("the committed face metrics (plan 4, « Measuring »)", () => {
  it("has a box for every rating 1 to 99 and the dash", () => {
    for (let n = 1; n <= 99; n++) expect(NUMBERS[String(n)], String(n)).toBeDefined();
    expect(NUMBERS["—"]).toBeDefined();
  });

  it("has every capital, digit and sign a cleaned name can hold, in both Latin faces", () => {
    for (const face of ["d", "s"] as const) {
      for (const ch of "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789 -'.ÀÂÇÈÉÊËÎÏÔÙÛÜŒ") {
        expect(GLYPHS[face][ch], `${face} ${ch}`).toBeDefined();
      }
    }
  });

  it("measures a rating whole and a name by its letters and their kerning", () => {
    const n = tableInk("88", "d");
    expect(n.w).toBeGreaterThan(1);
    expect(n.x1 - n.x0).toBeLessThan(n.w);
    // kerning is applied: « AV » is narrower than « A » plus « V » in the serif
    expect(KERN.s.AV).toBeLessThan(0);
    const a = tableInk("A", "s").w;
    const v = tableInk("V", "s").w;
    expect(tableInk("AV", "s").w).toBeCloseTo(a + v + KERN.s.AV! / 100, 5);
  });

  it("falls back on an average per letter for Arabic and on the widest letter for the unknown", () => {
    const ar = tableInk("فاطمة", "d");
    expect(ar.w).toBeGreaterThan(1.5);
    expect(ar.a).toBeGreaterThan(0.5);
    expect(tableInk("Ω", "d").w).toBeGreaterThan(0.2);
  });

  it("is the table where there is no canvas (a server, a test), and the same for every call", () => {
    expect(typeof document).toBe("undefined");
    for (const text of ["ALI", "BENJELLOUN-ALAOUI", "99", "—"]) {
      expect(measureText(text, "s")).toEqual(measureTable(text, "s"));
    }
    expect(measureText("ALI", "d")).toEqual(measureText("ALI", "d"));
  });

  it("measures accented capitals as the letter they are built on, kerning included", () => {
    expect(tableInk("É", "d").w).toBeCloseTo(GLYPHS.d["É"]![0] / 100, 5);
    expect(tableInk("ÉA", "d").w).toBeGreaterThan(tableInk("É", "d").w);
  });
});
