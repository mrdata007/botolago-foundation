import { describe, expect, it } from "bun:test";

import { barWidth, compareValues } from "./h2h";

describe("face-à-face's comparison", () => {
  it("says which value is higher, a tie, or nothing to compare", () => {
    expect(compareValues(91, 85)).toBe("a");
    expect(compareValues(80, 85)).toBe("b");
    expect(compareValues(78, 78)).toBe("equal");
    expect(compareValues(null, 85)).toBe("none");
    expect(compareValues(80, null)).toBe("none");
    expect(compareValues(null, null)).toBe("none");
  });
  it("draws the bar as value ÷ 99 of 48 px", () => {
    expect(barWidth(99)).toBe(48);
    expect(barWidth(50)).toBeCloseTo(24.2, 1);
    expect(barWidth(0)).toBe(0);
    expect(barWidth(120)).toBe(48);
  });
});
