import { describe, expect, it } from "bun:test";

import {
  calculatePreseasonRatings,
  handleSportsMonksPlayerRatingsRequest,
  MIN_STATISTICS_COVERAGE,
  PLAYER_STATISTICS_COVERAGE_INSUFFICIENT,
  PLAYER_STATISTICS_UNAVAILABLE,
  type PlayerSeasonStatistics,
  type RatingCandidate,
  type RatingsRpcClient,
} from "./sportsmonks-player-ratings";

const TOKEN = "sportsmonks-test-token-1234567890";
const SECRET = "ratings-trigger-secret-1234567890abcdef";
const NOW = new Date("2026-07-31T23:00:00.000Z");

function stats(
  candidate: RatingCandidate,
  overrides: Partial<PlayerSeasonStatistics> = {},
): PlayerSeasonStatistics {
  return {
    ...candidate,
    appearances: 0,
    starts: 0,
    minutes: 0,
    goals: 0,
    assists: 0,
    cleanSheets: 0,
    goalsConceded: 0,
    saves: 0,
    penaltiesSaved: 0,
    penaltiesMissed: 0,
    yellowCards: 0,
    redCards: 0,
    secondYellowDismissals: 0,
    ownGoals: 0,
    providerRatingWeighted: 0,
    providerRatingMinutes: 0,
    ...overrides,
  };
}

function environment(): Record<string, string> {
  return {
    SPORTSMONKS_API_TOKEN: TOKEN,
    FOOTBALL_INGESTION_TRIGGER_SECRET: SECRET,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_SEASON_ID: "26027",
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
  };
}

function request(secret = SECRET): Request {
  return new Request("https://example.test/football-ingest", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-botolago-ingestion-key": secret,
    },
    body: JSON.stringify({ job: "preseason_ratings" }),
  });
}

function response(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json" },
  });
}

function detail(typeId: number, value: number, key = "total") {
  return { id: typeId * 10, type_id: typeId, value: { [key]: value } };
}

function providerRow(
  playerId: number,
  positionId: 24 | 25 | 26 | 27,
  values: {
    minutes: number;
    appearances: number;
    starts: number;
    goals: number;
    assists: number;
    rating: number;
  },
) {
  return {
    id: playerId + 1_000_000,
    player_id: playerId,
    team_id: 2_846,
    season_id: 26_027,
    has_values: true,
    position_id: positionId,
    details: [
      detail(119, values.minutes),
      detail(321, values.appearances),
      detail(322, values.starts),
      detail(52, values.goals),
      detail(79, values.assists),
      detail(118, values.rating, "average"),
    ],
  };
}

describe("preseason player rating algorithm", () => {
  it("uses position-relative performance and shrinks low-minute samples toward 6.0", () => {
    const candidates: RatingCandidate[] = [
      { externalPlayerId: "1", position: "FWD" },
      { externalPlayerId: "2", position: "FWD" },
      { externalPlayerId: "3", position: "FWD" },
    ];
    const values = new Map<string, PlayerSeasonStatistics>([
      [
        "1",
        stats(candidates[0], {
          appearances: 20,
          starts: 20,
          minutes: 1_800,
          goals: 20,
          assists: 10,
          providerRatingWeighted: 8 * 1_800,
          providerRatingMinutes: 1_800,
        }),
      ],
      [
        "2",
        stats(candidates[1], {
          appearances: 20,
          starts: 20,
          minutes: 1_800,
          yellowCards: 5,
          providerRatingWeighted: 5 * 1_800,
          providerRatingMinutes: 1_800,
        }),
      ],
    ]);

    const ratings = calculatePreseasonRatings(candidates, values);
    expect(ratings.map((rating) => rating.rating)).toEqual([10, 5.5, 6]);
    expect(ratings[0]).toMatchObject({
      fantasyEquivalentPoints: 150,
      pointsPer90: 7.5,
      confidence: 1,
      providerRating: 8,
      algorithmVersion: "botolago-preseason-rating-v1",
    });
    expect(ratings[1].fantasyEquivalentPoints).toBe(35);
    expect(ratings[2]).toMatchObject({ minutes: 0, confidence: 0, rating: 6 });
  });

  it("uses the approved position-specific goal and clean-sheet values", () => {
    const candidates: RatingCandidate[] = [
      { externalPlayerId: "10", position: "GK" },
      { externalPlayerId: "11", position: "DEF" },
      { externalPlayerId: "12", position: "MID" },
      { externalPlayerId: "13", position: "FWD" },
    ];
    const values = new Map(
      candidates.map((candidate) => [
        candidate.externalPlayerId,
        stats(candidate, {
          appearances: 1,
          starts: 1,
          minutes: 90,
          goals: 1,
          cleanSheets: 1,
          saves: candidate.position === "GK" ? 3 : 0,
        }),
      ]),
    );
    const ratings = calculatePreseasonRatings(candidates, values);
    expect(ratings.map((rating) => rating.fantasyEquivalentPoints)).toEqual([17, 12, 8, 6]);
  });

  it("assigns identical ratings to players tied on every last-season metric", () => {
    const candidates: RatingCandidate[] = [
      { externalPlayerId: "20", position: "MID" },
      { externalPlayerId: "21", position: "MID" },
      { externalPlayerId: "22", position: "MID" },
    ];
    const values = new Map(
      candidates.map((candidate) => [
        candidate.externalPlayerId,
        stats(candidate, {
          appearances: 20,
          starts: 20,
          minutes: 1_800,
          goals: 5,
          assists: 5,
          providerRatingWeighted: 7 * 1_800,
          providerRatingMinutes: 1_800,
        }),
      ]),
    );

    const ratings = calculatePreseasonRatings(candidates, values);
    expect(ratings.map((rating) => rating.rating)).toEqual([7, 7, 7]);
  });
});

