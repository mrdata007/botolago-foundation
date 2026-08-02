import { describe, expect, it } from "bun:test";

import {
  handleSportsMonksHistoricalPlayerPerformanceRequest,
  normalizeHistoricalFixture,
  type HistoricalPerformanceRpcClient,
} from "./sportsmonks-historical-player-performance";

const TOKEN = "sportsmonks-test-token-1234567890";
const TRIGGER = "historical-performance-trigger-secret-1234567890";
const NOW = new Date("2026-08-02T18:00:00.000Z");
const FIXTURE_ID = 19_489_211;
const SEASON_ID = 26_027;

const environment = {
  SPORTSMONKS_API_TOKEN: TOKEN,
  FOOTBALL_INGESTION_TRIGGER_SECRET: TRIGGER,
  FOOTBALL_PROVIDER: "sportsmonks",
  FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
  FOOTBALL_SPORTSMONKS_SEASON_ID: String(SEASON_ID),
  FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
  FOOTBALL_PROVIDER_MAX_RETRIES: "2",
};

function fixturePayload(withPlaceholder = false): Record<string, unknown> {
  const lineups = Array.from({ length: 22 }, (_, index) => ({
    id: 1_000 + index,
    fixture_id: FIXTURE_ID,
    player_id: 10_000 + index,
    team_id: index < 11 ? 500 : 600,
    type_id: 11,
    details: [
      {
        type_id: 118,
        data: { value: 6.5 + (index % 4) * 0.25 },
      },
      { type_id: 119, data: { value: 90 } },
      { type_id: 52, data: { value: index === 0 ? 1 : 0 } },
    ],
  }));
  if (withPlaceholder) {
    lineups.push({
      id: 9_999,
      fixture_id: FIXTURE_ID,
      player_id: null,
      team_id: null,
      type_id: null,
      details: [],
    });
  }
  return {
    data: {
      id: FIXTURE_ID,
      league_id: 860,
      season_id: SEASON_ID,
      lineups,
    },
  };
}

function request(body: Record<string, unknown>, key = TRIGGER): Request {
  return new Request("https://example.test/functions/v1/football-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-ingestion-key": key,
    },
    body: JSON.stringify(body),
  });
}

function rpcClient(
  handler: (name: string, args: Record<string, unknown>) => unknown,
): HistoricalPerformanceRpcClient {
  return {
    schema: () => ({
      rpc: async (name, args) => ({ data: handler(name, args), error: null }),
    }),
  };
}

