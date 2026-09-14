import { describe, expect, test } from "bun:test";
import { handleSportsMonksCatalogRequest, type CatalogRpcClient } from "./sportsmonks-catalog";

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

function rpcClient(
  calls: RpcCall[],
  uploads: string[] = [],
  ingestError?: { readonly message: string; readonly code: string },
  errorEntityType = "team",
): CatalogRpcClient {
  let run = 0;
  return {
    storage: {
      from(bucket) {
        expect(bucket).toBe("football-media");
        return {
          async upload(path, body, options) {
            uploads.push(path);
            expect(body.byteLength).toBeGreaterThan(0);
            expect(options).toMatchObject({
              contentType: "image/png",
              cacheControl: "86400",
              upsert: true,
            });
            return { data: { path }, error: null };
          },
        };
      },
    },
    schema(name) {
      expect(name).toBe("api");
      return {
        async rpc(rpcName, args) {
          calls.push({ name: rpcName, args });
          if (rpcName === "begin_football_ingestion") return { data: `run-${++run}`, error: null };
          if (rpcName === "ingest_football_catalog_entity") {
            if (args.p_entity_type === errorEntityType && ingestError) {
              return { data: null, error: ingestError };
            }
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
  return async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const url = String(input);
    const parsed = new URL(url);
    const pathname = parsed.pathname;
    urls.push(url);
    expect(url).not.toContain(environment.SPORTSMONKS_API_TOKEN);
    const authorization = new Headers(init?.headers).get("authorization");
    if (parsed.origin === "https://api.sportmonks.com") {
      expect(authorization).toBe(environment.SPORTSMONKS_API_TOKEN);
    } else {
      expect(authorization).toBeNull();
    }
    if (url.includes("/leagues/860")) {
      return Response.json({
        data: { id: 860, name: "Botola Pro", short_code: "BPL" },
      });
    }
    if (url.includes("/rounds/seasons/28647")) return Response.json({ data: [] });
    if (pathname === "/v3/football/seasons/28647") {
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
    if (url.includes("/teams/seasons/28647")) {
      return Response.json({
        data: [
          {
            id: 1001,
            name: "Raja Club Athletic",
            short_code: "RCA",
            image_path: "https://cdn.sportmonks.com/images/soccer/teams/1001.png",
          },
        ],
        pagination: { has_more: false },
      });
    }
    if (url === "https://cdn.sportmonks.com/images/soccer/teams/1001.png") {
      return new Response(new Uint8Array([137, 80, 78, 71]), {
        headers: { "content-type": "image/png", "content-length": "4" },
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
    const uploads: string[] = [];
    const response = await handleSportsMonksCatalogRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "catalog", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls, uploads),
        fetch: providerFetch(urls),
        now: () => new Date("2026-07-31T15:00:00.000Z"),
      },
    );

    expect(response.status).toBe(200);
    expect(urls).toHaveLength(5);
    expect(uploads).toEqual(["football/teams/1001/crest.png"]);
    expect(calls.some((call) => call.name === "attach_football_team_crest")).toBe(true);
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

  test("keeps stale team metadata protected while independently storing its crest", async () => {
    const calls: RpcCall[] = [];
    const urls: string[] = [];
    const uploads: string[] = [];
    const response = await handleSportsMonksCatalogRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "teams", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls, uploads, { message: "STALE_UPDATE", code: "P0001" }),
        fetch: providerFetch(urls),
        now: () => new Date("2026-07-31T15:00:00.000Z"),
      },
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      jobs: { teams: { validated: 1, skipped: 1, rejected: 0 } },
    });
    expect(uploads).toEqual(["football/teams/1001/crest.png"]);
    expect(calls.some((call) => call.name === "attach_football_team_crest")).toBe(true);
    expect(calls.some((call) => call.name === "record_football_ingestion_rejection")).toBe(false);
  });

  test.each([
    ["competition", "competitions"],
    ["season", "seasons"],
    ["round", "rounds"],
  ])(
    "preserves stale %s metadata and continues the catalog dependency chain",
    async (entity, job) => {
      const calls: RpcCall[] = [];
      const sourceUpdatedAt = "2026-07-05T17:00:00.000Z";
      const fetchProvider = providerFetch([]);
      const response = await handleSportsMonksCatalogRequest(
        new Request("https://example.test/football-ingest", {
          method: "POST",
          headers: {
            "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
          },
          body: JSON.stringify({ job: "catalog", pageSize: 50, maxPages: 1 }),
        }),
        {
          environment,
          client: rpcClient(calls, [], { message: "STALE_UPDATE", code: "P0001" }, entity),
          fetch: async (input, init) => {
            if (String(input).includes("/rounds/seasons/28647")) {
              return Response.json({
                data: [{ id: 301, season_id: 28647, name: "1", last_played_at: sourceUpdatedAt }],
              });
            }
            const providerResponse = await fetchProvider(input, init);
            if (!String(input).includes("/teams/") && providerResponse.ok) {
              const body = await providerResponse.json();
              body.data.last_played_at = sourceUpdatedAt;
              return Response.json(body);
            }
            return providerResponse;
          },
          now: () => new Date("2026-09-14T19:09:00.000Z"),
        },
      );

      expect(response.status).toBe(200);
      expect(await response.json()).toMatchObject({
        jobs: { [job]: { validated: 1, skipped: 1, rejected: 0 } },
      });
      const ingests = calls.filter((call) => call.name === "ingest_football_catalog_entity");
      expect(ingests.map((call) => call.args.p_entity_type)).toEqual([
        "competition",
        "season",
        "round",
        "team",
      ]);
      expect(
        ingests.find((call) => call.args.p_entity_type === entity)?.args.p_entity,
      ).toMatchObject({
        freshness: { updatedAt: sourceUpdatedAt, sourceSequence: Date.parse(sourceUpdatedAt) },
      });
      expect(calls.filter((call) => call.name === "complete_football_ingestion")).toHaveLength(4);
      expect(calls.some((call) => call.name === "record_football_ingestion_rejection")).toBe(false);
    },
  );

  test("records only sanitized RPC and SQLSTATE diagnostics for database failures", async () => {
    const calls: RpcCall[] = [];
    const response = await handleSportsMonksCatalogRequest(
      new Request("https://example.test/football-ingest", {
        method: "POST",
        headers: {
          "x-botolago-ingestion-key": environment.FOOTBALL_INGESTION_TRIGGER_SECRET,
        },
        body: JSON.stringify({ job: "teams", pageSize: 50, maxPages: 1 }),
      }),
      {
        environment,
        client: rpcClient(calls, [], {
          message: "sensitive database detail must not escape",
          code: "23514",
        }),
        fetch: providerFetch([]),
      },
    );

    expect(response.status).toBe(502);
    expect(await response.text()).not.toContain("sensitive database detail");
    expect(calls.find((call) => call.name === "record_football_ingestion_rejection")).toMatchObject(
      {
        args: {
          p_error_code: "database_unavailable",
          p_validation_issues: [
            {
              code: "database_unavailable",
              rpc_name: "ingest_football_catalog_entity",
              sqlstate: "23514",
            },
          ],
        },
      },
    );
  });
});
