import { describe, expect, test } from "bun:test";
import { FootballError } from "../errors";
import {
  collapseReplacedEvents,
  mapSofascoreStatus,
  parseSofascoreEventList,
  parseSofascoreStandings,
  sofascoreLastMatchesPath,
  sofascoreNextMatchesPath,
  sofascoreStandingsPath,
} from "./sofascore-schedule";

// Synthetic payloads: the shapes were probed, the values are invented.
const team = (id: number, name: string) => ({
  id,
  name,
  shortName: name.slice(0, 3),
  nameCode: name.slice(0, 3).toUpperCase(),
  slug: name.toLowerCase(),
  teamColors: { primary: "#000000" },
});

interface EventOptions {
  id: number;
  home: number;
  away: number;
  ts: number;
  type: string;
  code: number;
  round?: number;
  tournament?: number;
  score?: [number, number];
  half?: [number, number];
}

function event(o: EventOptions) {
  return {
    id: o.id,
    slug: "a-b",
    customId: "xyz",
    startTimestamp: o.ts,
    status: { code: o.code, description: "x", type: o.type },
    roundInfo: { round: o.round ?? 1 },
    tournament: { id: 1, uniqueTournament: { id: o.tournament ?? 937, name: "League" } },
    season: { id: 102220, name: "League 26/27", year: "26/27" },
    homeTeam: team(o.home, "Home"),
    awayTeam: team(o.away, "Away"),
    ...(o.score
      ? {
          homeScore: { current: o.score[0], display: o.score[0], period1: o.half?.[0] },
          awayScore: { current: o.score[1], display: o.score[1], period1: o.half?.[1] },
        }
      : {}),
    changes: { changeTimestamp: 1790600000 },
  };
}

const postponedOld = event({
  id: 16958240,
  home: 47696,
  away: 55039,
  ts: 1790269200,
  type: "postponed",
  code: 60,
});
const finishedNew = event({
  id: 17132480,
  home: 47696,
  away: 55039,
  ts: 1790539200,
  type: "finished",
  code: 100,
  score: [2, 3],
  half: [1, 1],
});
const postponedA = event({
  id: 16958242,
  home: 24394,
  away: 41757,
  ts: 1790269200,
  type: "postponed",
  code: 60,
});
const postponedB = event({
  id: 17217059,
  home: 24394,
  away: 41757,
  ts: 1791997200,
  type: "postponed",
  code: 60,
});

describe("endpoint paths", () => {
  test("build the three paths", () => {
    expect(sofascoreLastMatchesPath(937, 102220, 2)).toBe(
      "tournaments/get-last-matches?tournamentId=937&seasonId=102220&pageIndex=2",
    );
    expect(sofascoreNextMatchesPath(937, 102220)).toBe(
      "tournaments/get-next-matches?tournamentId=937&seasonId=102220&pageIndex=0",
    );
    expect(sofascoreStandingsPath(937, 102220)).toBe(
      "tournaments/get-standings?tournamentId=937&seasonId=102220&type=total",
    );
  });

  test("reject bad ids", () => {
    expect(() => sofascoreLastMatchesPath(0, 1)).toThrow(FootballError);
    expect(() => sofascoreNextMatchesPath(1, 1.5)).toThrow(FootballError);
    expect(() => sofascoreLastMatchesPath(1, 1, -1)).toThrow(FootballError);
  });
});

describe("mapSofascoreStatus", () => {
  test.each([
    ["notstarted", 0, "not_started", "pre_match", false],
    ["finished", 100, "finished", "post_match", false],
    ["postponed", 60, "postponed", "pre_match", false],
    ["canceled", 70, "cancelled", "pre_match", false],
    ["inprogress", 6, "live_first_half", "first_half", false],
    ["inprogress", 7, "live_second_half", "second_half", false],
    ["inprogress", 31, "half_time", "half_time", false],
    ["inprogress", 41, "extra_time", "extra_time", false],
    ["inprogress", 50, "penalties", "penalties", false],
    ["inprogress", 999, "scheduled", "pre_match", true],
    ["somethingnew", 1, "scheduled", "pre_match", true],
  ] as const)("%s/%d", (type, code, status, period, unknown) => {
    expect(mapSofascoreStatus(type, code)).toEqual({ status, period, unknown });
  });
});

