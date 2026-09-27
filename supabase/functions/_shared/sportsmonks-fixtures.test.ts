import { describe, expect, test } from "bun:test";
import { handleSportsMonksFixtureRequest, type FixtureRpcClient } from "./sportsmonks-fixtures";

const environment = {
  FOOTBALL_INGESTION_TRIGGER_SECRET: "0123456789abcdef0123456789abcdef",
  FOOTBALL_PROVIDER: "sportsmonks",
  FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
  SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-not-a-real-secret",
  FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
  FOOTBALL_SPORTSMONKS_SEASON_ID: "26027",
  FOOTBALL_SPORTSMONKS_FIXTURE_FROM: "2026-03-28",
  FOOTBALL_SPORTSMONKS_FIXTURE_TO: "2026-07-05",
  FOOTBALL_PROVIDER_TIMEOUT_MS: "1000",
  FOOTBALL_PROVIDER_MAX_RETRIES: "0",
} as const;

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

const ids: Record<string, string> = {
  "competition:860": "10000000-0000-4000-8000-000000000001",
  "season:26027": "20000000-0000-4000-8000-000000000001",
  "round:9001": "30000000-0000-4000-8000-000000000001",
  "team:1001": "40000000-0000-4000-8000-000000000001",
  "team:1002": "40000000-0000-4000-8000-000000000002",
};

function rpcClient(calls: RpcCall[]): FixtureRpcClient {
  return {
    schema(name) {
      expect(name).toBe("api");
      return {
        async rpc(rpcName, args) {
          calls.push({ name: rpcName, args });
          if (rpcName === "begin_football_ingestion") {
            return {
              data: "50000000-0000-4000-8000-000000000001",
              error: null,
            };
          }
          if (rpcName === "resolve_football_mapping") {
            const key = `${args.p_entity_type}:${args.p_external_id}`;
            const value = ids[key];
            return value
              ? { data: value, error: null }
              : {
                  data: null,
                  error: { code: "P0002", message: "MAPPING_NOT_FOUND" },
                };
          }
          if (rpcName === "ingest_football_fixture") {
            return {
              data: "60000000-0000-4000-8000-000000000001",
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
    },
  };
}

function finishedFixture(overrides: Record<string, unknown> = {}) {
  return {
    id: 7001,
    league_id: 860,
    season_id: 26027,
    round_id: 9001,
    starting_at: "2026-04-01 20:00:00",
    last_processed_at: "2026-04-01 22:00:00",
    state: { developer_name: "FT" },
    participants: [
      { id: 1001, meta: { location: "home" } },
      { id: 1002, meta: { location: "away" } },
    ],
    scores: [
      { description: "CURRENT", score: { goals: 2, participant: "home" } },
      { description: "CURRENT", score: { goals: 1, participant: "away" } },
    ],
    ...overrides,
  };
}

describe("protected SportsMonks fixture function", () => {
  test("rejects a request before provider or database access without the second secret", async () => {
    const calls: RpcCall[] = [];
    let fetched = false;
    const response = await handleSportsMonksFixtureRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        body: JSON.stringify({ job: "fixtures" }),
      }),
      {
        environment,
        client: rpcClient(calls),
        fetch: async () => {
          fetched = true;
          return new Response(null, { status: 500 });
        },
      },
    );
    expect(response.status).toBe(401);
    expect(calls).toHaveLength(0);
    expect(fetched).toBe(false);
  });

  test("refuses a skipUncatalogued that is not true or false, before any access", async () => {
    const calls: RpcCall[] = [];
    let fetched = false;
    const response = await handleSportsMonksFixtureRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: { "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET },
        body: JSON.stringify({ job: "fixtures", skipUncatalogued: "yes" }),
      }),
      {
        environment,
        client: rpcClient(calls),
        fetch: async () => {
          fetched = true;
          return new Response(null, { status: 500 });
        },
      },
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "invalid_request" });
    expect(calls).toHaveLength(0);
    expect(fetched).toBe(false);
  });

  test("normalizes and persists a bounded historical fixture page", async () => {
    const calls: RpcCall[] = [];
    const urls: string[] = [];
    const response = await handleSportsMonksFixtureRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "fixtures", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls),
        now: () => new Date("2026-07-31T18:00:00.000Z"),
        fetch: async (input, init) => {
          const url = String(input);
          urls.push(url);
          expect(url).not.toContain(environment.SPORTSMONKS_API_TOKEN);
          expect(url).toContain("/fixtures/between/2026-03-28/2026-07-05");
          expect(url).toContain("filters=fixtureLeagues%3A860");
          expect(url).toContain("include=participants%3Bstate%3Bscores");
          expect(new Headers(init?.headers).get("authorization")).toBe(
            environment.SPORTSMONKS_API_TOKEN,
          );
          return Response.json({
            data: [finishedFixture()],
            pagination: { has_more: false },
          });
        },
      },
    );

    expect(response.status).toBe(200);
    expect(urls).toHaveLength(1);
    const body = await response.json();
    expect(body).toMatchObject({
      provider: "sportsmonks",
      window: { from: "2026-03-28", to: "2026-07-05" },
      jobs: {
        fixtures: { fetched: 1, validated: 1, inserted: 1, rejected: 0 },
      },
    });
    const ingest = calls.find((call) => call.name === "ingest_football_fixture");
    expect(ingest?.args.p_fixture).toMatchObject({
      kickoffAt: "2026-04-01T20:00:00.000Z",
      status: "finished",
      period: "post_match",
      homeScore: 2,
      awayScore: 1,
      venueId: null,
      finalizedAt: "2026-07-31T18:00:00.000Z",
    });
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: { p_status: "succeeded", p_records_rejected: 0 },
    });
  });

  test("fails closed and journals a malformed participant set", async () => {
    const calls: RpcCall[] = [];
    const response = await handleSportsMonksFixtureRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "fixtures", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls),
        fetch: async () =>
          Response.json({
            data: [
              finishedFixture({
                participants: [
                  { id: 1001, meta: { location: "home" } },
                  { id: 1002, meta: { location: "home" } },
                ],
              }),
            ],
            pagination: { has_more: false },
          }),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.json()).toEqual({ error: "fixture_item_rejected" });
    expect(calls.some((call) => call.name === "record_football_ingestion_rejection")).toBe(true);
    expect(calls.some((call) => call.name === "ingest_football_fixture")).toBe(false);
    expect(calls.at(-1)).toMatchObject({
      name: "complete_football_ingestion",
      args: { p_status: "partial", p_records_rejected: 1 },
    });
  });
});

