import { describe, expect, test } from "bun:test";

import { deadlineCountdown, formatDeadline } from "./deadline";

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
  test("reads the deadline in Casablanca time in both languages", () => {
    const fr = formatDeadline(DEADLINE, "fr");
    expect(fr).toContain("24");
    expect(fr).toContain("19:30");
    const ar = formatDeadline(DEADLINE, "ar");
    expect(ar).toContain("19:30");
  });

  test("adds the weekday only when asked", () => {
    expect(formatDeadline(DEADLINE, "fr")).not.toMatch(/jeu/);
    expect(formatDeadline(DEADLINE, "fr", { weekday: "short" })).toMatch(/^jeu\.?/);
    expect(formatDeadline(DEADLINE, "fr", { weekday: "long" })).toMatch(/^jeudi/);
  });
});
