import { describe, expect, it } from "bun:test";

import {
  changeDirection,
  countUpValue,
  easeOutCubic,
  flipOffsets,
  prefersReducedMotion,
  tokenMs,
} from "./motion";

describe("prefersReducedMotion", () => {
  it("answers true where there is no browser, so the server renders the finished state", () => {
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("tokenMs", () => {
  it("falls back where there is no page to read", () => {
    expect(tokenMs("--duration-hero", 420)).toBe(420);
  });
});

describe("countUpValue", () => {
  it("starts at the old number and ends exactly on the new one", () => {
    expect(countUpValue(10, 50, 0)).toBe(10);
    expect(countUpValue(10, 50, 1)).toBe(50);
    expect(countUpValue(10, 50, 2)).toBe(50);
  });

  it("moves forward in between, and keeps whole numbers whole", () => {
    const mid = countUpValue(0, 100, 0.5);
    expect(mid).toBeGreaterThan(50);
    expect(mid).toBeLessThan(100);
    expect(Number.isInteger(mid)).toBe(true);
  });

  it("counts down as well as up", () => {
    const mid = countUpValue(100, 0, 0.5);
    expect(mid).toBeLessThan(50);
    expect(mid).toBeGreaterThan(0);
  });

  it("keeps decimals when either end has them", () => {
    expect(Number.isInteger(countUpValue(0, 10.5, 0.4))).toBe(false);
  });

  it("does nothing when the number did not change", () => {
    expect(countUpValue(7, 7, 0.3)).toBe(7);
  });
});

describe("easeOutCubic", () => {
  it("is clamped to 0..1 and ends at 1", () => {
    expect(easeOutCubic(-1)).toBe(0);
    expect(easeOutCubic(0)).toBe(0);
    expect(easeOutCubic(1)).toBe(1);
    expect(easeOutCubic(5)).toBe(1);
  });
});

describe("changeDirection", () => {
  it("names the way a number moved", () => {
    expect(changeDirection(3, 5)).toBe("up");
    expect(changeDirection(5, 3)).toBe("down");
  });

  it("says nothing when it did not move or an end is unknown", () => {
    expect(changeDirection(4, 4)).toBeNull();
    expect(changeDirection(null, 4)).toBeNull();
    expect(changeDirection(4, undefined)).toBeNull();
  });
});

describe("flipOffsets", () => {
  it("gives each moved row the distance back to where it was", () => {
    const before = new Map([
      ["a", 0],
      ["b", 50],
      ["c", 100],
    ]);
    const after = new Map([
      ["b", 0],
      ["a", 50],
      ["c", 100],
    ]);
    const offsets = flipOffsets(before, after);
    expect(offsets.get("b")).toBe(50);
    expect(offsets.get("a")).toBe(-50);
    expect(offsets.has("c")).toBe(false);
  });

  it("ignores a new row and a row that went away", () => {
    const before = new Map([
      ["a", 0],
      ["gone", 50],
    ]);
    const after = new Map([
      ["new", 0],
      ["a", 50],
    ]);
    const offsets = flipOffsets(before, after);
    expect(offsets.has("new")).toBe(false);
    expect(offsets.has("gone")).toBe(false);
    expect(offsets.get("a")).toBe(-50);
  });

  it("gives nothing when the order is unchanged", () => {
    const rows = new Map([
      ["a", 0],
      ["b", 50],
    ]);
    expect(flipOffsets(rows, new Map(rows)).size).toBe(0);
  });
});
