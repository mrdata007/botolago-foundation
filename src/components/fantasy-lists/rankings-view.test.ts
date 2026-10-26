import { describe, expect, test } from "bun:test";

import type { LeagueStanding } from "@/types/fantasy";
import { gameweekPointsWaiting, rowsAround, showsAround, showsWaiting } from "./rankings-view";

const row = (n: number): LeagueStanding => ({
  managerId: `m${n}`,
  managerName: `M${n}`,
  teamName: `T${n}`,
  rank: n,
  previousRank: n,
  gameweekScore: 0,
  totalScore: 100 - n,
});
const rows = Array.from({ length: 25 }, (_, i) => row(i + 1));

describe("gameweek points waiting", () => {
  test("only while the gameweek is scoring on provisional points", () => {
    expect(gameweekPointsWaiting({ status: "provisional", pointsState: "provisional" })).toBe(true);
    expect(gameweekPointsWaiting({ status: "live", pointsState: "provisional" })).toBe(true);
    expect(gameweekPointsWaiting({ status: "finalizing", pointsState: "provisional" })).toBe(true);
    expect(gameweekPointsWaiting({ status: "finalized", pointsState: "final" })).toBe(false);
    expect(gameweekPointsWaiting({ status: "corrected", pointsState: "final" })).toBe(false);
    expect(gameweekPointsWaiting({ status: "open", pointsState: "provisional" })).toBe(false);
    expect(gameweekPointsWaiting(undefined)).toBe(false);
    expect(gameweekPointsWaiting(null)).toBe(false);
  });

  test("replaces a zero, never a real score", () => {
    expect(showsWaiting(true, 0)).toBe(true);
    expect(showsWaiting(true, 12)).toBe(false);
    expect(showsWaiting(false, 0)).toBe(false);
  });
});

describe("rows around the manager", () => {
  test("two either side, manager included", () => {
    expect(rowsAround(rows, "m10").map((r) => r.rank)).toEqual([8, 9, 10, 11, 12]);
  });
  test("fewer at the page edges, none invented", () => {
    expect(rowsAround(rows, "m1").map((r) => r.rank)).toEqual([1, 2, 3]);
    expect(rowsAround(rows, "m25").map((r) => r.rank)).toEqual([23, 24, 25]);
  });
  test("empty when the manager is not on the page", () => {
    expect(rowsAround(rows, "nobody")).toEqual([]);
  });
});

describe("when Autour de vous shows", () => {
  test("ranked, not searching, and not already in the table", () => {
    expect(showsAround({ myManagerId: "m40", searching: false, shownRows: rows })).toBe(true);
    expect(showsAround({ myManagerId: "m3", searching: false, shownRows: rows })).toBe(false);
    expect(showsAround({ myManagerId: "m40", searching: true, shownRows: rows })).toBe(false);
    expect(showsAround({ myManagerId: undefined, searching: false, shownRows: rows })).toBe(false);
  });
});
