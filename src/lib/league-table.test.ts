import { describe, expect, test } from "bun:test";

import { BOTOLA_2025_26_FINAL_TABLE, BOTOLA_2025_26_RESULTS } from "./__fixtures__/botola-2025-26";
import {
  clubStanding,
  computeLeagueTable,
  leagueZone,
  roundsPlayed,
  type LeagueTableRow,
  type TableResult,
} from "./league-table";

const result = (
  homeClubId: string,
  awayClubId: string,
  homeScore: number,
  awayScore: number,
  kickoff = "2026-01-01T18:00:00Z",
): TableResult => ({ homeClubId, awayClubId, homeScore, awayScore, kickoff });

const season: TableResult[] = BOTOLA_2025_26_RESULTS.map(([home, away, hs, as, kickoff]) =>
  result(home, away, hs, as, kickoff),
);
const clubs = BOTOLA_2025_26_FINAL_TABLE.map(([club]) => club);

describe("computeLeagueTable — the real 2025/26 season", () => {
  const table = computeLeagueTable(clubs, season, "overall");

  test("its 240 results reproduce the stored final table, rank for rank and figure for figure", () => {
    expect(season).toHaveLength(240);
    expect(
      table.map((row) => [
        row.clubId,
        row.played,
        row.won,
        row.drawn,
        row.lost,
        row.goalsFor,
        row.goalsAgainst,
        row.points,
      ]),
    ).toEqual(BOTOLA_2025_26_FINAL_TABLE.map((row) => [...row]));
    expect(table.map((row) => row.position)).toEqual(clubs.map((_, index) => index + 1));
  });

  test("places level clubs by goal difference, not head-to-head", () => {
    // Level on 30 points; Dcheïra took 4 of the 6 head-to-head points, but
    // Yacoub El Mansour's goal difference is one better — and the stored
    // table has Yacoub El Mansour 14th.
    const yem = table.find((row) => row.clubId === "yacoub-el-mansour")!;
    const od = table.find((row) => row.clubId === "olympique-dche-ra")!;
    expect([yem.points, od.points]).toEqual([30, 30]);
    expect([yem.goalDifference, od.goalDifference]).toEqual([-10, -11]);
    expect([yem.position, od.position]).toEqual([14, 15]);
  });

  test("keeps the last five results, oldest first", () => {
    const form = (club: string) => table.find((row) => row.clubId === club)!.form.join("");
    expect(form("maghreb-f-s")).toBe("LWWDW");
    expect(form("wydad-casablanca")).toBe("LLLLL");
    expect(form("olympic-safi")).toBe("LDDDL");
  });

  test("home and away tables split the same results, and add back up to the overall one", () => {
    const home = computeLeagueTable(clubs, season, "home");
    const away = computeLeagueTable(clubs, season, "away");
    for (const row of table) {
      const h = home.find((candidate) => candidate.clubId === row.clubId)!;
      const a = away.find((candidate) => candidate.clubId === row.clubId)!;
      expect(h.played + a.played).toBe(row.played);
      expect(h.points + a.points).toBe(row.points);
      expect(h.goalsFor + a.goalsFor).toBe(row.goalsFor);
      expect(h.played).toBe(15);
    }
    // FAR Rabat went unbeaten at home: 9 wins, 6 draws.
    const far = home.find((row) => row.clubId === "far-rabat")!;
    expect([far.won, far.drawn, far.lost, far.points]).toEqual([9, 6, 0, 33]);
    expect(far.position).toBe(1);
  });

  test("counts the rounds a table reflects", () => {
    expect(roundsPlayed(table)).toBe(30);
    expect(roundsPlayed([])).toBe(0);
  });
});