describe("SportsMonks completed-fixture player performances", () => {
  it("normalizes only player rows and records incomplete provider placeholders", async () => {
    const normalized = await normalizeHistoricalFixture(
      fixturePayload(true),
      FIXTURE_ID,
      SEASON_ID,
    );

    expect(normalized).toMatchObject({
      fixtureId: FIXTURE_ID,
      seasonId: SEASON_ID,
      coverage: {
        lineupRowsSeen: 23,
        validPlayerRows: 22,
        excludedIncompleteRows: 1,
        starterRows: 22,
        teamCount: 2,
        detailRows: 66,
        invalidDetailRows: 0,
      },
    });
    expect(normalized.sourceVersion).toMatch(/^sportsmonks-fixture:[0-9a-f]{64}$/);
    expect(normalized.rows).toHaveLength(22);
    expect(normalized.rows[0]).toMatchObject({
      externalPlayerId: "10000",
      externalTeamId: "500",
      started: true,
      appeared: true,
      minutes: 90,
      goals: 1,
      providerRating: 6.5,
    });
  });

  it("ingests one bounded fixture batch through service-only RPCs", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const response = await handleSportsMonksHistoricalPlayerPerformanceRequest(
      request({
        job: "historical_player_performances",
        action: "ingest_batch",
        afterFixtureExternalId: null,
        batchSize: 5,
      }),
      {
        environment,
        now: () => NOW,
        fetch: async (input, init) => {
          const url = new URL(input instanceof Request ? input.url : input.toString());
          expect(url.pathname).toBe(`/v3/football/fixtures/${FIXTURE_ID}`);
          expect(url.searchParams.get("include")).toBe("lineups.details");
          expect(url.searchParams.get("filters")).toContain("lineupDetailTypes:52");
          expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
          return Response.json(fixturePayload(true));
        },
        client: rpcClient((name, args) => {
          calls.push({ name, args });
          if (name === "begin_historical_performance_ingestion")
            return "11111111-1111-4111-8111-111111111111";
          if (name === "football_historical_performance_fixture_batch") {
            return {
              seasonExternalId: String(SEASON_ID),
              expectedFixtureCount: 240,
              items: [
                {
                  externalFixtureId: String(FIXTURE_ID),
                  kickoffAt: "2025-09-12T16:00:00Z",
                },
              ],
              nextCursor: null,
              hasMore: false,
            };
          }
          if (name === "ingest_historical_player_fixture_performance") {
            expect(args.p_rows).toHaveLength(22);
            expect(args.p_coverage).toMatchObject({
              excludedIncompleteRows: 1,
              invalidDetailRows: 0,
            });
            return { inserted: 22, updated: 0, skipped: 0, active: 22, reconciled: true };
          }
          if (name === "complete_football_ingestion") return true;
          throw new Error(`unexpected rpc ${name}`);
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "sportsmonks",
      seasonId: SEASON_ID,
      action: "ingest_batch",
      expectedFixtureCount: 240,
      fixturesProcessed: 1,
      performanceRows: 22,
      excludedIncompleteRows: 1,
      nextCursor: null,
      hasMore: false,
      counters: { fetched: 23, validated: 22, inserted: 22, rejected: 0 },
    });
    expect(calls.map((call) => call.name)).toEqual([
      "begin_historical_performance_ingestion",
      "football_historical_performance_fixture_batch",
      "ingest_historical_player_fixture_performance",
      "complete_football_ingestion",
    ]);
  });

  it("derives v2 ratings only after exact fixture coverage is asserted by the database", async () => {
    const calls: string[] = [];
    const response = await handleSportsMonksHistoricalPlayerPerformanceRequest(
      request({ job: "historical_player_performances", action: "derive_ratings" }),
      {
        environment,
        now: () => NOW,
        client: rpcClient((name, args) => {
          calls.push(name);
          if (name === "begin_football_ingestion") return "22222222-2222-4222-8222-222222222222";
          if (name === "football_historical_player_rating_inputs") {
            return {
              seasonExternalId: String(SEASON_ID),
              expectedFixtureCount: 240,
              coveredFixtureCount: 240,
              performanceCount: 9_100,
              sourceVersion: `sportsmonks-season-fixtures:${"a".repeat(64)}`,
              rows: [
                {
                  externalPlayerId: "10000",
                  position: "FWD",
                  appearances: 28,
                  starts: 27,
                  minutes: 2_400,
                  goals: 16,
                  assists: 8,
                  cleanSheets: 0,
                  goalsConceded: 0,
                  saves: 0,
                  penaltiesSaved: 0,
                  penaltiesMissed: 1,
                  yellowCards: 3,
                  redCards: 0,
                  secondYellowDismissals: 0,
                  ownGoals: 0,
                  providerRatingWeighted: 17_760,
                  providerRatingMinutes: 2_400,
                },
                {
                  externalPlayerId: "10001",
                  position: "FWD",
                  appearances: 20,
                  starts: 10,
                  minutes: 1_100,
                  goals: 4,
                  assists: 2,
                  cleanSheets: 0,
                  goalsConceded: 0,
                  saves: 0,
                  penaltiesSaved: 0,
                  penaltiesMissed: 0,
                  yellowCards: 1,
                  redCards: 0,
                  secondYellowDismissals: 0,
                  ownGoals: 0,
                  providerRatingWeighted: 7_040,
                  providerRatingMinutes: 1_100,
                },
              ],
            };
          }
          if (name === "ingest_historical_player_season_ratings") {
            const rows = args.p_rows as Array<Record<string, unknown>>;
            expect(rows).toHaveLength(2);
            expect(
              rows.every(
                (row) =>
                  row.algorithmVersion === "botolago-preseason-rating-v2-fixture-performance",
              ),
            ).toBe(true);
            expect(rows[0].rating).toBeGreaterThan(rows[1].rating as number);
            return { inserted: 2, updated: 0, skipped: 0, active: 2 };
          }
          if (name === "complete_football_ingestion") return true;
          throw new Error(`unexpected rpc ${name}`);
        }),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      provider: "sportsmonks",
      seasonId: SEASON_ID,
      action: "derive_ratings",
      historicalOnly: true,
      algorithmVersion: "botolago-preseason-rating-v2-fixture-performance",
      expectedFixtureCount: 240,
      performanceRows: 9_100,
      candidates: 2,
    });
    expect(calls).toEqual([
      "begin_football_ingestion",
      "football_historical_player_rating_inputs",
      "ingest_historical_player_season_ratings",
      "complete_football_ingestion",
    ]);
  });

  it("rejects unauthorized and structurally incomplete requests before any provider call", async () => {
    let providerCalled = false;
    const response = await handleSportsMonksHistoricalPlayerPerformanceRequest(
      request(
        {
          job: "historical_player_performances",
          action: "ingest_batch",
          afterFixtureExternalId: null,
          batchSize: 5,
        },
        "wrong-secret",
      ),
      {
        environment,
        fetch: async () => {
          providerCalled = true;
          return Response.json(fixturePayload());
        },
        client: rpcClient(() => {
          throw new Error("rpc should not be called");
        }),
      },
    );
    expect(response.status).toBe(401);
    expect(providerCalled).toBe(false);
  });
});