describe("fixture finalization", () => {
  const observedAt = "2026-04-01T22:05:00.000Z";

  /** Ingests one fixture in the given provider state and returns what was sent. */
  async function ingested(
    state: Record<string, unknown>,
    overrides: Record<string, unknown> = {},
  ): Promise<Record<string, unknown> | undefined> {
    const calls: RpcCall[] = [];
    const response = await handleSportsMonksFixtureRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "fixtures", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls),
        now: () => new Date(observedAt),
        fetch: async () =>
          Response.json({
            data: [finishedFixture({ state, ...overrides })],
            pagination: { has_more: false },
          }),
      },
    );
    expect(response.status).toBe(200);
    return calls.find((call) => call.name === "ingest_football_fixture")?.args.p_fixture as
      | Record<string, unknown>
      | undefined;
  }

  // Full time, after extra time, after penalties, matched on every field the
  // provider may carry the state in.
  test.each([
    [{ developer_name: "FT" }],
    [{ developer_name: "AET" }],
    [{ developer_name: "FT_PEN" }],
    [{ state: "FT" }],
    [{ name: "ft pen" }],
  ])("finalizes a match played to its end: %o", async (state) => {
    const fixture = await ingested(state);
    expect(fixture).toMatchObject({ status: "finished", finalizedAt: observedAt });
  });

  test.each([
    [{ developer_name: "NS" }],
    [{ developer_name: "INPLAY_1ST_HALF" }],
    [{ developer_name: "HT" }],
    [{ developer_name: "INPLAY_2ND_HALF" }],
    [{ developer_name: "INPLAY_ET" }],
    [{ developer_name: "INPLAY_PENALTIES" }],
    [{ developer_name: "POSTPONED" }],
    [{ developer_name: "SUSPENDED" }],
    [{ developer_name: "CANCELLED" }],
    [{ developer_name: "ABANDONED" }],
  ])("never finalizes a match that is not over: %o", async (state) => {
    const fixture = await ingested(state, { scores: [] });
    expect(fixture?.status).not.toBe("finished");
    expect(fixture?.finalizedAt).toBeNull();
  });

  // Recorded as finished, but either nobody played the match out (walkover,
  // awarded) or the statistics ingester would refuse it (legacy `FTP`), so
  // whether it counts for Fantasy is an operator decision.
  test.each([
    [{ developer_name: "WO" }],
    [{ developer_name: "AWARDED" }],
    [{ developer_name: "FTP" }],
  ])(
    "does not finalize a finished state the statistics ingester cannot score: %o",
    async (state) => {
      const fixture = await ingested(state);
      expect(fixture).toMatchObject({ status: "finished", finalizedAt: null });
    },
  );

  test("does not finalize a final state reported before its own kickoff", async () => {
    const fixture = await ingested(
      { developer_name: "FT" },
      { starting_at: "2026-04-02 20:00:00", last_processed_at: "2026-04-01 22:00:00" },
    );
    expect(fixture).toMatchObject({ status: "finished", finalizedAt: null });
  });

  // The adapter sends the observation time on every pass; the database keeps
  // the first one (tested in supabase/tests/database/fixture_finalization).
  test("sends a finalization time on every observation of a finished match", async () => {
    const first = await ingested({ developer_name: "FT" });
    const again = await ingested({ developer_name: "FT" });
    expect(first?.finalizedAt).toBe(observedAt);
    expect(again?.finalizedAt).toBe(observedAt);
  });
});
