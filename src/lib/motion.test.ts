import { describe, expect, it } from "bun:test";

import {
  changeDirection,
  countUpValue,
  easeOutCubic,
  flashClass,
  halfProgress,
  newAtTop,
  parallaxShift,
  readingProgress,
  tiltAngles,
  tickedMinute,
  turnedOnNow,
  flipOffsets,
  prefersReducedMotion,
  scrollBehavior,
  tokenMs,
} from "./motion";

describe("prefersReducedMotion", () => {
  it("answers true where there is no browser, so the server renders the finished state", () => {
    expect(prefersReducedMotion()).toBe(true);
  });
});

describe("scrollBehavior", () => {
  it("jumps where reduced motion is asked for (and on the server, which answers yes)", () => {
    expect(scrollBehavior()).toBe("auto");
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
  const at = (entries: Array<[string, number, number]>) =>
    new Map(entries.map(([key, x, y]) => [key, { x, y }] as const));

  it("gives each moved item the distance back to where it was", () => {
    const before = at([
      ["a", 0, 0],
      ["b", 0, 50],
      ["c", 0, 100],
    ]);
    const after = at([
      ["b", 0, 0],
      ["a", 0, 50],
      ["c", 0, 100],
    ]);
    const offsets = flipOffsets(before, after);
    expect(offsets.get("b")).toEqual({ x: 0, y: 50 });
    expect(offsets.get("a")).toEqual({ x: 0, y: -50 });
    expect(offsets.has("c")).toBe(false);
  });

  it("moves along both axes, as players swap places on a pitch", () => {
    const before = at([
      ["gk", 100, 0],
      ["st", 20, 200],
    ]);
    const after = at([
      ["st", 100, 0],
      ["gk", 20, 200],
    ]);
    const offsets = flipOffsets(before, after);
    expect(offsets.get("st")).toEqual({ x: -80, y: 200 });
    expect(offsets.get("gk")).toEqual({ x: 80, y: -200 });
  });

  it("ignores a new item and an item that went away", () => {
    const before = at([
      ["a", 0, 0],
      ["gone", 0, 50],
    ]);
    const after = at([
      ["new", 0, 0],
      ["a", 0, 50],
    ]);
    const offsets = flipOffsets(before, after);
    expect(offsets.has("new")).toBe(false);
    expect(offsets.has("gone")).toBe(false);
    expect(offsets.get("a")).toEqual({ x: 0, y: -50 });
  });

  it("ignores a move of less than a pixel", () => {
    expect(flipOffsets(at([["a", 0, 0.4]]), at([["a", 0, 0]])).size).toBe(0);
  });

  it("gives nothing when the order is unchanged", () => {
    const rows = at([
      ["a", 0, 0],
      ["b", 0, 50],
    ]);
    expect(flipOffsets(rows, new Map(rows)).size).toBe(0);
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

describe("tiltAngles", () => {
  it("is flat at the centre", () => {
    expect(tiltAngles(100, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: 0 });
  });

  it("leans towards the edge the pointer is near, at most `max` degrees", () => {
    expect(tiltAngles(200, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: 6 });
    expect(tiltAngles(0, 50, 200, 100)).toEqual({ rotateX: 0, rotateY: -6 });
    expect(tiltAngles(100, 0, 200, 100)).toEqual({ rotateX: 6, rotateY: 0 });
    expect(tiltAngles(100, 100, 200, 100)).toEqual({ rotateX: -6, rotateY: 0 });
  });

  it("never goes past the limit, even for a pointer outside the box", () => {
    expect(tiltAngles(900, -400, 200, 100, 4)).toEqual({ rotateX: 4, rotateY: 4 });
  });

  it("does nothing for a box with no size", () => {
    expect(tiltAngles(5, 5, 0, 0)).toEqual({ rotateX: 0, rotateY: 0 });
  });
});

describe("newAtTop", () => {
  it("names the cards that arrived above the old first one", () => {
    expect(newAtTop(["b", "c"], ["x", "y", "b", "c"])).toEqual(["x", "y"]);
  });

  it("ignores older cards added at the end (load more)", () => {
    expect(newAtTop(["a", "b"], ["a", "b", "c", "d"])).toEqual([]);
  });

  it("ignores the first load, when there was nothing before", () => {
    expect(newAtTop([], ["a", "b"])).toEqual([]);
  });

  it("ignores a different list, whose old first item is gone", () => {
    expect(newAtTop(["a", "b"], ["x", "y"])).toEqual([]);
  });

  it("ignores an unchanged list", () => {
    expect(newAtTop(["a", "b"], ["a", "b"])).toEqual([]);
  });
});

describe("readingProgress", () => {
  it("is nothing while the article is below the fold", () => {
    expect(readingProgress(800, 3000, 800)).toBe(0);
    expect(readingProgress(1200, 3000, 800)).toBe(0);
  });

  it("is everything once the article's end has gone off the top", () => {
    expect(readingProgress(-3000, 3000, 800)).toBe(1);
    expect(readingProgress(-5000, 3000, 800)).toBe(1);
  });

  it("is half way in the middle", () => {
    expect(readingProgress(-1100, 3000, 800)).toBe(0.5);
  });

  it("copes with an empty box", () => {
    expect(readingProgress(0, 0, 0)).toBe(0);
  });
});

describe("parallaxShift", () => {
  it("lags a fifth of the scroll and stops at the limit", () => {
    expect(parallaxShift(100)).toBe(20);
    expect(parallaxShift(1000)).toBe(48);
    expect(parallaxShift(1000, 30)).toBe(30);
  });

  it("does nothing above the top (rubber-banding)", () => {
    expect(parallaxShift(-80)).toBe(0);
  });
});

describe("turnedOnNow", () => {
  it("fires when a loaded flag goes from off to on", () => {
    expect(turnedOnNow(false, true, true, true)).toBe(true);
  });

  it("does not fire for a flag that was already on, or is off", () => {
    expect(turnedOnNow(true, true, true, true)).toBe(false);
    expect(turnedOnNow(false, false, true, true)).toBe(false);
    expect(turnedOnNow(true, false, true, true)).toBe(false);
  });

  it("does not fire while the data is still loading", () => {
    expect(turnedOnNow(false, true, false, false)).toBe(false);
  });

  it("does not fire on the render where the data has just arrived", () => {
    // Off while loading, on the moment it loads: the reader did nothing.
    expect(turnedOnNow(false, true, true, false)).toBe(false);
  });
});