describe("computeLeagueTable — rules", () => {
  test("three points a win, one a draw; goal difference, then goals scored, break a tie", () => {
    const table = computeLeagueTable(
      ["a", "b", "c", "d"],
      [result("a", "b", 3, 0), result("c", "d", 1, 0), result("d", "b", 2, 2)],
      "overall",
    );
    expect(table.map((row) => [row.clubId, row.points, row.goalDifference])).toEqual([
      ["a", 3, 3],
      ["c", 3, 1],
      ["d", 1, -1],
      ["b", 1, -3],
    ]);
  });

  test("lists a club that has not played yet, on zero", () => {
    const table = computeLeagueTable(["a", "b", "idle"], [result("a", "b", 0, 1)], "overall");
    const idle = table.find((row) => row.clubId === "idle")!;
    expect([idle.played, idle.points, idle.goalDifference, idle.form]).toEqual([0, 0, 0, []]);
    expect(idle.position).toBe(2); // above the loser: level on points, better difference
  });

  test("orders clubs level on every figure by name", () => {
    const names: Record<string, string> = { x: "Wydad", y: "Raja" };
    const table = computeLeagueTable(
      ["x", "y", "p", "q"],
      [result("x", "p", 1, 0), result("y", "q", 1, 0)],
      "overall",
      (id) => names[id] ?? id,
    );
    expect(table.slice(0, 2).map((row) => row.clubId)).toEqual(["y", "x"]);
  });

  test("orders the form guide by kickoff, whatever order the results arrive in", () => {
    const table = computeLeagueTable(
      ["a", "b"],
      [
        result("a", "b", 0, 1, "2026-03-01T18:00:00Z"),
        result("a", "b", 2, 0, "2026-01-01T18:00:00Z"),
        result("b", "a", 1, 1, "2026-02-01T18:00:00Z"),
      ],
      "overall",
    );
    expect(table.find((row) => row.clubId === "a")!.form).toEqual(["W", "D", "L"]);
  });

  test("never mutates the results it is given", () => {
    const results = [result("a", "b", 0, 1, "2026-03-01T18:00:00Z"), result("a", "b", 1, 0)];
    const before = results.map((item) => item.kickoff);
    computeLeagueTable(["a", "b"], results, "overall");
    expect(results.map((item) => item.kickoff)).toEqual(before);
  });
});

describe("leagueZone", () => {
  test("marks the African places and the drop in a 16-club table", () => {
    const zones = Array.from({ length: 16 }, (_, index) => leagueZone(index + 1, 16));
    expect(zones.slice(0, 3)).toEqual([
      "champions_league",
      "champions_league",
      "confederation_cup",
    ]);
    expect(zones.slice(3, 14).every((zone) => zone === null)).toBe(true);
    expect(zones.slice(14)).toEqual(["relegation", "relegation"]);
  });

  test("never marks a club in the African places as relegated in a short table", () => {
    expect([1, 2, 3, 4].map((position) => leagueZone(position, 4))).toEqual([
      "champions_league",
      "champions_league",
      "confederation_cup",
      "relegation",
    ]);
    expect([1, 2, 3].map((position) => leagueZone(position, 3))).toEqual([
      "champions_league",
      "champions_league",
      "confederation_cup",
    ]);
  });
});

describe("clubStanding", () => {
  const row = (clubId: string, position: number, points: number): LeagueTableRow => ({
    position,
    clubId,
    played: 10,
    won: 0,
    drawn: 0,
    lost: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    goalDifference: 0,
    points,
    form: [],
  });
  const rows = [row("a", 1, 59), row("b", 2, 57), row("c", 3, 56), row("d", 4, 56)];

  test("gives the leader's lead over the 2nd", () => {
    expect(clubStanding(rows, "a")).toEqual({
      row: rows[0],
      zone: "champions_league",
      gap: { kind: "lead", points: 2, over: 2 },
    });
  });

  test("gives anyone else the points to the place above", () => {
    expect(clubStanding(rows, "c")?.gap).toEqual({ kind: "behind", points: 1, to: 2 });
    expect(clubStanding(rows, "c")?.zone).toBe("confederation_cup");
  });

  test("says level when the place above has the same points", () => {
    expect(clubStanding(rows, "d")?.gap).toEqual({ kind: "level", with: 3 });
    expect(clubStanding([row("a", 1, 3), row("b", 2, 3)], "a")?.gap).toEqual({
      kind: "level",
      with: 2,
    });
  });

  test("has no gap for a club alone, and nothing for a club not in the table", () => {
    expect(clubStanding([row("a", 1, 0)], "a")?.gap).toBeNull();
    expect(clubStanding(rows, "zz")).toBeNull();
  });
});
