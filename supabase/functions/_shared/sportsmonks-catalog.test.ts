import { describe, expect, test } from "bun:test";
import {
  handleSportsMonksCatalogRequest,
  type CatalogRpcClient,
} from "./sportsmonks-catalog";

const environment = {
  FOOTBALL_INGESTION_TRIGGER_SECRET: "0123456789abcdef0123456789abcdef",
  FOOTBALL_PROVIDER: "sportsmonks",
  FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
  SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-not-a-real-secret",
  FOOTBALL_SPORTSMONKS_LEAGUE_ID: "860",
  FOOTBALL_SPORTSMONKS_SEASON_ID: "28647",
  FOOTBALL_SPORTSMONKS_COUNTRY_CODE: "MA",
  FOOTBALL_SPORTSMONKS_COMPETITION_TYPE: "league",
  FOOTBALL_SPORTSMONKS_SEASON_START: "2026-09-12",
  FOOTBALL_SPORTSMONKS_SEASON_END: "2027-07-05",
  FOOTBALL_PROVIDER_TIMEOUT_MS: "1000",
  FOOTBALL_PROVIDER_MAX_RETRIES: "0",
} as const;

interface RpcCall {
  readonly name: string;
  readonly args: Record<string, unknown>;
}

function rpcClient(calls: RpcCall[]): CatalogRpcClient {
  let run = 0;
  return {
    schema(name) {
      expect(name).toBe("api");
      return {
        async rpc(rpcName, args) {
          calls.push({ name: rpcName, args });
          if (rpcName === "begin_football_ingestion")
            return { data: `run-${++run}`, error: null };
          if (rpcName === "ingest_football_catalog_entity") {
            return {
              data: { id: `id-${args.p_external_id}`, outcome: "inserted" },
              error: null,
            };
          }
          return { data: null, error: null };
        },
      };
    },
  };
}

function providerFetch(urls: string[]) {
  return async (
    input: string | URL | Request,
    init?: RequestInit,
  ): Promise<Response> => {
    const url = String(input);
    urls.push(url);
    expect(url).not.toContain(environment.SPORTSMONKS_API_TOKEN);
    expect(new Headers(init?.headers).get("authorization")).toBe(
      environment.SPORTSMONKS_API_TOKEN,
    );
    if (url.includes("/leagues/860")) {
      return Response.json({
        data: { id: 860, name: "Botola Pro", short_code: "BPL" },
      });
    }
    if (url.includes("/seasons/28647")) {
      return Response.json({
        data: {
          id: 28647,
          league_id: 860,
          name: "2026/2027",
          is_current: true,
          starting_at: "2026-09-12",
          ending_at: "2027-07-05",
        },
      });
    }
    if (url.includes("/rounds/seasons/28647"))
      return Response.json({ data: [] });
    if (url.includes("/teams/seasons/28647")) {
      return Response.json({
        data: [{ id: 1001, name: "Raja Club Athletic", short_code: "RCA" }],
        pagination: { has_more: false },
      });
    }
    return new Response(null, { status: 404 });
  };
}

describe("protected SportsMonks catalog function", () => {
  test("rejects a request before provider or database access when the second secret is absent", async () => {
    const calls: RpcCall[] = [];
    let fetched = false;
    const response = await handleSportsMonksCatalogRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        body: JSON.stringify({ job: "catalog" }),
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

  test("ingests the catalog dependency chain in order with bounded provider requests", async () => {
    const calls: RpcCall[] = [];
    const urls: string[] = [];
    const response = await handleSportsMonksCatalogRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key":
            environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "catalog", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls),
        fetch: providerFetch(urls),
        now: () => new Date("2026-07-31T15:00:00.000Z"),
      },
    );

    expect(response.status).toBe(200);
    expect(urls).toHaveLength(4);
    expect(
      calls
        .filter((call) => call.name === "begin_football_ingestion")
        .map((call) => call.args.p_job_type),
    ).toEqual(["competitions", "seasons", "rounds", "teams"]);
    expect(
      calls
        .filter((call) => call.name === "ingest_football_catalog_entity")
        .map((call) => call.args.p_entity_type),
    ).toEqual(["competition", "season", "team"]);
    const serialized = await response.text();
    expect(serialized).not.toContain(environment.SPORTSMONKS_API_TOKEN);
    expect(JSON.parse(serialized)).toMatchObject({ provider: "sportsmonks" });
  });
});
