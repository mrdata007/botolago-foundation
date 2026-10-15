import { describe, expect, it } from "bun:test";

import { ManagerCardError } from "@/backend/manager-card/errors";

import {
  LEAGUE_RATING_KEYS,
  SupabasePremiumLeagueContextRepository,
  isLeagueContextMember,
  leagueContextResponseSchema,
  toLeagueSeries,
} from "./league-context";

/**
 * The samples below are real answers of migration 20261014150000, produced by running the fixture of
 * supabase/tests/database/premium_card_league_context.test.sql (the Manager Card fixture of
 * manager_card.test.sql, ticked for GW1, GW2, GW3 and GW5, with league L1 = A, B, C and F) on a local
 * PostgreSQL 17 (PGlite) and dumping the JSON `api.get_card_league_context` returns for member A:
 * the plain league (no rival), against B who shows their history, against C who does not, and for a
 * season in which G has no private league. The figures are worked out by hand in that test.
 */
const PLAIN: unknown = JSON.parse(
  '{"me": {"rank": 1, "total": 255, "teamId": "bc0e0000-0000-4000-8000-000000000401", "captain": {"weeks": 4, "points": 38}, "ratings": {"cap": {"rank": 1, "value": 84}, "con": {"rank": 1, "value": 99}, "ovr": {"rank": 1, "value": 81}, "sel": {"rank": 2, "value": 85}, "trf": {"rank": 1, "value": 55}}, "transfers": {"net": 2.0000000000000000, "gross": 6.0000000000000000, "counted": 2, "hitsPaid": 4, "transfers": 4}}, "rival": null, "weeks": [{"me": {"rank": 1, "score": 60, "movement": null, "previousRank": null}, "rival": null, "ranked": 3, "scored": 3, "captain": {"me": 12, "contributors": 3, "leagueAverage": 10.67}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 60, "gameweekSeq": 1, "gameweekName": "Gameweek 1", "leagueAverage": 56.67}, {"me": {"rank": 1, "score": 55, "movement": 0, "previousRank": 1}, "rival": null, "ranked": 3, "scored": 3, "captain": {"me": 10, "contributors": 2, "leagueAverage": null}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 55, "gameweekSeq": 2, "gameweekName": "Gameweek 2", "leagueAverage": 50.00}, {"me": {"rank": 2, "score": 60, "movement": -1, "previousRank": 1}, "rival": null, "ranked": 4, "scored": 4, "captain": {"me": 7, "contributors": 4, "leagueAverage": 4.50}, "ratings": {"cap": {"me": 81, "rank": null, "rated": 2, "average": null}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 77.00}, "ovr": {"me": 80, "rank": null, "rated": 2, "average": null}, "sel": {"me": 86, "rank": 3, "rated": 3, "average": 87.00}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 70, "gameweekSeq": 3, "gameweekName": "Gameweek 3", "leagueAverage": 50.00}, {"me": {"rank": 1, "score": 80, "movement": 1, "previousRank": 2}, "rival": null, "ranked": 4, "scored": 4, "captain": {"me": 9, "contributors": 4, "leagueAverage": 3.00}, "ratings": {"cap": {"me": 84, "rank": 1, "rated": 3, "average": 56.00}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 66.33}, "ovr": {"me": 81, "rank": 1, "rated": 3, "average": 63.33}, "sel": {"me": 85, "rank": 2, "rated": 3, "average": 76.33}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 80, "gameweekSeq": 5, "gameweekName": "Gameweek 5", "leagueAverage": 57.50}], "league": {"id": "bc0e0000-0000-4000-8000-000000000701", "name": "Test league 1", "ranked": 4, "members": 4}, "locked": false, "season": {"id": "bc0e0000-0000-4000-8000-000000000005", "label": "2089/90"}, "totals": {"ranked": 4, "leaderTotal": 255, "leagueAverage": 187.50}, "captain": {"contributors": 4, "leagueAverage": 20.50}, "ratings": {"cap": {"rated": 3, "average": 56.00}, "con": {"rated": 3, "average": 66.33}, "ovr": {"rated": 3, "average": 63.33}, "sel": {"rated": 3, "average": 76.33}, "trf": {"rated": 1, "average": 55.00}}, "minGroup": 3, "available": true, "transfers": {"contributors": 1, "leagueAverage": null, "leagueAverageAll": 0.50}}',
);
const SHOWN: unknown = JSON.parse(
  '{"me": {"rank": 1, "total": 255, "teamId": "bc0e0000-0000-4000-8000-000000000401", "captain": {"weeks": 4, "points": 38}, "ratings": {"cap": {"rank": 1, "value": 84}, "con": {"rank": 1, "value": 99}, "ovr": {"rank": 1, "value": 81}, "sel": {"rank": 2, "value": 85}, "trf": {"rank": 1, "value": 55}}, "transfers": {"net": 2.0000000000000000, "gross": 6.0000000000000000, "counted": 2, "hitsPaid": 4, "transfers": 4}}, "rival": {"rank": 2, "total": 220, "teamId": "bc0e0000-0000-4000-8000-000000000402", "captain": {"weeks": 3, "points": 15}, "ratings": {"cap": {"rank": 3, "value": 1}, "con": {"rank": 2, "value": 75}, "ovr": {"rank": 3, "value": 54}, "sel": {"rank": 1, "value": 86}, "trf": {"rank": null, "value": null}}, "transfers": {"net": 0, "gross": 0, "counted": 0, "hitsPaid": 0, "transfers": 0}, "historyVisible": true}, "weeks": [{"me": {"rank": 1, "score": 60, "movement": null, "previousRank": null}, "rival": {"rank": 1, "score": 60, "captain": 12, "ratings": {"cap": {"rank": null, "value": null}, "con": {"rank": null, "value": null}, "ovr": {"rank": null, "value": null}, "sel": {"rank": null, "value": null}, "trf": {"rank": null, "value": null}}, "movement": null}, "ranked": 3, "scored": 3, "captain": {"me": 12, "contributors": 3, "leagueAverage": 10.67}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 60, "gameweekSeq": 1, "gameweekName": "Gameweek 1", "leagueAverage": 56.67}, {"me": {"rank": 1, "score": 55, "movement": 0, "previousRank": 1}, "rival": {"rank": 2, "score": 50, "captain": null, "ratings": {"cap": {"rank": null, "value": null}, "con": {"rank": null, "value": null}, "ovr": {"rank": null, "value": null}, "sel": {"rank": null, "value": null}, "trf": {"rank": null, "value": null}}, "movement": -1}, "ranked": 3, "scored": 3, "captain": {"me": 10, "contributors": 2, "leagueAverage": null}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 55, "gameweekSeq": 2, "gameweekName": "Gameweek 2", "leagueAverage": 50.00}, {"me": {"rank": 2, "score": 60, "movement": -1, "previousRank": 1}, "rival": {"rank": 1, "score": 70, "captain": 5, "ratings": {"cap": {"rank": null, "value": null}, "con": {"rank": 1, "value": 99}, "ovr": {"rank": null, "value": null}, "sel": {"rank": 1, "value": 88}, "trf": {"rank": null, "value": null}}, "movement": 1}, "ranked": 4, "scored": 4, "captain": {"me": 7, "contributors": 4, "leagueAverage": 4.50}, "ratings": {"cap": {"me": 81, "rank": null, "rated": 2, "average": null}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 77.00}, "ovr": {"me": 80, "rank": null, "rated": 2, "average": null}, "sel": {"me": 86, "rank": 3, "rated": 3, "average": 87.00}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 70, "gameweekSeq": 3, "gameweekName": "Gameweek 3", "leagueAverage": 50.00}, {"me": {"rank": 1, "score": 80, "movement": 1, "previousRank": 2}, "rival": {"rank": 2, "score": 40, "captain": -2, "ratings": {"cap": {"rank": 3, "value": 1}, "con": {"rank": 2, "value": 75}, "ovr": {"rank": 3, "value": 54}, "sel": {"rank": 1, "value": 86}, "trf": {"rank": null, "value": null}}, "movement": -1}, "ranked": 4, "scored": 4, "captain": {"me": 9, "contributors": 4, "leagueAverage": 3.00}, "ratings": {"cap": {"me": 84, "rank": 1, "rated": 3, "average": 56.00}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 66.33}, "ovr": {"me": 81, "rank": 1, "rated": 3, "average": 63.33}, "sel": {"me": 85, "rank": 2, "rated": 3, "average": 76.33}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 80, "gameweekSeq": 5, "gameweekName": "Gameweek 5", "leagueAverage": 57.50}], "league": {"id": "bc0e0000-0000-4000-8000-000000000701", "name": "Test league 1", "ranked": 4, "members": 4}, "locked": false, "season": {"id": "bc0e0000-0000-4000-8000-000000000005", "label": "2089/90"}, "totals": {"ranked": 4, "leaderTotal": 255, "leagueAverage": 187.50}, "captain": {"contributors": 4, "leagueAverage": 20.50}, "ratings": {"cap": {"rated": 3, "average": 56.00}, "con": {"rated": 3, "average": 66.33}, "ovr": {"rated": 3, "average": 63.33}, "sel": {"rated": 3, "average": 76.33}, "trf": {"rated": 1, "average": 55.00}}, "minGroup": 3, "available": true, "transfers": {"contributors": 1, "leagueAverage": null, "leagueAverageAll": 0.50}}',
);
const HIDDEN: unknown = JSON.parse(
  '{"me": {"rank": 1, "total": 255, "teamId": "bc0e0000-0000-4000-8000-000000000401", "captain": {"weeks": 4, "points": 38}, "ratings": {"cap": {"rank": 1, "value": 84}, "con": {"rank": 1, "value": 99}, "ovr": {"rank": 1, "value": 81}, "sel": {"rank": 2, "value": 85}, "trf": {"rank": 1, "value": 55}}, "transfers": {"net": 2.0000000000000000, "gross": 6.0000000000000000, "counted": 2, "hitsPaid": 4, "transfers": 4}}, "rival": {"rank": 3, "total": 160, "teamId": "bc0e0000-0000-4000-8000-000000000403", "captain": null, "ratings": {"cap": {"rank": 2, "value": 83}, "con": {"rank": 3, "value": 25}, "ovr": {"rank": 2, "value": 55}, "sel": {"rank": 3, "value": 58}, "trf": {"rank": null, "value": null}}, "transfers": null, "historyVisible": false}, "weeks": [{"me": {"rank": 1, "score": 60, "movement": null, "previousRank": null}, "rival": null, "ranked": 3, "scored": 3, "captain": {"me": 12, "contributors": 3, "leagueAverage": 10.67}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 60, "gameweekSeq": 1, "gameweekName": "Gameweek 1", "leagueAverage": 56.67}, {"me": {"rank": 1, "score": 55, "movement": 0, "previousRank": 1}, "rival": null, "ranked": 3, "scored": 3, "captain": {"me": 10, "contributors": 2, "leagueAverage": null}, "ratings": {"cap": {"me": null, "rank": null, "rated": 0, "average": null}, "con": {"me": null, "rank": null, "rated": 0, "average": null}, "ovr": {"me": null, "rank": null, "rated": 0, "average": null}, "sel": {"me": null, "rank": null, "rated": 0, "average": null}, "trf": {"me": null, "rank": null, "rated": 0, "average": null}}, "leagueBest": 55, "gameweekSeq": 2, "gameweekName": "Gameweek 2", "leagueAverage": 50.00}, {"me": {"rank": 2, "score": 60, "movement": -1, "previousRank": 1}, "rival": null, "ranked": 4, "scored": 4, "captain": {"me": 7, "contributors": 4, "leagueAverage": 4.50}, "ratings": {"cap": {"me": 81, "rank": null, "rated": 2, "average": null}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 77.00}, "ovr": {"me": 80, "rank": null, "rated": 2, "average": null}, "sel": {"me": 86, "rank": 3, "rated": 3, "average": 87.00}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 70, "gameweekSeq": 3, "gameweekName": "Gameweek 3", "leagueAverage": 50.00}, {"me": {"rank": 1, "score": 80, "movement": 1, "previousRank": 2}, "rival": null, "ranked": 4, "scored": 4, "captain": {"me": 9, "contributors": 4, "leagueAverage": 3.00}, "ratings": {"cap": {"me": 84, "rank": 1, "rated": 3, "average": 56.00}, "con": {"me": 99, "rank": 1, "rated": 3, "average": 66.33}, "ovr": {"me": 81, "rank": 1, "rated": 3, "average": 63.33}, "sel": {"me": 85, "rank": 2, "rated": 3, "average": 76.33}, "trf": {"me": 55, "rank": null, "rated": 1, "average": null}}, "leagueBest": 80, "gameweekSeq": 5, "gameweekName": "Gameweek 5", "leagueAverage": 57.50}], "league": {"id": "bc0e0000-0000-4000-8000-000000000701", "name": "Test league 1", "ranked": 4, "members": 4}, "locked": false, "season": {"id": "bc0e0000-0000-4000-8000-000000000005", "label": "2089/90"}, "totals": {"ranked": 4, "leaderTotal": 255, "leagueAverage": 187.50}, "captain": {"contributors": 4, "leagueAverage": 20.50}, "ratings": {"cap": {"rated": 3, "average": 56.00}, "con": {"rated": 3, "average": 66.33}, "ovr": {"rated": 3, "average": 63.33}, "sel": {"rated": 3, "average": 76.33}, "trf": {"rated": 1, "average": 55.00}}, "minGroup": 3, "available": true, "transfers": {"contributors": 1, "leagueAverage": null, "leagueAverageAll": 0.50}}',
);
const NO_LEAGUE: unknown = JSON.parse(
  '{"league": null, "locked": false, "season": {"id": "bc0e0000-0000-4000-8000-000000000009", "label": "2088/89"}, "available": true}',
);
const LOCKED: unknown = JSON.parse('{"locked":true,"available":true}');

