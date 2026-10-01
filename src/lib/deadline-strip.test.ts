import { describe, expect, test } from "bun:test";

import { deadlineStripTime } from "./deadline-strip";

const left = (days: number, hours: number, minutes: number, passed = false) => ({
  days,
  hours,
  minutes,
  passed,
});

describe("deadlineStripTime", () => {
  test("shows total hours and minutes inside the 72 hour window", () => {
    expect(deadlineStripTime(left(0, 23, 58))).toEqual({ hours: 23, minutes: 58 });
    expect(deadlineStripTime(left(2, 23, 59))).toEqual({ hours: 71, minutes: 59 });
  });

  test("is hidden further out, once passed, and before the clock is known", () => {
    expect(deadlineStripTime(left(3, 0, 1))).toBeNull();
    expect(deadlineStripTime(left(4, 5, 0))).toBeNull();
    expect(deadlineStripTime(left(0, 0, 0, true))).toBeNull();
    expect(deadlineStripTime(null)).toBeNull();
  });
});
