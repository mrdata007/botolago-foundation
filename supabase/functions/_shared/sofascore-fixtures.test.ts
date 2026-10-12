import { describe, expect, test } from "bun:test";
import {
  BOTOLA_UNIQUE_TOURNAMENT_ID,
  SOFASCORE_LIVE_EVENTS_PATH,
  buildFixtureIngestPlan,
  collapseReplacedEvents,
  computeLiveMinute,
  createMapLookup,
  mapSofascoreStatus,
  parseSofascoreEvents,
  runSofascoreLiveShadow,
  sofascoreRoundExternalId,
} from "./sofascore-fixtures.ts";

// Synthetic payloads: invented ids and teams, same field names as the probe.
const SEASON = 5000;
const START = 1_790_000_000; // seconds
const OBSERVED = new Date((START + 3000) * 1000);

function event(
  id: number,
  home: number,
  away: number,
  status: { code: number; type: string },
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    startTimestamp: START,
    status: { ...status, description: "x" },
    roundInfo: { round: 4 },
    tournament: { id: 1, uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
    season: { id: SEASON },
    homeTeam: { id: home, name: `Home ${home}` },
    awayTeam: { id: away, name: `Away ${away}` },
    changes: { changeTimestamp: START + 2000 },
    ...extra,
  };
}
const score = (current: number) => ({ current, period1: 0 });
const foreign = (id: number) => ({
  ...event(id, 9001, 9002, { code: 6, type: "inprogress" }),
  tournament: { id: 7, uniqueTournament: { id: 17 } },
});

const lookup = createMapLookup([
  ["competition", "937", "c0000000-0000-0000-0000-000000000001"],
  ["season", String(SEASON), "50000000-0000-0000-0000-000000000001"],
  ["round", sofascoreRoundExternalId(String(SEASON), 4), "a0000000-0000-0000-0000-000000000004"],
  ...[101, 102, 103, 104, 105, 106].map(
    (team) => ["team", String(team), `70000000-0000-0000-0000-00000000${team}`] as const,
  ),
  ...[1, 2, 3, 4, 6, 7].map(
    (fixture) =>
      ["fixture", String(fixture), `f0000000-0000-0000-0000-00000000000${fixture}`] as const,
  ),
]);

describe("mapSofascoreStatus", () => {
  test("maps the phases and flags the unknown", () => {
    expect(mapSofascoreStatus("inprogress", 6)).toMatchObject({ status: "live_first_half" });
    expect(mapSofascoreStatus("inprogress", 31)).toMatchObject({ status: "half_time" });
    expect(mapSofascoreStatus("inprogress", 7)).toMatchObject({ period: "second_half" });
    expect(mapSofascoreStatus("finished", 100)).toMatchObject({ status: "finished" });
    expect(mapSofascoreStatus("inprogress", 999).unknown).toBe(true);
    expect(mapSofascoreStatus("weird", 1).unknown).toBe(true);
  });
});