function parseMember(value: unknown) {
  const parsed = leagueContextResponseSchema.parse(value);
  if (!isLeagueContextMember(parsed)) throw new Error("not a member answer");
  return parsed;
}

type Result = { data: unknown; error: { code?: string; message?: string } | null };

function fakeApi(answer: (name: string, args: Record<string, unknown>) => Result) {
  const calls: Array<{ name: string; args: Record<string, unknown> | undefined }> = [];
  const api = {
    rpc(name: string, args?: Record<string, unknown>) {
      calls.push({ name, args });
      const result = Promise.resolve(answer(name, args ?? {}));
      return Object.assign(result, { abortSignal: () => result });
    },
  };
  return { repository: new SupabasePremiumLeagueContextRepository(api as never), calls };
}

const context = { actorId: null, requestId: "test" };
const TEAM_B = "bc0e0000-0000-4000-8000-000000000402";
const LEAGUE = "bc0e0000-0000-4000-8000-000000000701";

describe("league context contract", () => {
  it("accepts the database's answers, key for key, at any depth", () => {
    // zod strips keys it does not know: a deep equal with the raw answer proves each is declared.
    for (const sample of [PLAIN, SHOWN, HIDDEN, NO_LEAGUE]) {
      expect(leagueContextResponseSchema.parse(sample)).toEqual(sample as never);
    }
  });

  it("reads a member's league", () => {
    const answer = parseMember(PLAIN);
    expect(answer.league).toMatchObject({ name: "Test league 1", members: 4, ranked: 4 });
    expect(answer.season.label).toBe("2089/90");
    expect(answer.minGroup).toBe(3);
    expect(answer.weeks.map((week) => week.gameweekSeq)).toEqual([1, 2, 3, 5]);
    expect(answer.totals).toEqual({ ranked: 4, leagueAverage: 187.5, leaderTotal: 255 });
    expect(answer.me).toMatchObject({ total: 255, rank: 1, captain: { points: 38, weeks: 4 } });
    expect(answer.me.transfers).toEqual({
      net: 2,
      gross: 6,
      hitsPaid: 4,
      transfers: 4,
      counted: 2,
    });
    expect(answer.rival).toBeNull();
    expect(Object.keys(answer.ratings).sort()).toEqual([...LEAGUE_RATING_KEYS].sort());
  });

  it("reads a non-member as locked, with nothing else", () => {
    const parsed = leagueContextResponseSchema.parse(LOCKED);
    expect(parsed).toEqual({ available: true, locked: true });
    expect(isLeagueContextMember(parsed)).toBe(false);
    // A locked answer that carries data is refused: the lock is not a filter on the client.
    expect(() =>
      leagueContextResponseSchema.parse({ available: true, locked: true, weeks: [] }),
    ).toThrow();
  });

  it("reads the feature switched off, and a member with no league as an empty state", () => {
    expect(leagueContextResponseSchema.parse({ available: false })).toEqual({ available: false });
    const none = leagueContextResponseSchema.parse(NO_LEAGUE);
    expect(none).toMatchObject({ available: true, locked: false, league: null });
    expect(isLeagueContextMember(none)).toBe(false);
  });

  it("refuses a malformed member answer", () => {
    const broken = JSON.parse(JSON.stringify(PLAIN));
    broken.me.ratings.cap.value = 120;
    expect(() => leagueContextResponseSchema.parse(broken)).toThrow();
    const noTotals = JSON.parse(JSON.stringify(PLAIN));
    delete noTotals.totals;
    expect(() => leagueContextResponseSchema.parse(noTotals)).toThrow();
    const oldRank = JSON.parse(JSON.stringify(PLAIN));
    oldRank.weeks[0].me.rank = 0;
    expect(() => leagueContextResponseSchema.parse(oldRank)).toThrow();
  });
});