describe("parseSofascoreEventList", () => {
  test("maps a finished and a not-played event", () => {
    const notPlayed = event({
      id: 1,
      home: 1,
      away: 2,
      ts: 1790000000,
      type: "notstarted",
      code: 0,
    });
    const page = parseSofascoreEventList(
      { events: [finishedNew, notPlayed], hasNextPage: true },
      { uniqueTournamentId: 937 },
    );
    expect(page.hasNextPage).toBe(true);
    expect(page.foreignTournamentCount).toBe(0);
    expect(page.malformedCount).toBe(0);
    expect(page.events[0]).toEqual({
      sofascoreEventId: "17132480",
      startsAt: new Date(1790539200 * 1000).toISOString(),
      round: 1,
      status: "finished",
      period: "post_match",
      rawStatusType: "finished",
      rawStatusCode: 100,
      home: { id: "47696", name: "Home" },
      away: { id: "55039", name: "Away" },
      homeScore: 2,
      awayScore: 3,
      halfTimeHome: 1,
      halfTimeAway: 1,
      changeTimestamp: 1790600000,
      uniqueTournamentId: "937",
      seasonId: "102220",
    });
    expect(page.events[1]).toMatchObject({
      status: "not_started",
      homeScore: null,
      awayScore: null,
      halfTimeHome: null,
      halfTimeAway: null,
    });
  });

  test("startsAt is ISO UTC from seconds", () => {
    const page = parseSofascoreEventList({ events: [finishedNew], hasNextPage: false });
    expect(page.events[0]?.startsAt.endsWith("Z")).toBe(true);
  });

  test("drops and counts events of another tournament", () => {
    const other = event({
      id: 2,
      home: 1,
      away: 2,
      ts: 1,
      type: "finished",
      code: 100,
      tournament: 5,
    });
    const page = parseSofascoreEventList(
      { events: [other, finishedNew], hasNextPage: false },
      { uniqueTournamentId: 937 },
    );
    expect(page.events.map((e) => e.sofascoreEventId)).toEqual(["17132480"]);
    expect(page.foreignTournamentCount).toBe(1);
  });

  test("an unknown status is left out and reported, never guessed", () => {
    const odd = event({ id: 3, home: 1, away: 2, ts: 1790000000, type: "weird", code: 77 });
    const liveOddCode = event({
      id: 6,
      home: 1,
      away: 2,
      ts: 1790000000,
      type: "inprogress",
      code: 999,
    });
    const page = parseSofascoreEventList({
      events: [odd, liveOddCode, finishedNew],
      hasNextPage: false,
    });
    expect(page.events.map((e) => e.sofascoreEventId)).toEqual(["17132480"]);
    expect(page.unknownStatus).toEqual([
      { sofascoreEventId: "3", rawStatusType: "weird", rawStatusCode: 77 },
      { sofascoreEventId: "6", rawStatusType: "inprogress", rawStatusCode: 999 },
    ]);
  });

  test("one malformed event is dropped and counted", () => {
    const broken = { id: "nope", homeTeam: {} };
    const noTournament = {
      ...event({ id: 4, home: 1, away: 2, ts: 1, type: "finished", code: 100 }),
      tournament: {},
    };
    const page = parseSofascoreEventList({
      events: [broken, null, noTournament, finishedNew],
      hasNextPage: false,
    });
    expect(page.events).toHaveLength(1);
    expect(page.malformedCount).toBe(3);
  });

  test("missing half-time side gives null half-time", () => {
    const partial = event({
      id: 5,
      home: 1,
      away: 2,
      ts: 1,
      type: "finished",
      code: 100,
      score: [1, 0],
    });
    const page = parseSofascoreEventList({ events: [partial], hasNextPage: false });
    expect(page.events[0]).toMatchObject({ homeScore: 1, halfTimeHome: null, halfTimeAway: null });
  });

  test.each([
    ["null", null],
    ["no events", { hasNextPage: false }],
    ["events not an array", { events: {}, hasNextPage: false }],
    ["no hasNextPage", { events: [] }],
    ["hasNextPage not boolean", { events: [], hasNextPage: "yes" }],
  ])("rejects a wrong top-level shape: %s", (_name, payload) => {
    expect(() => parseSofascoreEventList(payload)).toThrow(FootballError);
  });

  test("the error names paths, not values", () => {
    try {
      parseSofascoreEventList({ events: "secret-value", hasNextPage: false });
      throw new Error("should have thrown");
    } catch (error) {
      expect((error as Error).message).toContain("events");
      expect((error as Error).message).not.toContain("secret-value");
    }
  });
});