describe("SportsMonks player rating runtime", () => {
  it("loads the bounded season endpoint, rates every canonical candidate, and persists batches", async () => {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const candidates = [
      { externalPlayerId: "101", position: "FWD" },
      { externalPlayerId: "102", position: "FWD" },
      { externalPlayerId: "103", position: "FWD" },
    ];
    const client: RatingsRpcClient = {
      schema: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          if (name === "begin_football_ingestion") {
            return {
              data: "11111111-1111-4111-8111-111111111111",
              error: null,
            };
          }
          if (name === "football_player_rating_candidates") {
            return { data: candidates, error: null };
          }
          if (name === "ingest_player_season_ratings") {
            const rows = args.p_rows as unknown[];
            return {
              data: { inserted: rows.length, updated: 0, skipped: 0 },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    };
    let fetched = 0;
    const result = await handleSportsMonksPlayerRatingsRequest(request(), {
      environment: environment(),
      client,
      now: () => NOW,
      fetch: async (input, init) => {
        fetched += 1;
        const url = new URL(input instanceof Request ? input.url : input.toString());
        expect(url.pathname).toBe("/v3/football/statistics/seasons/players/26027");
        expect(url.searchParams.get("include")).toBe("details");
        expect(url.searchParams.get("per_page")).toBe("50");
        expect(url.href).not.toContain(TOKEN);
        expect(new Headers(init?.headers).get("Authorization")).toBe(TOKEN);
        return response({
          data: [
            providerRow(101, 27, {
              minutes: 1_800,
              appearances: 20,
              starts: 20,
              goals: 15,
              assists: 8,
              rating: 8,
            }),
            providerRow(102, 27, {
              minutes: 1_800,
              appearances: 20,
              starts: 20,
              goals: 0,
              assists: 0,
              rating: 5,
            }),
            {
              id: 1_000_103,
              player_id: 103,
              team_id: 2_846,
              season_id: 26_027,
              has_values: false,
              position_id: 27,
            },
          ],
          pagination: { has_more: false },
        });
      },
    });

    expect(result.status).toBe(200);
    expect(await result.json()).toEqual({
      provider: "sportsmonks",
      seasonId: 26_027,
      algorithmVersion: "botolago-preseason-rating-v1",
      candidates: 3,
      ratingRange: { minimum: 5.5, maximum: 10 },
      counters: {
        fetched: 3,
        validated: 3,
        inserted: 3,
        updated: 0,
        skipped: 0,
        rejected: 0,
        retries: 0,
      },
    });
    expect(fetched).toBe(1);
    const persisted = calls.find((call) => call.name === "ingest_player_season_ratings");
    expect(persisted?.args.p_rows).toMatchObject([
      {
        externalPlayerId: "101",
        rating: 10,
        algorithmVersion: "botolago-preseason-rating-v1",
      },
      {
        externalPlayerId: "102",
        rating: 5.5,
        algorithmVersion: "botolago-preseason-rating-v1",
      },
      { externalPlayerId: "103", rating: 6, confidence: 0 },
    ]);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: {
        p_status: "succeeded",
        p_records_validated: 3,
        p_records_inserted: 3,
      },
    });
  });

  it("rejects a wrong trigger before provider or database work", async () => {
    let fetched = false;
    const calls: Array<unknown> = [];
    const client: RatingsRpcClient = {
      schema: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          return { data: null, error: null };
        },
      }),
    };
    const result = await handleSportsMonksPlayerRatingsRequest(request("wrong"), {
      environment: environment(),
      client,
      fetch: async () => {
        fetched = true;
        return response({});
      },
    });
    expect(result.status).toBe(401);
    expect(fetched).toBe(false);
    expect(calls).toHaveLength(0);
  });
});

