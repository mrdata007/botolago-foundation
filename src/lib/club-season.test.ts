import { describe, expect, test } from "bun:test";
import type { LeagueTableRow } from "@/lib/league-table";
import type { Match, TableRow } from "@/types/domain";
import {
  clubFixtures,
  clubResults,
  clubScore,
  clubSeasonAbsent,
  clubSeasonStats,
  EMPTY_RECORD,
  matchOutcome,
  nextClubMatch,
  officialRecord,
  lastSeasonPlayed,
  perMatch,
  seasonsWithResults,
  squadByPosition,
  standingsAround,
  type SquadPlayer,
} from "./club-season";

const CLUB = "club";

let sequence = 0;
function match(overrides: Partial<Match> & { day: number }): Match {
  sequence += 1;
  const { day, ...rest } = overrides;
  return {
    id: `m${String(sequence).padStart(3, "0")}`,
    gameweek: day,
    homeClubId: CLUB,
    awayClubId: "other",
    kickoff: new Date(Date.UTC(2025, 8, day, 18)).toISOString(),
    status: "finished",
    venue: { fr: "", ar: "" },
    ...rest,
  };
}

/** A finished match from the club's side: `for`–`against`, at home unless `away`. */
function result(day: number, scored: number, conceded: number, away = false): Match {
  return away
    ? match({ day, homeClubId: "other", awayClubId: CLUB, homeScore: conceded, awayScore: scored })
    : match({ day, homeScore: scored, awayScore: conceded });
}

describe("clubScore / matchOutcome", () => {
  test("reads the club's side, home or away", () => {
    expect(clubScore(result(1, 3, 1), CLUB)).toEqual({ scored: 3, conceded: 1, home: true });
    expect(clubScore(result(2, 0, 2, true), CLUB)).toEqual({ scored: 0, conceded: 2, home: false });
    expect(matchOutcome(result(3, 2, 2, true), CLUB)).toBe("D");
    expect(matchOutcome(result(4, 1, 0, true), CLUB)).toBe("W");
  });

  test("counts nothing without a final score or for a club that did not play", () => {
    expect(clubScore(match({ day: 1, status: "scheduled" }), CLUB)).toBeNull();
    expect(clubScore(match({ day: 1, status: "finished" }), CLUB)).toBeNull();
    expect(
      clubScore(match({ day: 1, status: "live", homeScore: 1, awayScore: 0 }), CLUB),
    ).toBeNull();
    expect(clubScore(result(1, 1, 0), "somebody-else")).toBeNull();
    expect(matchOutcome(match({ day: 1, status: "postponed" }), CLUB)).toBeNull();
  });
});

describe("clubSeasonStats", () => {
  const season = [
    result(1, 2, 0), // W home, clean sheet
    result(2, 0, 1, true), // L away, failed to score
    result(3, 1, 1), // D home
    result(4, 4, 1, true), // W away, margin 3
    result(5, 3, 0), // W home, margin 3 with fewer goals, clean sheet
    result(6, 0, 3, true), // L away, margin 3
    result(7, 1, 4), // L home, margin 3 with more conceded
    match({ day: 8, status: "scheduled" }),
    match({ day: 9, status: "postponed" }),
  ];
  const stats = clubSeasonStats(season, CLUB);

  test("totals every finished match and nothing else", () => {
    expect(stats.overall).toEqual({
      played: 7,
      won: 3,
      drawn: 1,
      lost: 3,
      goalsFor: 11,
      goalsAgainst: 10,
    });
  });

  test("splits home and away", () => {
    expect(stats.home).toEqual({
      played: 4,
      won: 2,
      drawn: 1,
      lost: 1,
      goalsFor: 7,
      goalsAgainst: 5,
    });
    expect(stats.away).toEqual({
      played: 3,
      won: 1,
      drawn: 0,
      lost: 2,
      goalsFor: 4,
      goalsAgainst: 5,
    });
  });

  test("counts clean sheets and blanks", () => {
    expect(stats.cleanSheets).toBe(2);
    expect(stats.failedToScore).toBe(2);
  });

  test("the biggest win is the widest margin, then the most goals scored", () => {
    expect(stats.biggestWin).toBe(season[3]!);
  });

  test("the heaviest defeat is the widest margin, then the most goals conceded", () => {
    expect(stats.heaviestDefeat).toBe(season[6]!);
  });

  test("the form is the last five results, oldest first", () => {
    expect(stats.form).toEqual(["D", "W", "W", "L", "L"]);
  });

  test("reads the same whatever order the matches arrive in", () => {
    expect(clubSeasonStats([...season].reverse(), CLUB)).toEqual(stats);
  });

  test("a season with nothing played is all zeros, with no best or worst", () => {
    const empty = clubSeasonStats([match({ day: 1, status: "scheduled" })], CLUB);
    expect(empty.overall).toEqual(EMPTY_RECORD);
    expect(empty.biggestWin).toBeNull();
    expect(empty.heaviestDefeat).toBeNull();
    expect(empty.form).toEqual([]);
  });

  test("a later match of equal size takes the record", () => {
    const early = result(1, 2, 0);
    const late = result(2, 2, 0);
    expect(clubSeasonStats([late, early], CLUB).biggestWin).toBe(late);
  });
});

