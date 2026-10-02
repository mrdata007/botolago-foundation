import { describe, expect, test } from "bun:test";

import { startersWithoutMatch, suggestNoMatchSwap } from "./no-match-swap";
import { validateTeam } from "./team-validation";
import type { FantasyPlayer, Position, SquadPlayer } from "@/types/fantasy";

// 4-4-2: g1 | d1-d4 | m1-m4 | f1-f2 start; bench g2, d5, m5, f3.
const layout: [string, Position, string][] = [
  ["g1", "GK", "c1"],
  ["d1", "DEF", "c1"],
  ["d2", "DEF", "c2"],
  ["d3", "DEF", "c2"],
  ["d4", "DEF", "c3"],
  ["m1", "MID", "c3"],
  ["m2", "MID", "c4"],
  ["m3", "MID", "c4"],
  ["m4", "MID", "c5"],
  ["f1", "FWD", "c5"],
  ["f2", "FWD", "c6"],
  ["g2", "GK", "c7"],
  ["d5", "DEF", "c7"],
  ["m5", "MID", "c8"],
  ["f3", "FWD", "c8"],
];
const players = layout.map(([id, position, clubId]) => ({
  id,
  position,
  clubId,
})) as FantasyPlayer[];
const squadWith = (captain: string, vice: string): SquadPlayer[] =>
  layout.map(([playerId], index) => ({
    playerId,
    slot: index + 1,
    isCaptain: playerId === captain,
    isViceCaptain: playerId === vice,
  }));
const allPlay = ["c1", "c2", "c3", "c4", "c5", "c6", "c7", "c8"];
const playingWithout = (...missing: string[]) =>
  new Set(allPlay.filter((c) => !missing.includes(c)));

describe("suggestNoMatchSwap", () => {
  test("a starter with no match is swapped for the bench player of the same position", () => {
    // c6 (f2) has no match; f3 (c8) is on the bench and plays.
    const swap = suggestNoMatchSwap({
      squad: squadWith("m1", "d1"),
      players,
      playingClubIds: playingWithout("c6"),
      formation: "4-4-2",
    });
    expect(swap?.outId).toBe("f2");
    expect(swap?.inId).toBe("f3");
    expect(swap?.formationChanged).toBe(false);
    expect(validateTeam(swap!.squad, swap!.formation, players).ok).toBe(true);
  });

  test("falls back to another position and says the formation changes", () => {
    // c5 (f1) and f3's club c8 are out; m5 (c8) is out too, only d5 plays: DEF for FWD -> 5-4-1.
    const swap = suggestNoMatchSwap({
      squad: squadWith("m1", "d1"),
      players,
      playingClubIds: playingWithout("c5", "c8"),
      formation: "4-4-2",
    });
    expect(swap?.outId).toBe("m4");
    expect(swap?.inId).toBe("d5");
    expect(swap?.formation).toBe("5-3-2");
    expect(swap?.formationChanged).toBe(true);
    expect(validateTeam(swap!.squad, swap!.formation, players).ok).toBe(true);
  });

  test("the armband follows the swap", () => {
    // The captain f2 has no match: f3 takes the armband.
    const swap = suggestNoMatchSwap({
      squad: squadWith("f2", "d1"),
      players,
      playingClubIds: playingWithout("c6"),
      formation: "4-4-2",
    });
    expect(swap?.squad.find((place) => place.playerId === "f3")?.isCaptain).toBe(true);
    expect(swap?.squad.find((place) => place.playerId === "f2")?.isCaptain).toBe(false);
  });

  test("no swap when everyone plays, or the fixtures are not known, or no bench player plays", () => {
    const base = { squad: squadWith("m1", "d1"), players, formation: "4-4-2" as const };
    expect(suggestNoMatchSwap({ ...base, playingClubIds: new Set(allPlay) })).toBeNull();
    expect(suggestNoMatchSwap({ ...base, playingClubIds: null })).toBeNull();
    expect(
      suggestNoMatchSwap({ ...base, playingClubIds: playingWithout("c6", "c7", "c8") }),
    ).toBeNull();
  });
});

describe("startersWithoutMatch", () => {
  test("lists starters only, in slot order, and nothing for unknown fixtures", () => {
    const squad = squadWith("m1", "d1");
    expect(startersWithoutMatch(squad, players, playingWithout("c6", "c8"))).toEqual(["f2"]);
    expect(startersWithoutMatch(squad, players, null)).toEqual([]);
  });
});