describe("parseSofascoreEvents", () => {
  test("filters foreign matches, counts malformed and unknown, rejects a bad top level", () => {
    const parsed = parseSofascoreEvents({
      events: [
        event(
          1,
          101,
          102,
          { code: 6, type: "inprogress" },
          { homeScore: score(1), awayScore: score(0) },
        ),
        foreign(900),
        { foreign: "odd shape", tournament: { uniqueTournament: { id: 17 } } },
        event(2, 103, 104, { code: 77, type: "inprogress" }),
        { id: 3 },
      ],
    });
    expect(parsed.polledCount).toBe(5);
    expect(parsed.events.map((e) => e.sofascoreEventId)).toEqual(["1"]);
    expect(parsed.foreignTournamentCount).toBe(2);
    expect(parsed.malformedCount).toBe(1);
    expect(parsed.unknownStatus).toEqual([
      { sofascoreEventId: "2", rawStatusType: "inprogress", rawStatusCode: 77 },
    ]);
    expect(() => parseSofascoreEvents({ nope: [] })).toThrow("invalid_provider_payload");
  });

  test("a half-present score is malformed", () => {
    const parsed = parseSofascoreEvents({
      events: [event(1, 101, 102, { code: 6, type: "inprogress" }, { homeScore: score(1) })],
    });
    expect(parsed.events).toHaveLength(0);
    expect(parsed.malformedCount).toBe(1);
  });

  test("malformed change timestamps never acquire the observation time", () => {
    for (const changeTimestamp of ["1790000000", 1.5, -1, null, 1e20]) {
      const parsed = parseSofascoreEvents({
        events: [
          event(
            1,
            101,
            102,
            { code: 6, type: "inprogress" },
            {
              changes: { changeTimestamp },
            },
          ),
        ],
      });
      expect(parsed.malformedCount).toBe(1);
      expect(parsed.events).toHaveLength(0);
      expect(buildFixtureIngestPlan(parsed.events, lookup, OBSERVED).calls).toHaveLength(0);
    }
  });

  test("only an absent change timestamp falls back to observation time", () => {
    for (const changes of [undefined, {}]) {
      const parsed = parseSofascoreEvents({
        events: [event(1, 101, 102, { code: 6, type: "inprogress" }, { changes })],
      });
      expect(parsed.malformedCount).toBe(0);
      expect(
        buildFixtureIngestPlan(parsed.events, lookup, OBSERVED).calls[0]?.p_fixture.sourceSequence,
      ).toBe(OBSERVED.getTime());
    }
  });
});

describe("collapseReplacedEvents", () => {
  test("drops a postponed event replaced by a new id for the same pairing", () => {
    const parsed = parseSofascoreEvents({
      events: [
        event(6, 105, 106, { code: 60, type: "postponed" }),
        event(7, 105, 106, { code: 0, type: "notstarted" }, { startTimestamp: START + 86_400 }),
      ],
    });
    const collapsed = collapseReplacedEvents(parsed.events);
    expect(collapsed.supersededIds).toEqual(["6"]);
    expect(collapsed.events.map((e) => e.sofascoreEventId)).toEqual(["7"]);
  });
});

