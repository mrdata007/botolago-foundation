import { describe, expect, test } from "bun:test";

import { hubRound } from "./hub-round";

const fx = (
  clubId: string,
  opponentClubId: string,
  isHome: boolean,
  kickoffAt?: string,
  isBlank = false,
) => ({ clubId, opponentClubId, isHome, kickoffAt, isBlank, gameweek: 2, difficulty: 3 as const });
const squadOf = (ids: string[]) => ({
  squad: ids.map((playerId, index) => ({ playerId, slot: index + 1 })),
});
const players = [
  { id: "p1", clubId: "a" },
  { id: "p2", clubId: "a" },
  { id: "p3", clubId: "b" },
  { id: "p4", clubId: "c" },
];

describe("hubRound", () => {
  test("a row per club the manager has players at, soonest first", () => {
    const round = hubRound(
      squadOf(["p1", "p2", "p4"]),
      players,
      [
        fx("a", "x", true, "2026-10-03T17:00:00Z"),
        fx("c", "y", false, "2026-10-02T17:00:00Z"),
        fx("x", "a", false, "2026-10-03T17:00:00Z"),
      ],
      2,
    );
    expect(round.fixtures.map((row) => row.clubId)).toEqual(["c", "a"]);
    expect(round.fixtures[1]!.playerIds).toEqual(["p1", "p2"]);
    expect(round.firstKickoff).toBe("2026-10-02T17:00:00Z");
    // c is away at y: the first match reads home first.
    expect(round.firstMatch).toEqual({ homeClubId: "y", awayClubId: "c" });
  });

  test("a club with no fixture, or a blank one, has no match", () => {
    const round = hubRound(
      squadOf(["p1", "p3", "p4"]),
      players,
      [fx("a", "x", true, "2026-10-03T17:00:00Z"), fx("b", "y", true, undefined, true)],
      2,
    );
    expect(round.noMatchClubIds.sort()).toEqual(["b", "c"]);
  });

  test("two of the manager's clubs meeting is one row, from the home side", () => {
    const round = hubRound(
      squadOf(["p1", "p3"]),
      players,
      [fx("a", "b", true, "2026-10-03T17:00:00Z"), fx("b", "a", false, "2026-10-03T17:00:00Z")],
      2,
    );
    expect(round.fixtures).toHaveLength(1);
    expect(round.fixtures[0]!.playerIds).toEqual(["p1"]);
    expect(round.fixtures[0]!.opponentPlayerIds).toEqual(["p3"]);
  });

  test("claims nothing when the round's fixtures are not known", () => {
    const round = hubRound(squadOf(["p1"]), players, [], 2);
    expect(round).toEqual({
      fixtures: [],
      noMatchClubIds: [],
      firstKickoff: null,
      firstMatch: null,
    });
  });
});