describe("SportsMonks player rating statistics coverage guard", () => {
  function harness(candidates: readonly RatingCandidate[], providerData: readonly unknown[]) {
    const calls: Array<{ name: string; args: Record<string, unknown> }> = [];
    const client: RatingsRpcClient = {
      schema: () => ({
        rpc: async (name, args) => {
          calls.push({ name, args });
          if (name === "begin_football_ingestion") {
            return { data: "22222222-2222-4222-8222-222222222222", error: null };
          }
          if (name === "football_player_rating_candidates") {
            return { data: candidates, error: null };
          }
          if (name === "ingest_player_season_ratings") {
            const rows = args.p_rows as unknown[];
            return { data: { inserted: rows.length, updated: 0, skipped: 0 }, error: null };
          }
          return { data: null, error: null };
        },
      }),
    };
    return {
      calls,
      run: () =>
        handleSportsMonksPlayerRatingsRequest(request(), {
          environment: environment(),
          client,
          now: () => NOW,
          fetch: async () => response({ data: providerData, pagination: { has_more: false } }),
        }),
    };
  }

  const fourForwards: RatingCandidate[] = [
    { externalPlayerId: "201", position: "FWD" },
    { externalPlayerId: "202", position: "FWD" },
    { externalPlayerId: "203", position: "FWD" },
    { externalPlayerId: "204", position: "FWD" },
  ];

  const played = {
    minutes: 1_800,
    appearances: 20,
    starts: 20,
    goals: 10,
    assists: 5,
    rating: 7,
  } as const;

  it("documents a coverage floor of half the candidate set", () => {
    expect(MIN_STATISTICS_COVERAGE).toBe(0.5);
    expect(PLAYER_STATISTICS_UNAVAILABLE).toBe("player_statistics_unavailable");
    expect(PLAYER_STATISTICS_COVERAGE_INSUFFICIENT).toBe("player_statistics_coverage_insufficient");
  });

  it("fails the run and persists nothing when the provider returns zero statistics", async () => {
    const { calls, run } = harness(fourForwards, []);
    const result = await run();

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: PLAYER_STATISTICS_UNAVAILABLE });
    expect(calls.some((call) => call.name === "ingest_player_season_ratings")).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: {
        p_status: "failed",
        p_error_code: PLAYER_STATISTICS_UNAVAILABLE,
        p_records_fetched: 0,
        p_records_inserted: 0,
        p_records_validated: 0,
      },
    });
  });

  it("fails the run and persists nothing when coverage is below the minimum share", async () => {
    const { calls, run } = harness(fourForwards, [providerRow(201, 27, played)]);
    const result = await run();

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: PLAYER_STATISTICS_COVERAGE_INSUFFICIENT });
    expect(calls.some((call) => call.name === "ingest_player_season_ratings")).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: {
        p_status: "failed",
        p_error_code: PLAYER_STATISTICS_COVERAGE_INSUFFICIENT,
        p_records_fetched: 1,
        p_records_inserted: 0,
      },
    });
  });

  it("fails the run and persists nothing when every record is flagged has_values=false", async () => {
    const { calls, run } = harness(
      fourForwards,
      fourForwards.map((candidate) => ({
        id: Number(candidate.externalPlayerId) + 1_000_000,
        player_id: Number(candidate.externalPlayerId),
        team_id: 2_846,
        season_id: 26_027,
        has_values: false,
        position_id: 27,
        details: [],
      })),
    );
    const result = await run();

    expect(result.status).toBe(503);
    expect(await result.json()).toEqual({ error: PLAYER_STATISTICS_COVERAGE_INSUFFICIENT });
    expect(calls.some((call) => call.name === "ingest_player_season_ratings")).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: {
        p_status: "failed",
        p_error_code: PLAYER_STATISTICS_COVERAGE_INSUFFICIENT,
        p_records_fetched: 4,
        p_records_inserted: 0,
        p_records_rejected: 0,
      },
    });
  });

  it("persists the unchanged ratings when coverage reaches the minimum share", async () => {
    const { calls, run } = harness(fourForwards, [
      providerRow(201, 27, played),
      providerRow(202, 27, { ...played, goals: 0, assists: 0, rating: 5 }),
    ]);
    const result = await run();

    expect(result.status).toBe(200);
    const body = (await result.json()) as { counters: Record<string, number> };
    expect(body.counters).toMatchObject({ fetched: 2, validated: 4, inserted: 4, rejected: 0 });

    const persisted = calls.find((call) => call.name === "ingest_player_season_ratings");
    expect(persisted?.args.p_rows).toMatchObject([
      { externalPlayerId: "201", rating: 10, confidence: 1 },
      { externalPlayerId: "202", rating: 6, confidence: 1 },
      { externalPlayerId: "203", rating: 6, confidence: 0 },
      { externalPlayerId: "204", rating: 6, confidence: 0 },
    ]);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: { p_status: "succeeded", p_error_code: null },
    });
  });
});
