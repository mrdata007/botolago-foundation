import { describe, expect, it } from "bun:test";

import {
  changeDirection,
  countUpValue,
  easeOutCubic,
  flashClass,
  halfProgress,
  tickedMinute,
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

describe("flashClass", () => {
  it("is green when a higher-is-better number rises, red when it falls", () => {
    expect(flashClass("up", "higher")).toBe("flash-up");
    expect(flashClass("down", "higher")).toBe("flash-down");
  });

  it("is turned round for a rank, where a lower number is the better one", () => {
    expect(flashClass("down", "lower")).toBe("flash-up");
    expect(flashClass("up", "lower")).toBe("flash-down");
  });

  it("is nothing when the number did not move", () => {
    expect(flashClass(null)).toBeNull();
  });
});

describe("tickedMinute", () => {
  const t0 = 1_000_000;

  it("is the data's minute until a whole minute has passed", () => {
    expect(tickedMinute(63, t0, t0)).toBe(63);
    expect(tickedMinute(63, t0, t0 + 59_000)).toBe(63);
  });

  it("moves up one after a minute with no new figure", () => {
    expect(tickedMinute(63, t0, t0 + 61_000)).toBe(64);
  });

  it("never runs more than one ahead, however long the feed is quiet", () => {
    expect(tickedMinute(63, t0, t0 + 10 * 60_000)).toBe(64);
    expect(tickedMinute(63, t0, t0 + 10 * 60_000, 2)).toBe(65);
  });

  it("has nothing to tick when there is no minute", () => {
    expect(tickedMinute(undefined, t0, t0 + 120_000)).toBeUndefined();
  });

  it("does not run backwards if the clock does", () => {
    expect(tickedMinute(63, t0, t0 - 5_000)).toBe(63);
  });
});

describe("halfProgress", () => {
  it("fills the first half over 45 minutes and the second over the next 45", () => {
    expect(halfProgress(0, false)).toEqual({ first: 0, second: 0 });
    expect(halfProgress(30, false)).toEqual({ first: 30 / 45, second: 0 });
    expect(halfProgress(45, false)).toEqual({ first: 1, second: 0 });
    expect(halfProgress(67.5, false)).toEqual({ first: 1, second: 0.5 });
    expect(halfProgress(90, false)).toEqual({ first: 1, second: 1 });
  });

  it("stops at full for stoppage and extra time", () => {
    expect(halfProgress(97, false)).toEqual({ first: 1, second: 1 });
  });

  it("shows the break at half-time, whatever the minute", () => {
    expect(halfProgress(45, true)).toEqual({ first: 1, second: 0 });
    expect(halfProgress(undefined, true)).toEqual({ first: 1, second: 0 });
  });

  it("is empty with no minute", () => {
    expect(halfProgress(undefined, false)).toEqual({ first: 0, second: 0 });
  });
});
