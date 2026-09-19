import { describe, expect, test } from "bun:test";
import { sortStartingXi } from "./LineupsView";

interface Player {
  id: string;
  position: string | null;
  order: number;
}

describe("sortStartingXi", () => {
  test("orders players goalkeeper, defenders, midfielders, then forwards", () => {
    const players: Player[] = [
      { id: "fwd-1", position: "forward", order: 1 },
      { id: "gk-1", position: "goalkeeper", order: 1 },
      { id: "mid-1", position: "midfielder", order: 2 },
      { id: "def-1", position: "defender", order: 1 },
      { id: "mid-2", position: "midfielder", order: 1 },
    ];

    const sorted = sortStartingXi(players);

    expect(sorted.map((p) => p.id)).toEqual(["gk-1", "def-1", "mid-2", "mid-1", "fwd-1"]);
  });

  test("keeps players with an unknown/missing position at the end", () => {
    const players: Player[] = [
      { id: "unknown-1", position: null, order: 1 },
      { id: "gk-1", position: "goalkeeper", order: 1 },
    ];

    const sorted = sortStartingXi(players);

    expect(sorted.map((p) => p.id)).toEqual(["gk-1", "unknown-1"]);
  });

  test("does not mutate the input array", () => {
    const players: Player[] = [
      { id: "fwd-1", position: "forward", order: 1 },
      { id: "gk-1", position: "goalkeeper", order: 1 },
    ];
    const original = [...players];

    sortStartingXi(players);

    expect(players).toEqual(original);
  });
});
