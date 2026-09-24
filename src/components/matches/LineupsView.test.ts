import { describe, expect, test } from "bun:test";
import { sortStartingXi } from "./LineupsView";
import { lineBlockStart, parseFormation, pitchLines, slotInlineStart } from "./lineup-pitch";

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

/** An XI with `def`/`mid`/`fwd` players per group, orders counting up within each. */
function xi(def: number, mid: number, fwd: number): Player[] {
  const group = (position: string, count: number, prefix: string) =>
    Array.from({ length: count }, (_, index) => ({
      id: `${prefix}-${index + 1}`,
      position,
      order: index + 1,
    }));
  return [
    ...group("forward", fwd, "fwd"),
    ...group("midfielder", mid, "mid"),
    { id: "gk-1", position: "goalkeeper", order: 1 },
    ...group("defender", def, "def"),
  ];
}

const ids = (lines: Player[][] | null) => lines?.map((line) => line.map((player) => player.id));

describe("parseFormation", () => {
  test("reads the outfield lines, defence first", () => {
    expect(parseFormation("4-2-3-1")).toEqual([4, 2, 3, 1]);
    expect(parseFormation("4-4-2")).toEqual([4, 4, 2]);
    expect(parseFormation(" 3-5-2 ")).toEqual([3, 5, 2]);
  });

  test("rejects anything that is not ten outfield players in drawable lines", () => {
    for (const bad of [null, undefined, "", "442", "4-4-3", "4-x-2", "4--4-2", "7-2-1", "0-5-5"]) {
      expect(parseFormation(bad)).toBeNull();
    }
  });
});

describe("pitchLines", () => {
  test("cuts the sorted outfield into the formation's lines, goalkeeper first", () => {
    expect(ids(pitchLines(xi(4, 5, 1), "4-2-3-1"))).toEqual([
      ["gk-1"],
      ["def-1", "def-2", "def-3", "def-4"],
      ["mid-1", "mid-2"],
      ["mid-3", "mid-4", "mid-5"],
      ["fwd-1"],
    ]);
  });

  test("without a formation, the position groups are the lines", () => {
    expect(ids(pitchLines(xi(4, 4, 2), null))).toEqual([
      ["gk-1"],
      ["def-1", "def-2", "def-3", "def-4"],
      ["mid-1", "mid-2", "mid-3", "mid-4"],
      ["fwd-1", "fwd-2"],
    ]);
    // A malformed formation string falls back the same way.
    expect(ids(pitchLines(xi(4, 4, 2), "4-4"))).toEqual(ids(pitchLines(xi(4, 4, 2), null)));
  });

  test("gives up (null) rather than guessing where the data does not say", () => {
    const noKeeper = xi(5, 4, 2).filter((player) => player.position !== "goalkeeper");
    expect(pitchLines(noKeeper, "4-4-2")).toBeNull();
    const unknown = xi(4, 4, 2).map((player, index) =>
      index === 0 ? { ...player, position: null } : player,
    );
    expect(pitchLines(unknown, "4-4-2")).toBeNull();
    expect(pitchLines(xi(4, 4, 1), "4-4-2")).toBeNull();
    // Ten outfielders in one group cannot be drawn as one line.
    expect(pitchLines(xi(10, 0, 0), null)).toBeNull();
  });

  test("does not mutate the input", () => {
    const players = xi(4, 3, 3);
    const copy = [...players];
    pitchLines(players, "4-3-3");
    expect(players).toEqual(copy);
  });
});

describe("pitch geometry", () => {
  test("spreads a line evenly across the width, mirrored for the away side", () => {
    expect([0, 1, 2, 3].map((index) => slotInlineStart(index, 4, false))).toEqual([
      12.5, 37.5, 62.5, 87.5,
    ]);
    expect([0, 1, 2, 3].map((index) => slotInlineStart(index, 4, true))).toEqual([
      87.5, 62.5, 37.5, 12.5,
    ]);
    expect(slotInlineStart(0, 1, false)).toBe(50);
  });

  test("puts each side's goalkeeper at its own end and its attack near the centre", () => {
    expect(lineBlockStart(0, 5, "away")).toBe(5);
    expect(lineBlockStart(4, 5, "away")).toBe(45);
    expect(lineBlockStart(0, 5, "home")).toBe(95);
    expect(lineBlockStart(4, 5, "home")).toBe(55);
  });
});
