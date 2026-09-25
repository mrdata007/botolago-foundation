import { describe, expect, test } from "bun:test";
import type { FixtureRpcClient } from "./sportsmonks-fixtures";
import {
  MATCH_DETAILS_INCLUDE,
  matchDetailsConfiguration,
  normalizeMatchDetails,
  runMatchDetailsRefresh,
  type MatchDetailsSummary,
} from "./sportsmonks-match-details";

const HOME = 1001;
const AWAY = 1002;
const EXPECTED = { fixtureExternalId: "7001", leagueId: 860, seasonId: 28647 } as const;
const OBSERVED = "2026-09-24T22:05:00.000Z";

const environment = {
  SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-not-a-real-secret",
  FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
  FOOTBALL_SPORTSMONKS_SEASON_ID: "28647",
} as const;

function event(id: number, developerName: string, typeId: number, extra: Record<string, unknown>) {
  return {
    id,
    fixture_id: 7001,
    type_id: typeId,
    type: { id: typeId, developer_name: developerName },
    participant_id: HOME,
    player_id: null,
    related_player_id: null,
    player_name: null,
    minute: 1,
    extra_minute: null,
    sort_order: 0,
    ...extra,
  };
}

function lineupRow(
  id: number,
  team: number,
  player: number | null,
  typeId: number,
  extra: Record<string, unknown> = {},
) {
  return {
    id,
    fixture_id: 7001,
    team_id: team,
    player_id: player,
    type_id: typeId,
    position_id: 26,
    formation_position: null,
    jersey_number: 8,
    player_name: `Player ${player}`,
    ...extra,
  };
}

/** A finished 1-3, as `/fixtures/{id}` returns it with MATCH_DETAILS_INCLUDE. */
function fixture(overrides: Record<string, unknown> = {}) {
  return {
    data: {
      id: 7001,
      league_id: 860,
      season_id: 28647,
      last_processed_at: "2026-09-24 22:01:30",
      participants: [
        { id: HOME, meta: { location: "home" } },
        { id: AWAY, meta: { location: "away" } },
      ],
      events: [
        // Listed out of order: the timeline is sorted by minute.
        event(5, "GOAL", 14, {
          participant_id: AWAY,
          player_id: 501,
          related_player_id: 502,
          player_name: "Away Scorer",
          minute: 67,
          result: "1-3",
        }),
        event(1, "GOAL", 14, {
          participant_id: AWAY,
          player_id: 501,
          player_name: "Away Scorer",
          minute: 12,
          result: "0-1",
        }),
        // Filed under the home club, but the score says it counted for the away side.
        event(3, "OWNGOAL", 15, {
          participant_id: HOME,
          player_id: 401,
          player_name: "Home Defender",
          minute: 45,
          extra_minute: 2,
          result: "0-2",
        }),
        event(4, "PENALTY", 16, {
          player_id: 402,
          player_name: "Home Striker",
          minute: 58,
          result: "1-2",
        }),
        event(2, "YELLOWCARD", 19, { player_id: 403, player_name: "Home Midfielder", minute: 30 }),
        event(6, "SUBSTITUTION", 18, {
          participant_id: AWAY,
          player_id: 503,
          related_player_id: 501,
          player_name: "Away Sub",
          minute: 75,
        }),
        event(7, "VAR", 10, { participant_id: null, minute: 80, player_name: "Goal Disallowed" }),
        // No `type` include: the id says what it is.
        {
          ...event(8, "YELLOWREDCARD", 21, { player_id: 404, minute: 90, extra_minute: 4 }),
          type: undefined,
        },
        // Not on the page: withdrawn, a shoot-out kick, an unknown type, a
        // club that is not in the match, and a repeat.
        event(10, "REDCARD", 20, { rescinded: true, minute: 60 }),
        event(11, "PENALTY_SHOOTOUT_GOAL", 23, { minute: 120 }),
        event(12, "SOMETHING_NEW", 9999, { minute: 50 }),
        event(13, "GOAL", 14, { participant_id: 4242, minute: 20 }),
        event(1, "GOAL", 14, { participant_id: AWAY, minute: 12 }),
        // The included type disagrees with the row's id: trusted by neither.
        { ...event(14, "GOAL", 14, { minute: 33 }), type_id: 19 },
      ],
      statistics: [
        {
          type_id: 45,
          type: { id: 45, developer_name: "BALL_POSSESSION" },
          participant_id: HOME,
          location: "home",
          data: { value: 44 },
        },
        {
          type_id: 45,
          type: { id: 45, developer_name: "BALL_POSSESSION" },
          participant_id: AWAY,
          location: "away",
          data: { value: 56 },
        },
        // By id alone, and by location alone.
        { type_id: 42, participant_id: HOME, data: { value: 9 } },
        {
          type_id: 42,
          type: { id: 42, developer_name: "SHOTS_TOTAL" },
          location: "away",
          data: { value: 14 },
        },
        // Kept by the provider, not shown here: not stored, not counted.
        {
          type_id: 43,
          type: { id: 43, developer_name: "ATTACKS" },
          participant_id: HOME,
          data: { value: 90 },
        },
        // Unreadable: counted as skipped.
        {
          type_id: 34,
          type: { id: 34, developer_name: "CORNERS" },
          participant_id: HOME,
          data: { value: -1 },
        },
        {
          type_id: 45,
          type: { id: 45, developer_name: "BALL_POSSESSION" },
          participant_id: HOME,
          data: { value: 44 },
        },
      ],
      lineups: [
        lineupRow(1, HOME, 401, 11, { position_id: 24, formation_position: 1, jersey_number: 1 }),
        lineupRow(2, HOME, 402, 11, { position_id: 27, formation_position: 11, jersey_number: 9 }),
        lineupRow(3, HOME, null, 11, { formation_position: 6 }),
        lineupRow(4, HOME, 405, 12, { position_id: null, jersey_number: 0 }),
        lineupRow(5, AWAY, 501, 11, { position_id: 27, formation_position: 10 }),
        lineupRow(6, 4242, 999, 11),
        lineupRow(7, AWAY, 503, 99),
      ],
      formations: [
        { participant_id: HOME, formation: "4-3-3", location: "home" },
        { participant_id: AWAY, formation: "4-2-3-1", location: "away" },
      ],
      ...overrides,
    },
  };
}