describe("the rival and the privacy switch", () => {
  it("shows the rival's weeks only when they switched their history on", () => {
    const shown = parseMember(SHOWN);
    expect(shown.rival?.historyVisible).toBe(true);
    expect(shown.weeks.map((week) => week.rival?.score)).toEqual([60, 50, 70, 40]);
    expect(shown.rival?.captain).toEqual({ points: 15, weeks: 3 });
    expect(shown.rival?.transfers).toEqual({
      net: 0,
      gross: 0,
      hitsPaid: 0,
      transfers: 0,
      counted: 0,
    });

    const hidden = parseMember(HIDDEN);
    expect(hidden.rival?.historyVisible).toBe(false);
    expect(hidden.weeks.every((week) => week.rival === null)).toBe(true);
    expect(hidden.rival?.captain).toBeNull();
    expect(hidden.rival?.transfers).toBeNull();
    // Always there: the total, the rank and today's ratings.
    expect(hidden.rival).toMatchObject({ total: 160, rank: 3 });
    expect(hidden.rival?.ratings.ovr.value).toBe(55);
  });
});

describe("toLeagueSeries", () => {
  it("lines the league figures up on the journées played", () => {
    const series = toLeagueSeries(parseMember(PLAIN));
    expect(series.gameweeks).toEqual([1, 2, 3, 5]);
    expect(series.leagueSize).toBe(4);
    expect(series.leagueAvg).toEqual([56.67, 50, 50, 57.5]);
    expect(series.leagueBest).toEqual([60, 55, 70, 80]);
    expect(series.youRank).toEqual([1, 1, 2, 1]);
    expect(series.youMovement).toEqual([null, 0, -1, 1]);
    expect(series.leaderTotal).toBe(255);
    expect(series.leagueTotal).toBe(187.5);
    expect(series.youTotal).toBe(255);
    expect(series.youSeasonRank).toBe(1);
    expect(series.leagueCaptainByWeek).toEqual([10.67, null, 4.5, 3]);
    expect(series.youCaptainByWeek).toEqual([12, 10, 7, 9]);
    expect(series.leagueCaptain).toBe(20.5);
    // One manager transferred: no average under the minimum group.
    expect(series.leagueNetTransfers).toBeNull();
    expect(series.leagueRating).toEqual({ CAP: 56, SEL: 76.33, TRF: 55, CON: 66.33, OVR: 63.33 });
    expect(series.ratingRank).toEqual({ CAP: 1, SEL: 2, TRF: 1, CON: 1, OVR: 1 });
    expect(series.ratingsByWeek.CAP.at(-1)).toEqual({ value: 84, leagueAverage: 56, rank: 1 });
    expect(series.ratingsByWeek.CAP[0]).toEqual({ value: null, leagueAverage: null, rank: null });
    expect(series.rivalRank).toBeNull();
    expect(series.rivalSeason).toBeNull();
    expect(series.historyVisible).toBeNull();
  });

  it("adds the rival's series when they show their history, and only then", () => {
    const shown = toLeagueSeries(parseMember(SHOWN));
    expect(shown.historyVisible).toBe(true);
    expect(shown.rivalRank).toEqual([1, 2, 1, 2]);
    expect(shown.rivalCaptainByWeek).toEqual([12, null, 5, -2]);
    expect(shown.rivalSeason).toMatchObject({ total: 220, rank: 2, captain: 15, netTransfers: 0 });

    const hidden = toLeagueSeries(parseMember(HIDDEN));
    expect(hidden.historyVisible).toBe(false);
    expect(hidden.rivalRank).toBeNull();
    expect(hidden.rivalCaptainByWeek).toBeNull();
    expect(hidden.rivalSeason).toBeNull();
    // Today's ratings and ranks of a rival who hides are still there.
    expect(hidden.rivalRating?.OVR).toBe(55);
    expect(hidden.rivalRatingRank?.OVR).toBe(2);
  });
});

