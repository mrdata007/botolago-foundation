import { describe, expect, test } from "bun:test";

import { deadlineCountdown, deadlineParts, formatDeadline } from "./deadline";

const DEADLINE = "2026-09-24T18:30:00Z";
const at = (iso: string) => Date.parse(iso);

describe("deadlineCountdown", () => {
  test("splits what is left into whole days, hours and minutes", () => {
    expect(deadlineCountdown(DEADLINE, at("2026-09-23T04:31:30Z"))).toEqual({
      days: 1,
      hours: 13,
      minutes: 58,
      passed: false,
    });
  });

  test("rounds down, so the last minute still reads 0 minutes rather than 1", () => {
    expect(deadlineCountdown(DEADLINE, at("2026-09-24T18:29:30Z"))).toEqual({
      days: 0,
      hours: 0,
      minutes: 0,
      passed: false,
    });
  });

  test("is passed at and after the deadline, never negative", () => {
    for (const now of ["2026-09-24T18:30:00Z", "2026-09-26T09:00:00Z"]) {
      expect(deadlineCountdown(DEADLINE, at(now))).toEqual({
        days: 0,
        hours: 0,
        minutes: 0,
        passed: true,
      });
    }
  });

  test("answers null for a date that does not parse", () => {
    expect(deadlineCountdown("not a date", Date.now())).toBeNull();
  });
});

describe("formatDeadline", () => {
  // BG-0100: the competition's calendar, not the machine running the test.
  // From 2026-09-20 Morocco is UTC+0 all year, so 18:30Z reads 18:30 there.
  test("reads the deadline in Casablanca time in both languages", () => {
    const fr = formatDeadline(DEADLINE, "fr");
    expect(fr).toContain("24");
    expect(fr).toContain("18:30");
    const ar = formatDeadline(DEADLINE, "ar");
    expect(ar).toContain("18:30");
  });

  test("still reads UTC+1 for a deadline before the change", () => {
    const before = "2026-09-10T18:30:00Z"; // 19:30 in Casablanca, UTC+1
    expect(formatDeadline(before, "fr")).toContain("19:30");
    expect(formatDeadline(before, "ar")).toContain("19:30");
  });

  test("adds the weekday only when asked", () => {
    expect(formatDeadline(DEADLINE, "fr")).not.toMatch(/jeu/);
    expect(formatDeadline(DEADLINE, "fr", { weekday: "short" })).toMatch(/^jeu\.?/);
    expect(formatDeadline(DEADLINE, "fr", { weekday: "long" })).toMatch(/^jeudi/);
  });
});

describe("deadlineParts", () => {
  const now = Date.parse("2026-10-01T12:00:00Z");

  test("counts whole hours (days included), minutes and seconds", () => {
    // 2 days 23 h 58 min 07 s ahead.
    const parts = deadlineParts("2026-10-04T11:58:07Z", now);
    expect(parts).toEqual({ hours: 71, minutes: 58, seconds: 7, passed: false });
  });

  test("is passed, and all zeros, once the deadline has gone", () => {
    expect(deadlineParts("2026-10-01T11:59:59Z", now)).toEqual({
      hours: 0,
      minutes: 0,
      seconds: 0,
      passed: true,
    });
    expect(deadlineParts("2026-10-01T12:00:00Z", now)?.passed).toBe(true);
  });

  test("is null for a date that does not parse", () => {
    expect(deadlineParts("not a date", now)).toBeNull();
  });
});