describe("officialRecord", () => {
  const fixtures = { played: 3, won: 1, drawn: 1, lost: 1, goalsFor: 4, goalsAgainst: 4 };

  test("prefers the table, which carries what the fixtures cannot", () => {
    const row: LeagueTableRow = {
      position: 5,
      clubId: CLUB,
      played: 30,
      won: 11,
      drawn: 10,
      lost: 9,
      goalDifference: 6,
      goalsFor: 39,
      goalsAgainst: 33,
      points: 43,
      form: [],
    };
    expect(officialRecord(row, fixtures)).toEqual({
      played: 30,
      won: 11,
      drawn: 10,
      lost: 9,
      goalsFor: 39,
      goalsAgainst: 33,
    });
  });

  test("falls back to the fixtures without a table row", () => {
    expect(officialRecord(undefined, fixtures)).toEqual(fixtures);
  });
});

describe("perMatch", () => {
  test("divides, and says nothing rather than divide by zero", () => {
    expect(perMatch(39, 30)).toBeCloseTo(1.3);
    expect(perMatch(0, 0)).toBeNull();
  });
});

describe("next match, results and fixtures", () => {
  const played = result(1, 1, 0);
  const soon = match({ day: 10, status: "scheduled" });
  const later = match({ day: 17, status: "scheduled" });
  const postponed = match({ day: 5, status: "postponed" });

  test("the next match is the earliest scheduled one, never a postponed one", () => {
    expect(nextClubMatch([later, postponed, played, soon])).toBe(soon);
    expect(nextClubMatch([played, postponed])).toBeUndefined();
  });

  test("a match being played is the next match", () => {
    const live = match({ day: 9, status: "live", homeScore: 0, awayScore: 0 });
    expect(nextClubMatch([soon, live])).toBe(live);
  });

  test("results are most recent first; fixtures soonest first and keep postponed ones", () => {
    const second = result(3, 0, 0);
    expect(clubResults([played, soon, second], CLUB)).toEqual([second, played]);
    expect(clubFixtures([later, played, postponed, soon])).toEqual([postponed, soon, later]);
  });

  test("a cancelled or abandoned fixture is not listed as still to come", () => {
    const calledOff = match({ day: 4, status: "postponed", calledOff: true });
    expect(clubFixtures([later, calledOff, postponed, soon])).toEqual([postponed, soon, later]);
  });
});

describe("standingsAround", () => {
  const table: TableRow[] = Array.from({ length: 16 }, (_, index) => ({
    position: index + 1,
    clubId: `c${index + 1}`,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    goalDifference: 0,
    points: 0,
    form: [],
  }));

  const ids = (rows: TableRow[]) => rows.map((row) => row.position);

  test("centres the club", () => {
    expect(ids(standingsAround(table, "c8"))).toEqual([6, 7, 8, 9, 10]);
  });

  test("stays inside the table at the top and the bottom", () => {
    expect(ids(standingsAround(table, "c1"))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(standingsAround(table, "c2"))).toEqual([1, 2, 3, 4, 5]);
    expect(ids(standingsAround(table, "c16"))).toEqual([12, 13, 14, 15, 16]);
  });

  test("works on an unsorted table and returns nothing for a club not in it", () => {
    expect(ids(standingsAround([...table].reverse(), "c3"))).toEqual([1, 2, 3, 4, 5]);
    expect(standingsAround(table, "nobody")).toEqual([]);
  });

  test("a table shorter than the window is returned whole", () => {
    expect(ids(standingsAround(table.slice(0, 3), "c2"))).toEqual([1, 2, 3]);
  });
});