describe("buildFixtureIngestPlan", () => {
  test("builds the exact ingest payload for half time and second half", () => {
    const parsed = parseSofascoreEvents({
      events: [
        event(
          1,
          101,
          102,
          { code: 31, type: "inprogress" },
          { homeScore: score(1), awayScore: score(0) },
        ),
        event(
          2,
          103,
          104,
          { code: 7, type: "inprogress" },
          { homeScore: score(2), awayScore: score(2) },
        ),
      ],
    });
    const plan = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED);
    expect(plan.unmapped).toEqual([]);
    expect(plan.calls[0]).toEqual({
      p_provider_name: "sofascore",
      p_external_id: "1",
      p_fixture: {
        competitionId: "c0000000-0000-0000-0000-000000000001",
        seasonId: "50000000-0000-0000-0000-000000000001",
        roundId: "a0000000-0000-0000-0000-000000000004",
        homeTeamId: "70000000-0000-0000-0000-00000000101",
        awayTeamId: "70000000-0000-0000-0000-00000000102",
        venueId: null,
        kickoffAt: new Date(START * 1000).toISOString(),
        status: "half_time",
        period: "half_time",
        minute: null,
        addedTime: null,
        homeScore: 1,
        awayScore: 0,
        providerUpdatedAt: new Date((START + 2000) * 1000).toISOString(),
        sourceSequence: (START + 2000) * 1000,
        sourceVersion: `sofascore:1:${(START + 2000) * 1000}`,
        finalizedAt: null,
      },
    });
    expect(plan.calls[1]?.p_fixture).toMatchObject({
      status: "live_second_half",
      period: "second_half",
    });
  });

  test("finalizes only a match played to its end", () => {
    const parsed = parseSofascoreEvents({
      events: [
        event(
          3,
          101,
          103,
          { code: 100, type: "finished" },
          { homeScore: score(1), awayScore: score(1) },
        ),
        event(
          4,
          102,
          104,
          { code: 90, type: "finished" },
          { homeScore: score(3), awayScore: score(0) },
        ),
      ],
    });
    const plan = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED);
    expect(plan.calls[0]?.p_fixture.finalizedAt).toBe(OBSERVED.toISOString());
    expect(plan.calls[1]?.p_fixture).toMatchObject({ status: "finished", finalizedAt: null });
    const early = buildFixtureIngestPlan(parsed.events, lookup, new Date((START - 10) * 1000));
    expect(early.calls[0]?.p_fixture.finalizedAt).toBeNull();
  });

  test("falls back to the observation time without a change timestamp", () => {
    const parsed = parseSofascoreEvents({
      events: [event(1, 101, 102, { code: 0, type: "notstarted" }, { changes: undefined })],
    });
    const call = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED).calls[0];
    expect(call?.p_fixture.sourceSequence).toBe(OBSERVED.getTime());
    expect(call?.p_fixture.homeScore).toBeNull();
  });

  test("reports unmapped teams, fixtures and rounds and never ingests them", () => {
    const parsed = parseSofascoreEvents({
      events: [
        event(1, 101, 555, { code: 6, type: "inprogress" }),
        event(88, 101, 102, { code: 6, type: "inprogress" }),
        event(2, 103, 104, { code: 6, type: "inprogress" }, { roundInfo: { round: 30 } }),
      ],
    });
    const plan = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED);
    expect(plan.calls).toHaveLength(0);
    expect(plan.unmapped).toEqual([
      { sofascoreEventId: "1", missing: ["away_team"] },
      { sofascoreEventId: "88", missing: ["fixture"] },
      { sofascoreEventId: "2", missing: ["round"] },
    ]);
  });

  test("rejects a finished match without a score", () => {
    const parsed = parseSofascoreEvents({
      events: [event(3, 101, 103, { code: 100, type: "finished" })],
    });
    const plan = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED);
    expect(plan.calls).toHaveLength(0);
    expect(plan.rejected).toEqual([{ sofascoreEventId: "3", reason: "finished_without_score" }]);
  });
});

describe("runSofascoreLiveShadow", () => {
  test("polls once and reports without writing", async () => {
    const paths: string[] = [];
    const client = {
      getJson: async (path: string) => {
        paths.push(path);
        return {
          data: {
            events: [
              event(
                1,
                101,
                102,
                { code: 7, type: "inprogress" },
                { homeScore: score(1), awayScore: score(1) },
              ),
              event(
                3,
                101,
                103,
                { code: 100, type: "finished" },
                { homeScore: score(2), awayScore: score(0) },
              ),
              event(4, 102, 104, { code: 77, type: "inprogress" }),
              event(2, 103, 999, { code: 6, type: "inprogress" }),
              event(6, 105, 106, { code: 60, type: "postponed" }),
              event(7, 105, 106, { code: 0, type: "notstarted" }),
              foreign(901),
              foreign(902),
            ],
          },
          quota: { limit: 500, remaining: 267 },
          requestsSent: 1,
        };
      },
    };
    const report = await runSofascoreLiveShadow({ client, lookup, now: () => OBSERVED });
    expect(paths).toEqual([SOFASCORE_LIVE_EVENTS_PATH]);
    expect(report).toMatchObject({
      mode: "shadow",
      polledEvents: 8,
      botolaEvents: 4,
      foreignTournamentEvents: 2,
      malformedEvents: 0,
      supersededEventIds: ["6"],
      quota: { limit: 500, remaining: 267 },
      requestsSent: 1,
    });
    expect(report.wouldIngest.map((c) => c.p_external_id)).toEqual(["1", "3", "7"]);
    expect(report.unmapped).toEqual([{ sofascoreEventId: "2", missing: ["away_team"] }]);
    expect(report.unknownStatus).toHaveLength(1);
  });
});

