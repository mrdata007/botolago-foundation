import { describe, expect, test } from "bun:test";
import { formatLiveAge, liveAge } from "./live-age";

const T = Date.parse("2026-10-26T20:00:00Z");
const stored = (minutesAgo: number) => ({
  dataUpdatedAt: new Date(T - minutesAgo * 60_000).toISOString(),
});

describe("liveAge", () => {
  test("measures from the stored update time, not from the last read", () => {
    // The page read a second ago, but the row was written 4 minutes ago.
    expect(liveAge(stored(4), T - 1000, T)).toEqual({ unit: "minute", value: 4 });
  });
  test("under a minute is now; an hour or more is counted in hours", () => {
    expect(liveAge(stored(0), 0, T)).toEqual({ unit: "now" });
    expect(liveAge(stored(59), 0, T)).toEqual({ unit: "minute", value: 59 });
    expect(liveAge(stored(125), 0, T)).toEqual({ unit: "hour", value: 2 });
  });
  test("a time ahead of this device's clock counts as now", () => {
    expect(liveAge({ dataUpdatedAt: new Date(T + 5 * 60_000).toISOString() }, 0, T)).toEqual({
      unit: "now",
    });
  });
  test("falls back to the read time, and says nothing when nothing is known", () => {
    expect(liveAge({}, T - 3 * 60_000, T)).toEqual({ unit: "minute", value: 3 });
    expect(liveAge({ dataUpdatedAt: "garbage" }, T - 3 * 60_000, T)).toEqual({
      unit: "minute",
      value: 3,
    });
    expect(liveAge(undefined, 0, T)).toBeNull();
  });
});

describe("formatLiveAge", () => {
  test("reads naturally in French and Arabic", () => {
    expect(formatLiveAge({ unit: "minute", value: 2 }, "fr")).toMatch(/^il y a\s2\smin$/);
    expect(formatLiveAge({ unit: "minute", value: 2 }, "ar")).toContain("دقيقتين");
  });
});
