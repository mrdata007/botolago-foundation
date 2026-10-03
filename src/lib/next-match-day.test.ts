import { describe, expect, test } from "bun:test";

import { nextMatchDayAfter } from "./match-days";

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
