import { describe, expect, test } from "bun:test";

import { deadlineChecklist } from "./deadline-checklist";

const squad = (captainSlot: number | null) =>
  Array.from({ length: 15 }, (_, index) => ({
    playerId: `p${index + 1}`,
    slot: index + 1,
    isCaptain: index + 1 === captainSlot,
  }));
// Players 1-11 start; p1-p5 are at club "a", p6-p15 at club "b".
const players = Array.from({ length: 15 }, (_, index) => ({
  id: `p${index + 1}`,
  clubId: index < 5 ? "a" : "b",
}));
const fixture = (clubId: string, gameweek: number, isBlank = false) => ({
  clubId,
  gameweek,
  isBlank,
});

describe("deadlineChecklist", () => {
  test("a full XI with a captain, everyone playing", () => {
    const result = deadlineChecklist(
      { squad: squad(3) },
      players,
      [fixture("a", 2), fixture("b", 2)],
      2,
    );
    expect(result).toEqual({ startersSet: 11, captainSet: true, startersWithoutMatch: 0 });
  });

  test("counts starters whose club has no match, and only starters", () => {
    // Club "a" has no fixture in gameweek 2: its five starters have no match.
    const result = deadlineChecklist({ squad: squad(7) }, players, [fixture("b", 2)], 2);
    expect(result.startersWithoutMatch).toBe(5);
  });

  test("a blank gameweek counts as no match", () => {
    const result = deadlineChecklist(
      { squad: squad(7) },
      players,
      [fixture("a", 2, true), fixture("b", 2)],
      2,
    );
    expect(result.startersWithoutMatch).toBe(5);
  });

  test("claims nothing when the gameweek's fixtures are not known", () => {
    const result = deadlineChecklist({ squad: squad(7) }, players, [fixture("a", 3)], 2);
    expect(result.startersWithoutMatch).toBeNull();
  });

  test("a captain on the bench is no captain", () => {
    expect(deadlineChecklist({ squad: squad(13) }, players, [], 2).captainSet).toBe(false);
    expect(deadlineChecklist({ squad: squad(null) }, players, [], 2).captainSet).toBe(false);
  });
});