describe("computeLiveMinute", () => {
  const at = (seconds: number) => (START + seconds) * 1000;
  const live = (
    period: "first_half" | "second_half" | "extra_time" | "half_time" | "penalties",
    rawStatusCode: number,
    periodStartTimestamp: number | null = START,
  ) => ({ period, rawStatusCode, periodStartTimestamp });

  test("counts whole minutes since the half started, plus one", () => {
    expect(computeLiveMinute(live("first_half", 6), at(0))).toBe(1);
    expect(computeLiveMinute(live("first_half", 6), at(59))).toBe(1);
    expect(computeLiveMinute(live("first_half", 6), at(60))).toBe(2);
    expect(computeLiveMinute(live("first_half", 6), at(30 * 60))).toBe(31);
  });

  test("the second half starts from 45, extra time from 90 and 105", () => {
    expect(computeLiveMinute(live("second_half", 7), at(10))).toBe(46);
    expect(computeLiveMinute(live("second_half", 7), at(20 * 60))).toBe(66);
    expect(computeLiveMinute(live("extra_time", 41), at(10))).toBe(91);
    expect(computeLiveMinute(live("extra_time", 42), at(10))).toBe(106);
  });

  test("never runs past 45 / 90 / 105 / 120", () => {
    expect(computeLiveMinute(live("first_half", 6), at(50 * 60))).toBe(45);
    expect(computeLiveMinute(live("second_half", 7), at(60 * 60))).toBe(90);
    expect(computeLiveMinute(live("extra_time", 41), at(40 * 60))).toBe(105);
    expect(computeLiveMinute(live("extra_time", 42), at(40 * 60))).toBe(120);
  });

  test("no half start, no minute", () => {
    expect(computeLiveMinute(live("first_half", 6, null), at(600))).toBeNull();
    expect(computeLiveMinute(live("second_half", 7, null), at(600))).toBeNull();
  });

  test("no minute outside a running period, or for an unknown extra-time half", () => {
    expect(computeLiveMinute(live("half_time", 31), at(600))).toBeNull();
    expect(computeLiveMinute(live("penalties", 50), at(600))).toBeNull();
    expect(computeLiveMinute(live("extra_time", 99), at(600))).toBeNull();
  });

  test("a half start well in the future is a bad clock, a few seconds ahead is rounding", () => {
    expect(computeLiveMinute(live("first_half", 6, START + 600), at(0))).toBeNull();
    expect(computeLiveMinute(live("first_half", 6, START + 5), at(0))).toBe(1);
  });
});

describe("the live minute in the ingest plan", () => {
  const withTime = (seconds: number | undefined) =>
    event(
      1,
      101,
      102,
      { code: 7, type: "inprogress" },
      {
        homeScore: score(1),
        awayScore: score(0),
        ...(seconds === undefined ? {} : { time: { currentPeriodStartTimestamp: seconds } }),
      },
    );

  test("is written from time.currentPeriodStartTimestamp", () => {
    const parsed = parseSofascoreEvents({ events: [withTime(START + 2700)] });
    expect(parsed.events[0].periodStartTimestamp).toBe(START + 2700);
    const call = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED).calls[0];
    // OBSERVED is START + 3000: 300 s into the half, so the 6th minute of it
    expect(call.p_fixture.minute).toBe(51);
    expect(call.p_fixture.addedTime).toBeNull();
  });

  test("is not written, never guessed, when the half start is missing", () => {
    const parsed = parseSofascoreEvents({ events: [withTime(undefined)] });
    expect(parsed.events[0].periodStartTimestamp).toBeNull();
    const call = buildFixtureIngestPlan(parsed.events, lookup, OBSERVED).calls[0];
    expect(call.p_fixture.minute).toBeNull();
  });
});