describe("collapseReplacedEvents", () => {
  const parse = (...events: unknown[]) =>
    parseSofascoreEventList({ events, hasNextPage: false }).events;

  test("a finished replay supersedes the postponed original", () => {
    const result = collapseReplacedEvents(parse(postponedOld, finishedNew));
    expect(result.supersededIds).toEqual(["16958240"]);
    expect(result.events.map((e) => e.sofascoreEventId)).toEqual(["17132480"]);
  });

  test("a later postponed event supersedes an earlier postponed one", () => {
    const result = collapseReplacedEvents(parse(postponedA, postponedB));
    expect(result.supersededIds).toEqual(["16958242"]);
    expect(result.events.map((e) => e.sofascoreEventId)).toEqual(["17217059"]);
  });

  test("input order does not change the outcome", () => {
    const result = collapseReplacedEvents(parse(postponedB, postponedA, finishedNew, postponedOld));
    expect([...result.supersededIds].sort()).toEqual(["16958240", "16958242"]);
    expect(result.events.map((e) => e.sofascoreEventId)).toEqual(["17217059", "17132480"]);
  });

  test("different round, swapped sides and lone events are untouched", () => {
    const otherRound = event({
      id: 9,
      home: 47696,
      away: 55039,
      ts: 1790539200,
      type: "finished",
      code: 100,
      round: 2,
    });
    const swapped = event({
      id: 10,
      home: 55039,
      away: 47696,
      ts: 1790539200,
      type: "finished",
      code: 100,
    });
    const result = collapseReplacedEvents(parse(postponedOld, otherRound, swapped));
    expect(result.supersededIds).toEqual([]);
    expect(result.events).toHaveLength(3);
  });

  test("events with no round are never collapsed", () => {
    const noRound = (id: number) => ({
      ...event({ id, home: 1, away: 2, ts: 1790000000, type: "postponed", code: 60 }),
      roundInfo: undefined,
    });
    const result = collapseReplacedEvents(parse(noRound(1), noRound(2)));
    expect(result.supersededIds).toEqual([]);
  });
});

describe("parseSofascoreStandings", () => {
  const row = (position: number, id: number, extra: object = {}) => ({
    id: position * 10,
    team: team(id, `Team${id}`),
    position,
    matches: 5,
    wins: 3,
    draws: 1,
    losses: 1,
    scoresFor: 7,
    scoresAgainst: 4,
    points: 10,
    scoreDiffFormatted: "+3",
    ...extra,
  });
  const payload = {
    standings: [
      {
        id: 1,
        type: "total",
        name: "League",
        tournament: { id: 2, uniqueTournament: { id: 937, name: "League" } },
        rows: [row(1, 100, { promotion: { id: 1, text: "Champions" } }), row(2, 101)],
        updatedAtTimestamp: 1790600000,
      },
    ],
  };

  test("maps rows", () => {
    const [table] = parseSofascoreStandings(payload);
    expect(table).toMatchObject({
      name: "League",
      type: "total",
      uniqueTournamentId: "937",
      updatedAt: new Date(1790600000 * 1000).toISOString(),
    });
    expect(table?.rows[0]).toEqual({
      teamId: "100",
      teamName: "Team100",
      position: 1,
      played: 5,
      won: 3,
      drawn: 1,
      lost: 1,
      goalsFor: 7,
      goalsAgainst: 4,
      points: 10,
      goalDifferenceText: "+3",
      promotionText: "Champions",
    });
    expect(table?.rows[1]?.promotionText).toBeNull();
  });

  test("optional fields may be absent", () => {
    const [table] = parseSofascoreStandings({
      standings: [{ rows: [{ ...row(1, 1), scoreDiffFormatted: undefined }] }],
    });
    expect(table).toMatchObject({
      name: null,
      type: null,
      uniqueTournamentId: null,
      updatedAt: null,
    });
    expect(table?.rows[0]?.goalDifferenceText).toBeNull();
  });

  test.each([
    ["null", null],
    ["no standings", {}],
    ["row missing points", { standings: [{ rows: [{ ...row(1, 1), points: undefined }] }] }],
    ["negative wins", { standings: [{ rows: [{ ...row(1, 1), wins: -1 }] }] }],
    ["duplicate team", { standings: [{ rows: [row(1, 1), row(2, 1)] }] }],
    ["duplicate position", { standings: [{ rows: [row(1, 1), row(1, 2)] }] }],
  ])("rejects: %s", (_name, bad) => {
    expect(() => parseSofascoreStandings(bad)).toThrow(FootballError);
  });
});