describe("lastSeasonPlayed", () => {
  const seasons = [
    { id: "2026", startsOn: "2026-08-01" },
    { id: "2024", startsOn: "2024-08-01" },
    { id: "2025", startsOn: "2025-08-01" },
    { id: "2023", startsOn: "2023-08-01" },
  ];

  test("is the latest earlier season the club has a result in", () => {
    expect(lastSeasonPlayed(seasons, "2026", ["2025", "2024"])?.id).toBe("2025");
    expect(lastSeasonPlayed(seasons, "2025", ["2025", "2024"])?.id).toBe("2024");
  });

  test("skips the seasons the club was not in, as a promoted club's last one", () => {
    expect(lastSeasonPlayed(seasons, "2026", ["2024", "2023"])?.id).toBe("2024");
    expect(lastSeasonPlayed(seasons, "2025", ["2023"])?.id).toBe("2023");
  });

  test("is nothing when no earlier season has a result, or the season is unknown", () => {
    expect(lastSeasonPlayed(seasons, "2026", ["2026"])).toBeUndefined();
    expect(lastSeasonPlayed(seasons, "2026", [])).toBeUndefined();
    expect(lastSeasonPlayed(seasons, "2023", ["2023", "2024"])).toBeUndefined();
    expect(lastSeasonPlayed(seasons, "1999", ["2025"])).toBeUndefined();
    expect(lastSeasonPlayed(seasons, undefined, ["2025"])).toBeUndefined();
  });
});

describe("clubSeasonAbsent", () => {
  const fixture = match({ day: 1, status: "scheduled" });
  const over = { status: "completed", firstMatchDate: "2025-09-05" };
  const underway = { status: "active", firstMatchDate: "2026-09-24" };
  const unpublished = { status: "planned", firstMatchDate: null };

  test("a finished season with no fixture for the club is one it was not in", () => {
    expect(clubSeasonAbsent(over, [])).toBe(true);
    expect(clubSeasonAbsent({ status: "cancelled", firstMatchDate: null }, [])).toBe(true);
  });

  test("a season whose fixtures are out, none of them the club's: a relegated club", () => {
    expect(clubSeasonAbsent(underway, [])).toBe(true);
    expect(clubSeasonAbsent({ status: "planned", firstMatchDate: "2026-09-24" }, [])).toBe(true);
  });

  test("a season with no calendar yet is 'not yet', not 'not there'", () => {
    expect(clubSeasonAbsent(unpublished, [])).toBe(false);
    expect(clubSeasonAbsent({ status: "active", firstMatchDate: null }, [])).toBe(false);
  });

  test("a club with fixtures in the season was in it, played or not", () => {
    expect(clubSeasonAbsent(over, [fixture])).toBe(false);
    expect(clubSeasonAbsent(underway, [fixture])).toBe(false);
  });

  test("nothing is concluded before the season or its matches are known", () => {
    expect(clubSeasonAbsent(undefined, [])).toBe(false);
    expect(clubSeasonAbsent(over, undefined)).toBe(false);
  });
});

describe("seasonsWithResults", () => {
  test("lists each season in which the club has a final score, once", () => {
    const fixtures = [
      { seasonId: "2025", match: match({ day: 1, homeScore: 1, awayScore: 0 }) },
      { seasonId: "2025", match: match({ day: 2, homeScore: 0, awayScore: 0 }) },
      { seasonId: "2024", match: match({ day: 3, homeScore: 2, awayScore: 2 }) },
      // Not played yet, and a match the club was not in: neither counts.
      { seasonId: "2026", match: match({ day: 4, status: "scheduled" }) },
      {
        seasonId: "2023",
        match: match({ day: 5, homeClubId: "x", awayClubId: "y", homeScore: 1, awayScore: 1 }),
      },
    ];
    expect(seasonsWithResults(fixtures, CLUB).sort()).toEqual(["2024", "2025"]);
  });
});

describe("squadByPosition", () => {
  const player = (overrides: Partial<SquadPlayer> & Pick<SquadPlayer, "id">): SquadPlayer => ({
    name: overrides.id,
    position: "midfielder",
    shirtNumber: null,
    role: "player",
    ...overrides,
  });

  test("reads like a team sheet, numbered players first, empty lines left out", () => {
    const groups = squadByPosition([
      player({ id: "Zakaria", position: "forward", shirtNumber: 9 }),
      player({ id: "Amine", position: "midfielder" }),
      player({ id: "Bilal", position: "midfielder", shirtNumber: 8 }),
      player({ id: "Chadi", position: "midfielder", shirtNumber: 6 }),
      player({ id: "Anas", position: "goalkeeper", shirtNumber: 1 }),
      player({ id: "Aymane", position: "midfielder" }),
    ]);
    expect(groups.map((group) => group.position)).toEqual(["goalkeeper", "midfielder", "forward"]);
    expect(groups[1]!.players.map((p) => p.id)).toEqual(["Chadi", "Bilal", "Amine", "Aymane"]);
  });
});
