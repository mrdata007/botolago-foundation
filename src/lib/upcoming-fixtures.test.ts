import { describe, expect, test } from "bun:test";

import type { FixtureDifficulty } from "@/types/fantasy";

import { upcomingFixtures } from "./upcoming-fixtures";

const fx = (gameweek: number, kickoffAt?: string): FixtureDifficulty => ({
  clubId: "a",
  gameweek,
  opponentClubId: "b",
  isHome: true,
  difficulty: 3,
  kickoffAt,
});

describe("upcomingFixtures", () => {
  const now = new Date("2026-10-01T12:00:00Z");

  test("drops a match that already kicked off", () => {
    const out = upcomingFixtures(
      [fx(1, "2026-09-20T17:00:00Z"), fx(2, "2026-10-02T17:00:00Z")],
      now,
    );
    expect(out.map((f) => f.gameweek)).toEqual([2]);
  });

  test("keeps a fixture with no kickoff time", () => {
    expect(upcomingFixtures([fx(2)], now)).toHaveLength(1);
  });

  test("keeps a fixture with an unreadable kickoff time", () => {
    expect(upcomingFixtures([fx(2, "not a date")], now)).toHaveLength(1);
  });
});
