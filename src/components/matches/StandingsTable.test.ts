import { describe, expect, test } from "bun:test";
import { sortStandings } from "./StandingsTable";
import type { TableRow } from "@/types/domain";

function row(overrides: Partial<TableRow>): TableRow {
  return {
    position: 1,
    clubId: "club-1",
    played: 10,
    won: 5,
    drawn: 3,
    lost: 2,
    goalDifference: 4,
    points: 18,
    form: ["W", "D", "L"],
    ...overrides,
  };
}

describe("sortStandings", () => {
  const rows: TableRow[] = [
    row({ position: 1, clubId: "a", points: 20, goalDifference: 10, won: 6 }),
    row({ position: 2, clubId: "b", points: 20, goalDifference: 12, won: 5 }),
    row({ position: 3, clubId: "c", points: 15, goalDifference: -2, won: 4 }),
  ];

  test("defaults to ascending rank order", () => {
    const sorted = sortStandings(rows, "position", "asc");
    expect(sorted.map((r) => r.clubId)).toEqual(["a", "b", "c"]);
  });

  test("sorts by points descending, using rank as a stable tiebreaker", () => {
    const sorted = sortStandings(rows, "points", "desc");
    // a and b are tied on points (20) — rank (already 1 before 2) breaks the tie.
    expect(sorted.map((r) => r.clubId)).toEqual(["a", "b", "c"]);
  });

  test("sorts by goal difference independently of points or rank", () => {
    const sorted = sortStandings(rows, "goalDifference", "desc");
    expect(sorted.map((r) => r.clubId)).toEqual(["b", "a", "c"]);
  });

  test("never mutates the input array", () => {
    const original = [...rows];
    sortStandings(rows, "won", "asc");
    expect(rows).toEqual(original);
  });

  test("ascending direction reverses descending order", () => {
    const desc = sortStandings(rows, "won", "desc").map((r) => r.clubId);
    const asc = sortStandings(rows, "won", "asc").map((r) => r.clubId);
    expect(asc).toEqual([...desc].reverse());
  });
});
