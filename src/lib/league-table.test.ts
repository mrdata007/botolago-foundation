import { describe, expect, test } from "bun:test";

import { BOTOLA_2025_26_FINAL_TABLE, BOTOLA_2025_26_RESULTS } from "./__fixtures__/botola-2025-26";
import {
  clubStanding,
  computeLeagueTable,
  leagueZone,
  roundsPlayed,
  sharedPositions,
  tableZones,
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

  test("lists clubs level on every figure by their canonical key, sharing one rank", () => {
    const slugs: Record<string, string> = { x: "wydad-casablanca", y: "raja-casablanca" };
    const table = computeLeagueTable(
      ["x", "y", "p", "q"],
      [result("x", "p", 1, 0), result("y", "q", 1, 0)],
      "overall",
      (id) => slugs[id] ?? id,
    );
    expect(table.map((row) => [row.clubId, row.position])).toEqual([
      ["y", 1],
      ["x", 1],
      ["p", 3],
      ["q", 3],
    ]);
  });

  test("ranks 1, 2, 2, 4: a tie shares its position and the next club takes its place", () => {
    const table = computeLeagueTable(
      ["a", "b", "c", "d"],
      // a wins; b and c draw 1–1 with each other, so nothing separates them.
      [result("a", "d", 2, 0), result("b", "c", 1, 1)],
      "overall",
    );
    expect(table.map((row) => [row.clubId, row.position])).toEqual([
      ["a", 1],
      ["b", 2],
      ["c", 2],
      ["d", 4],
    ]);
    expect([...sharedPositions(table)]).toEqual([2]);
  });

  test("orders a tie by code unit, so every runtime lists it the same way", () => {
    // `localeCompare` would put "é" beside "e"; the order must not depend on
    // the locale data of the server or the reader's browser.
    const table = computeLeagueTable(["x", "y", "z"], [], "overall", (id) =>
      id === "x" ? "é-club" : id === "y" ? "f-club" : "e-club",
    );
    expect(table.map((row) => row.clubId)).toEqual(["z", "y", "x"]);
    expect(table.every((row) => row.position === 1)).toBe(true);
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

describe("tableZones", () => {
  const ids = Array.from(
    { length: 16 },
    (_, index) => `club-${String(index + 1).padStart(2, "0")}`,
  );

  test("marks a table with one club a position exactly as leagueZone does", () => {
    const rows = ids.map((clubId, index) => ({ clubId, position: index + 1 }));
    const zones = tableZones(rows);
    expect(rows.map((row) => zones.get(row.clubId))).toEqual(
      rows.map((row) => leagueZone(row.position, 16)),
    );
  });

  test("after the season's first match, marks no club the alphabet put in a zone", () => {
    // Production on 2026-09-25: Ittihad Tanger won 3–1 at Amal Tiznit, and
    // the other fourteen clubs had not played. They share 2nd, spanning 2nd
    // (African place) to 15th (the drop).
    const winner = "ittihad-tanger";
    const loser = "amal-tiznit";
    const idle = ids.slice(0, 14);
    const table = computeLeagueTable(
      [winner, loser, ...idle],
      [result(loser, winner, 1, 3)],
      "overall",
    );
    expect(table.map((row) => row.position)).toEqual([1, ...idle.map(() => 2), 16]);
    const zones = tableZones(table);
    expect(zones.get(winner)).toBe("champions_league");
    expect(zones.get(loser)).toBe("relegation");
    for (const clubId of idle) expect(zones.get(clubId)).toBeNull();
  });

  test("keeps the zone of a tie that lies wholly inside it", () => {
    // Two clubs share 1st: both places go to the Champions League.
    const rows = [
      { clubId: "a", position: 1 },
      { clubId: "b", position: 1 },
      { clubId: "c", position: 3 },
      { clubId: "d", position: 4 },
    ];
    const zones = tableZones(rows);
    expect([zones.get("a"), zones.get("b"), zones.get("c"), zones.get("d")]).toEqual([
      "champions_league",
      "champions_league",
      "confederation_cup",
      "relegation",
    ]);
    // Sharing 2nd would span the Champions League place and the Confederation one.
    const straddling = tableZones([
      { clubId: "a", position: 1 },
      { clubId: "b", position: 2 },
      { clubId: "c", position: 2 },
      { clubId: "d", position: 4 },
    ]);
    expect([straddling.get("b"), straddling.get("c")]).toEqual([null, null]);
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
      shared: false,
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

  describe("with shared ranks", () => {
    // 3 points for the leader; three clubs level on everything share 2nd.
    const tied = [row("a", 1, 3), row("b", 2, 0), row("c", 2, 0), row("d", 2, 0)];

    test("measures a club sharing a rank against the nearest other position", () => {
      // Not "level with the 2nd place" for the club listed third of three 2nds.
      for (const club of ["b", "c", "d"]) {
        expect(clubStanding(tied, club)?.gap).toEqual({ kind: "behind", points: 3, to: 1 });
        expect(clubStanding(tied, club)?.shared).toBe(true);
      }
      expect(clubStanding(tied, "a")?.gap).toEqual({ kind: "lead", points: 3, over: 2 });
      expect(clubStanding(tied, "a")?.shared).toBe(false);
    });

    test("names a zone only when the whole tie is in it", () => {
      // Sharing 2nd of four spans 2nd to 4th: African places and the drop.
      expect(clubStanding(tied, "c")?.zone).toBeNull();
      const coLeaders = [row("a", 1, 3), row("b", 1, 3), row("c", 3, 0), row("d", 4, 0)];
      expect(clubStanding(coLeaders, "b")?.zone).toBe("champions_league");
      // A co-leader is ahead of the next other position, not level with its partner.
      expect(clubStanding(coLeaders, "b")?.gap).toEqual({ kind: "lead", points: 3, over: 3 });
    });

    test("has no gap when every club shares the one position", () => {
      const all = [row("a", 1, 1), row("b", 1, 1)];
      expect(clubStanding(all, "b")).toEqual({
        row: all[1],
        zone: "champions_league",
        shared: true,
        gap: null,
      });
    });
  });
});