describe("normalizeMatchDetails", () => {
  const details = normalizeMatchDetails(fixture(), EXPECTED, OBSERVED);

  test("keeps the provider's time, and orders two reads by when they were made", () => {
    expect(details.providerUpdatedAt).toBe("2026-09-24T22:01:30.000Z");
    expect(details.sourceSequence).toBe(Date.parse(OBSERVED));
  });

  test("lists the events in match order, each on its side", () => {
    expect(
      details.events.map((e) => [
        e.sequence,
        e.key,
        e.type,
        e.teamExternalId,
        e.minute,
        e.addedTime,
        e.period,
      ]),
    ).toEqual([
      [1, "1", "goal", "1002", 12, 0, "first_half"],
      [2, "2", "yellow_card", "1001", 30, 0, "first_half"],
      [3, "3", "own_goal", "1002", 45, 2, "first_half"],
      [4, "4", "penalty_goal", "1001", 58, 0, "second_half"],
      [5, "5", "goal", "1002", 67, 0, "second_half"],
      [6, "6", "substitution", "1002", 75, 0, "second_half"],
      [7, "7", "var", null, 80, 0, "second_half"],
      [8, "8", "second_yellow", "1001", 90, 4, "second_half"],
    ]);
  });

  test("names the players, the assist and the player replaced", () => {
    const byKey = new Map(details.events.map((e) => [e.key, e]));
    expect(byKey.get("5")).toMatchObject({
      playerExternalId: "501",
      relatedPlayerExternalId: "502",
      detail: "Away Scorer",
    });
    expect(byKey.get("6")).toMatchObject({
      playerExternalId: "503",
      relatedPlayerExternalId: "501",
      detail: "Away Sub",
    });
    // The provider's VAR text is English whatever the reader's language.
    expect(byKey.get("7")?.detail).toBeNull();
  });

  test("counts what it could not read, and ignores what the page does not show", () => {
    // The unknown type, the club not in the match, the type/id disagreement.
    expect(details.skipped.events).toBe(3);
    // The negative corner count and the repeated possession.
    expect(details.skipped.statistics).toBe(2);
    // The row for another club and the unknown lineup type.
    expect(details.skipped.lineupPlayers).toBe(2);
  });

  test("maps the statistics the page defines, by type name or by id", () => {
    expect(details.statistics).toEqual([
      { code: "possession", teamExternalId: "1001", value: 44, displayValue: null },
      { code: "possession", teamExternalId: "1002", value: 56, displayValue: null },
      { code: "shots", teamExternalId: "1001", value: 9, displayValue: null },
      { code: "shots", teamExternalId: "1002", value: 14, displayValue: null },
    ]);
  });

  test("builds each club's lineup with its formation, slots and positions", () => {
    expect(details.lineups).toEqual([
      {
        teamExternalId: "1001",
        formation: "4-3-3",
        confirmed: true,
        players: [
          {
            playerExternalId: "401",
            slot: "starting",
            position: "goalkeeper",
            shirtNumber: 1,
            order: 1,
          },
          {
            playerExternalId: "402",
            slot: "starting",
            position: "forward",
            shirtNumber: 9,
            order: 11,
          },
          // The provider's anonymous starter: sent, so the database counts it.
          {
            playerExternalId: null,
            slot: "starting",
            position: "midfielder",
            shirtNumber: 8,
            order: 6,
          },
          { playerExternalId: "405", slot: "bench", position: null, shirtNumber: null, order: 103 },
        ],
      },
      {
        teamExternalId: "1002",
        formation: "4-2-3-1",
        confirmed: true,
        players: [
          {
            playerExternalId: "501",
            slot: "starting",
            position: "forward",
            shirtNumber: 8,
            order: 10,
          },
        ],
      },
    ]);
  });

  test("leaves the own goal on the provider's side when the score cannot say", () => {
    const own = event(3, "OWNGOAL", 15, { participant_id: HOME, minute: 30 });
    const [only] = normalizeMatchDetails(fixture({ events: [own] }), EXPECTED, OBSERVED).events;
    expect(only.teamExternalId).toBe("1001");
  });

  test("sends a section the reply lacks as empty, which the database keeps as stored", () => {
    const bare = normalizeMatchDetails(
      fixture({ events: undefined, statistics: null, lineups: undefined, formations: undefined }),
      EXPECTED,
      OBSERVED,
    );
    expect(bare.events).toEqual([]);
    expect(bare.statistics).toEqual([]);
    expect(bare.lineups).toEqual([]);
    // No provider time either: when it was read stands in.
    expect(
      normalizeMatchDetails(fixture({ last_processed_at: null }), EXPECTED, OBSERVED)
        .providerUpdatedAt,
    ).toBe(OBSERVED);
  });

  test("refuses another fixture, league or season, and a malformed reply", () => {
    for (const overrides of [
      { id: 7002 },
      { league_id: 861 },
      { season_id: 1 },
      { events: "none" },
    ]) {
      expect(() => normalizeMatchDetails(fixture(overrides), EXPECTED, OBSERVED)).toThrow(
        "invalid_provider_payload",
      );
    }
    expect(() =>
      normalizeMatchDetails(
        fixture({ participants: [{ id: HOME, meta: { location: "home" } }] }),
        EXPECTED,
        OBSERVED,
      ),
    ).toThrow("invalid_provider_payload");
    expect(() => normalizeMatchDetails({ data: [] }, EXPECTED, OBSERVED)).toThrow(
      "invalid_provider_payload",
    );
  });
});

