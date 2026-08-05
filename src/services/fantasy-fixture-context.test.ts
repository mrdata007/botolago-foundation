import { describe, expect, test } from "bun:test";

import { buildFixtureDifficultyContext } from "./fantasy-fixture-context";

describe("Fantasy fixture decision context", () => {
  test("derives blank rows and preserves double gameweeks", () => {
    const result = buildFixtureDifficultyContext({
      gameweeks: [4, 3],
      rows: [
        {
          clubId: "club-a",
          gameweek: 3,
          opponentClubId: "club-b",
          kickoffAt: "2026-08-10T18:00:00Z",
          isHome: true,
          difficulty: 2,
        },
        {
          clubId: "club-a",
          gameweek: 3,
          opponentClubId: "club-c",
          kickoffAt: "2026-08-12T18:00:00Z",
          isHome: false,
          difficulty: 4,
        },
        {
          clubId: "club-b",
          gameweek: 3,
          opponentClubId: "club-a",
          kickoffAt: "2026-08-10T18:00:00Z",
          isHome: false,
          difficulty: 3,
        },
        {
          clubId: "club-c",
          gameweek: 3,
          opponentClubId: "club-a",
          kickoffAt: "2026-08-12T18:00:00Z",
          isHome: true,
          difficulty: 2,
        },
        {
          clubId: "club-b",
          gameweek: 4,
          opponentClubId: "club-c",
          kickoffAt: "2026-08-18T18:00:00Z",
          isHome: true,
          difficulty: 2,
        },
        {
          clubId: "club-c",
          gameweek: 4,
          opponentClubId: "club-b",
          kickoffAt: "2026-08-18T18:00:00Z",
          isHome: false,
          difficulty: 3,
        },
      ],
    });

    expect(result.filter((row) => row.clubId === "club-a" && row.gameweek === 3)).toHaveLength(2);
    expect(
      result
        .filter((row) => row.clubId === "club-a" && row.gameweek === 3)
        .every((row) => row.isDouble),
    ).toBe(true);
    expect(result.find((row) => row.clubId === "club-a" && row.gameweek === 4)).toMatchObject({
      isBlank: true,
      opponentClubId: "",
    });
  });

  test("does not invent clubs when the authoritative window has no fixtures", () => {
    expect(buildFixtureDifficultyContext({ rows: [], gameweeks: [3] })).toEqual([]);
  });
});
