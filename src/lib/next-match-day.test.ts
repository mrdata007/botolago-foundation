import { describe, expect, test } from "bun:test";

import { latestResultDayBefore, nextMatchDayAfter } from "./match-days";

const m = (status: "scheduled" | "live" | "finished" | "postponed", kickoff: string) => ({
  status,
  kickoff,
});

describe("nextMatchDayAfter", () => {
  test("finds the earliest later day with a match to come", () => {
    const matches = [
      m("scheduled", "2026-10-03T17:00:00Z"),
      m("scheduled", "2026-10-02T17:00:00Z"),
    ];
    expect(nextMatchDayAfter(matches, "2026-10-01")).toBe("2026-10-02");
  });

  test("ignores finished and postponed matches and days not after", () => {
    const matches = [
      m("finished", "2026-10-02T17:00:00Z"),
      m("postponed", "2026-10-02T18:00:00Z"),
      m("scheduled", "2026-10-01T17:00:00Z"),
    ];
    expect(nextMatchDayAfter(matches, "2026-10-01")).toBeNull();
  });
});

describe("latestResultDayBefore", () => {
  const days = ["2026-09-12", "2026-09-27", "2026-10-01", "2026-09-30"];

  test("is the latest result before the day, whatever order the days come in", () => {
    expect(latestResultDayBefore(days, "2026-10-03")).toBe("2026-10-01");
    expect(latestResultDayBefore(days, "2026-10-01")).toBe("2026-09-30");
    expect(latestResultDayBefore(days, "2026-09-28")).toBe("2026-09-27");
  });

  test("is not the day itself: from a day with results the way on is an earlier one", () => {
    expect(latestResultDayBefore(days, "2026-09-12")).toBeNull();
  });

  test("is null when no result is behind the day, or there are none", () => {
    expect(latestResultDayBefore(days, "2026-09-01")).toBeNull();
    expect(latestResultDayBefore([], "2026-10-03")).toBeNull();
  });
});