describe("SupabasePremiumLeagueContextRepository", () => {
  it("reads a database the migration has not reached as the feature switched off", async () => {
    const { repository } = fakeApi(() => ({
      data: null,
      error: { code: "PGRST202", message: "Could not find the function" },
    }));
    expect(await repository.leagueContext({}, context)).toEqual({ available: false });
  });

  it("calls the function by its name with the arguments of the migration, nulls sent", async () => {
    const { repository, calls } = fakeApi(() => ({ data: PLAIN, error: null }));
    await repository.leagueContext({}, context);
    await repository.leagueContext({ league: LEAGUE }, context);
    await repository.leagueContext(
      { league: LEAGUE, season: "2089/90", rivalTeam: TEAM_B },
      context,
    );
    expect(calls).toEqual([
      {
        name: "get_card_league_context",
        args: { p_league: null, p_season: null, p_rival_team: null },
      },
      {
        name: "get_card_league_context",
        args: { p_league: LEAGUE, p_season: null, p_rival_team: null },
      },
      {
        name: "get_card_league_context",
        args: { p_league: LEAGUE, p_season: "2089/90", p_rival_team: TEAM_B },
      },
    ]);
  });

  it("returns the typed answer", async () => {
    const { repository } = fakeApi(() => ({ data: SHOWN, error: null }));
    const answer = await repository.leagueContext({ league: LEAGUE, rivalTeam: TEAM_B }, context);
    expect(isLeagueContextMember(answer) && answer.weeks.length).toBe(4);
  });

  it("maps a league or a rival that is not the caller's to not_found, and anything else loudly", async () => {
    for (const message of [
      "card_league_not_found",
      "card_duel_not_found",
      "card_season_not_found",
    ]) {
      const notMate = fakeApi(() => ({ data: null, error: { code: "PT404", message } }));
      await expect(
        notMate.repository.leagueContext({ league: LEAGUE }, context),
      ).rejects.toMatchObject({
        code: "not_found",
      });
    }
    const bad = fakeApi(() => ({ data: null, error: { code: "57014", message: "timeout" } }));
    await expect(bad.repository.leagueContext({}, context)).rejects.toBeInstanceOf(
      ManagerCardError,
    );
    await expect(bad.repository.leagueContext({}, context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
    const invalid = fakeApi(() => ({
      data: null,
      error: { code: "PT400", message: "validation_failed" },
    }));
    await expect(
      invalid.repository.leagueContext({ season: "nonsense" }, context),
    ).rejects.toMatchObject({
      code: "invalid_request",
    });
  });

  it("refuses an answer that does not match the contract", async () => {
    const { repository } = fakeApi(() => ({ data: { available: "yes" }, error: null }));
    await expect(repository.leagueContext({}, context)).rejects.toMatchObject({
      code: "data_unavailable",
    });
  });
});
