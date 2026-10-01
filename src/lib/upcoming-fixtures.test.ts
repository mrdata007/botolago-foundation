import { describe, expect, test } from "bun:test";

import { upcomingFixtures } from "@/lib/upcoming-fixtures";

const now = Date.parse("2026-10-01T12:00:00Z");

describe("upcomingFixtures", () => {
  test("drops a match that has already been played", () => {
    const rows = [
      { gameweek: 1, kickoffAt: "2026-09-27T20:00:00Z" },
      { gameweek: 2, kickoffAt: "2026-10-02T16:00:00Z" },
    ];
    expect(upcomingFixtures(rows, now).map((row) => row.gameweek)).toEqual([2]);
  });

  test("keeps a match that has not kicked off, and drops one that kicks off right now", () => {
    expect(upcomingFixtures([{ kickoffAt: "2026-10-01T12:00:01Z" }], now)).toHaveLength(1);
    expect(upcomingFixtures([{ kickoffAt: "2026-10-01T12:00:00Z" }], now)).toHaveLength(0);
  });

  test("keeps a row it cannot date: unknown is not played", () => {
    expect(
      upcomingFixtures([{ kickoffAt: undefined }, { kickoffAt: "not a date" }], now),
    ).toHaveLength(2);
  });

  test("never adds a row", () => {
    expect(upcomingFixtures([], now)).toEqual([]);
  });
});