describe("matchDetailsConfiguration", () => {
  test("needs the provider token and numeric league and season ids", () => {
    expect(matchDetailsConfiguration(environment)).toMatchObject({
      leagueId: 860,
      seasonId: 28647,
    });
    for (const broken of [
      { ...environment, SPORTSMONKS_API_TOKEN: "short" },
      { ...environment, SPORTSMONKS_API_TOKEN: "has a space in the middle of it" },
      { ...environment, FOOTBALL_SPORTSMONKS_SEASON_ID: "28647; drop" },
      { ...environment, FOOTBALL_SPORTSMONKS_LEAGUE_ID: undefined },
    ]) {
      expect(() => matchDetailsConfiguration(broken)).toThrow("invalid_runtime_configuration");
    }
  });
});

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function client(
  calls: RpcCall[],
  answers: Record<string, (args: Record<string, unknown>) => { data: unknown; error: unknown }>,
): FixtureRpcClient {
  return {
    schema(name) {
      expect(name).toBe("api");
      return {
        async rpc(rpcName, args) {
          calls.push({ name: rpcName, args });
          const answer = answers[rpcName];
          return (answer ? answer(args) : { data: null, error: null }) as {
            data: unknown;
            error: { message?: string; code?: string } | null;
          };
        },
      };
    },
  };
}

describe("runMatchDetailsRefresh", () => {
  test("fetches each due fixture once, stores it, and records the run", async () => {
    const calls: RpcCall[] = [];
    const requested: URL[] = [];
    const outcome = await runMatchDetailsRefresh("live", {
      environment,
      now: () => new Date(OBSERVED),
      client: client(calls, {
        service_football_match_details_due: () => ({
          data: [
            { externalId: "7001", status: "finished" },
            { externalId: "7002", status: "live_second_half" },
            { externalId: "7003", status: "live_first_half" },
          ],
          error: null,
        }),
        begin_football_ingestion: () => ({
          data: "50000000-0000-4000-8000-000000000001",
          error: null,
        }),
        ingest_football_match_details: (args) =>
          args.p_fixture_external_id === "7001"
            ? {
                data: {
                  outcome: "stored",
                  events: 9,
                  statistics: 4,
                  lineupPlayers: 4,
                  unmappedPlayers: 1,
                },
                error: null,
              }
            : { data: { outcome: "stale" }, error: null },
      }),
      fetch: async (input, init) => {
        const url = new URL(String(input));
        requested.push(url);
        expect(new Headers(init?.headers).get("authorization")).toBe(
          environment.SPORTSMONKS_API_TOKEN,
        );
        if (url.pathname.endsWith("/7003")) return new Response("no", { status: 403 });
        const id = Number(url.pathname.split("/").pop());
        return Response.json(fixture({ id }));
      },
      sleep: async () => undefined,
    });

    expect(requested.map((url) => url.pathname).sort()).toEqual([
      "/v3/football/fixtures/7001",
      "/v3/football/fixtures/7002",
      "/v3/football/fixtures/7003",
    ]);
    expect(requested[0].searchParams.get("include")).toBe(MATCH_DETAILS_INCLUDE);
    expect(requested.some((url) => url.href.includes(environment.SPORTSMONKS_API_TOKEN))).toBe(
      false,
    );

    expect(outcome).toEqual({
      scope: "live",
      due: 3,
      stored: 1,
      stale: 1,
      rejected: 1,
      events: 9,
      statistics: 4,
      lineupPlayers: 4,
      unmappedPlayers: 1,
      skipped: { events: 3, statistics: 2, lineupPlayers: 2 },
      errors: ["provider_unavailable"],
    } satisfies MatchDetailsSummary);

    const byName = (name: string) => calls.filter((call) => call.name === name);
    expect(byName("service_football_match_details_due")[0].args).toEqual({
      p_provider_name: "sportsmonks",
      p_season_external_id: "28647",
      p_scope: "live",
      p_limit: 8,
    });
    expect(byName("begin_football_ingestion")[0].args).toMatchObject({
      p_job_type: "match_events",
      p_target_scope: { kind: "match_details", scope: "live" },
    });
    const stored = byName("ingest_football_match_details").find(
      (call) => call.args.p_fixture_external_id === "7001",
    );
    expect(stored?.args.p_details).toMatchObject({
      providerUpdatedAt: "2026-09-24T22:01:30.000Z",
      sourceSequence: Date.parse(OBSERVED),
    });
    // What was skipped is reported, not sent.
    expect(stored?.args.p_details).not.toHaveProperty("skipped");
    expect(byName("record_football_ingestion_rejection")[0].args).toMatchObject({
      p_entity_type: "fixture",
      p_external_id: "7003",
      p_error_code: "provider_unavailable",
    });
    expect(byName("complete_football_ingestion")[0].args).toMatchObject({
      p_status: "partial",
      p_records_fetched: 3,
      p_records_updated: 1,
      p_records_skipped: 1,
      p_records_rejected: 1,
      p_error_code: "match_details_item_rejected",
    });
  });

  test("does nothing, and records nothing, when no fixture is due", async () => {
    const calls: RpcCall[] = [];
    const outcome = await runMatchDetailsRefresh("backfill", {
      environment,
      client: client(calls, {
        service_football_match_details_due: () => ({ data: [], error: null }),
      }),
      fetch: async () => {
        throw new Error("provider must not be called");
      },
    });
    expect(outcome).toMatchObject({ scope: "backfill", due: 0, stored: 0 });
    expect(calls.map((call) => call.name)).toEqual(["service_football_match_details_due"]);
    expect(calls[0].args.p_limit).toBe(10);
  });

  test("reports a database refusal as a code, without throwing", async () => {
    const calls: RpcCall[] = [];
    const outcome = await runMatchDetailsRefresh("live", {
      environment,
      now: () => new Date(OBSERVED),
      client: client(calls, {
        service_football_match_details_due: () => ({
          data: [{ externalId: "7001", status: "finished" }],
          error: null,
        }),
        begin_football_ingestion: () => ({
          data: "50000000-0000-4000-8000-000000000001",
          error: null,
        }),
        ingest_football_match_details: () => ({
          data: null,
          error: { code: "22023", message: "INVALID_PROVIDER_PAYLOAD" },
        }),
      }),
      fetch: async () => Response.json(fixture()),
    });
    expect(outcome).toMatchObject({
      rejected: 1,
      stored: 0,
      errors: ["details_rejected_by_database"],
    });
    expect(calls.find((call) => call.name === "complete_football_ingestion")?.args.p_status).toBe(
      "failed",
    );
  });

  test("returns the failure when the due list cannot be read", async () => {
    const outcome = await runMatchDetailsRefresh("live", {
      environment,
      client: client([], {
        service_football_match_details_due: () => ({
          data: null,
          error: { code: "P0002", message: "MAPPING_NOT_FOUND" },
        }),
      }),
    });
    expect(outcome).toEqual({ scope: "live", error: "mapping_not_found" });
    expect(
      await runMatchDetailsRefresh("live", { environment: {}, client: client([], {}) }),
    ).toEqual({
      scope: "live",
      error: "invalid_runtime_configuration",
    });
  });
});
