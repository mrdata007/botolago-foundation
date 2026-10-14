import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import {
  handleFootballLiveRefreshRequest,
  type LiveRefreshRpcClient,
} from "./football-live-refresh.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID } from "./sofascore-fixtures.ts";

// The data-source switch on the live path, end to end through the handler with
// RAPIDAPI_KEY set: `sofascore` calls SofaScore and writes, `shadow` calls
// SofaScore and writes nothing, `sportsmonks` calls SportsMonks and never
// SofaScore. Also: every SofaScore request is counted, and counting never fails
// the refresh. Synthetic ids; the incidents reply is a committed fixture.
const TOKEN = "b".repeat(64);
const SEASON = 102220;
const START = 1_790_000_000;
const NOW = new Date((START + 3600) * 1000);
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const incidents = JSON.parse(
  readFileSync(
    new URL("../../../tests/fixtures/providers/sofascore/17132481.incidents.json", import.meta.url),
    "utf8",
  ),
);

const environment = {
  BOTOLAGO_SCHEDULER_TOKEN: TOKEN,
  SPORTSMONKS_API_TOKEN: "sportsmonks-test-token-0123456789",
  RAPIDAPI_KEY: "test-key",
  SOFASCORE_FANTASY_ENABLED: "false",
};

const liveEvent = {
  id: 1,
  startTimestamp: START,
  status: { code: 6, type: "inprogress", description: "1st half" },
  roundInfo: { round: 4 },
  tournament: { id: 1, uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
  season: { id: SEASON },
  homeTeam: { id: 101 },
  awayTeam: { id: 102 },
  changes: { changeTimestamp: START + 3560 },
  homeScore: { current: 1 },
  awayScore: { current: 0 },
};

const mappingRow = (entity_type: string, external_id: string, internal_entity_id: string) => ({
  provider_name: "sofascore",
  entity_type,
  external_id,
  internal_entity_id,
  active: true,
});
const snapshot = {
  mappings: [
    mappingRow("competition", "937", uuid("c", 1)),
    mappingRow("season", String(SEASON), uuid("5", 1)),
    mappingRow("round", `${SEASON}:4`, uuid("a", 4)),
    mappingRow("team", "101", uuid("7", 101)),
    mappingRow("team", "102", uuid("7", 102)),
    mappingRow("fixture", "1", uuid("f", 1)),
  ],
  fixtures: [
    {
      id: uuid("f", 1),
      externalId: "1",
      kickoffAt: new Date(START * 1000).toISOString(),
      status: "live_first_half",
      period: "first_half",
      homeScore: 0,
      awayScore: 0,
      providerUpdatedAt: new Date((START + 100) * 1000).toISOString(),
      sourceSequence: (START + 100) * 1000,
      finalizedAt: null,
      homeTeamId: uuid("7", 101),
      awayTeamId: uuid("7", 102),
    },
  ],
};

function database(
  source: string,
  options: { countFails?: "error" | "throw" } = {},
): { client: LiveRefreshRpcClient; calls: { name: string; args: Record<string, unknown> }[] } {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          if (name === "service_record_rapidapi_calls" && options.countFails === "throw") {
            return Promise.reject(new Error("down"));
          }
          if (name === "service_record_rapidapi_calls" && options.countFails === "error") {
            return Promise.resolve({ data: null, error: { message: "function does not exist" } });
          }
          const data: Record<string, unknown> = {
            football_data_source: source,
            football_sofascore_live_snapshot: snapshot,
            begin_football_ingestion: uuid("9", 1),
            ingest_football_fixture: uuid("f", 1),
            ingest_football_match_details: { outcome: "stored", events: 1 },
            service_record_rapidapi_calls: 3,
          };
          return Promise.resolve({ data: data[name] ?? null, error: null });
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls };
}

async function run(source: string, options: { countFails?: "error" | "throw" } = {}) {
  const db = database(source, options);
  const urls: URL[] = [];
  const response = await handleFootballLiveRefreshRequest(
    new Request("https://functions.example/football-live-refresh", {
      method: "POST",
      headers: { "content-type": "application/json", "x-botolago-scheduler-token": TOKEN },
      body: '{"job":"fixtures"}',
    }),
    {
      environment,
      now: () => NOW,
      client: db.client,
      fetch: async (input) => {
        const url = new URL(String(input));
        urls.push(url);
        const headers = {
          "x-ratelimit-requests-limit": "10000",
          "x-ratelimit-requests-remaining": "5000",
        };
        if (url.hostname === "sofascore.p.rapidapi.com") {
          if (url.pathname === "/matches/get-incidents")
            return Response.json(incidents, { headers });
          return Response.json({ events: [liveEvent] }, { headers });
        }
        return Response.json({ data: [], pagination: { has_more: false } });
      },
    },
  );
  return { response, db, urls };
}
const names = (db: ReturnType<typeof database>) => db.calls.map((call) => call.name);
const sofascoreUrls = (urls: URL[]) =>
  urls.filter((u) => u.hostname === "sofascore.p.rapidapi.com");

describe("live path by data source", () => {
  test("sofascore calls SofaScore only, and writes the score and the incidents", async () => {
    const { response, db, urls } = await run("sofascore");
    expect(response.status).toBe(200);
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.hostname === "sofascore.p.rapidapi.com")).toBe(true);
    expect(names(db)).toContain("ingest_football_fixture");
    expect(names(db)).toContain("ingest_football_match_details");
  });

  test("shadow calls SofaScore only, logs, and writes no fixture and no details", async () => {
    const { response, db, urls } = await run("shadow");
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "shadow", written: 0 });
    expect(urls.length).toBeGreaterThan(0);
    expect(urls.every((u) => u.hostname === "sofascore.p.rapidapi.com")).toBe(true);
    expect(names(db)).not.toContain("ingest_football_fixture");
    expect(names(db)).not.toContain("ingest_football_match_details");
    expect(names(db)).not.toContain("begin_football_ingestion");
  });

  test("sportsmonks calls SportsMonks only: SofaScore is never called and nothing is counted", async () => {
    const { response, db, urls } = await run("sportsmonks");
    expect(response.status).toBe(200);
    expect(sofascoreUrls(urls)).toEqual([]);
    expect(urls.every((u) => u.hostname.includes("sportmonks"))).toBe(true);
    expect(names(db)).not.toContain("service_record_rapidapi_calls");
  });
});

describe("RapidAPI call counting through the handler", () => {
  test("every SofaScore request is counted once, by job, endpoint (no query) and status", async () => {
    for (const source of ["sofascore", "shadow"]) {
      const { db, urls } = await run(source);
      const counted = db.calls.filter((call) => call.name === "service_record_rapidapi_calls");
      expect(counted).toHaveLength(1);
      const { p_job, p_calls } = counted[0].args as {
        p_job: string;
        p_calls: { endpoint: string; status: number; calls: number }[];
      };
      expect(p_job).toBe("fixtures");
      expect(p_calls.reduce((n, item) => n + item.calls, 0)).toBe(sofascoreUrls(urls).length);
      expect(p_calls.map((item) => item.endpoint).sort()).toEqual([
        "matches/get-incidents",
        "tournaments/get-live-events",
      ]);
      expect(p_calls.every((item) => item.status === 200)).toBe(true);
      expect(JSON.stringify(p_calls)).not.toContain("?");
      expect(JSON.stringify(p_calls)).not.toContain("test-key");
    }
  });

  test("the count is written after the scores, never before the refresh's own work", async () => {
    const { db } = await run("sofascore");
    const order = names(db);
    expect(order.indexOf("service_record_rapidapi_calls")).toBeGreaterThan(
      order.lastIndexOf("ingest_football_match_details"),
    );
  });

  test("a counting failure (error or throw) never fails the refresh", async () => {
    for (const countFails of ["error", "throw"] as const) {
      const { response, db } = await run("sofascore", { countFails });
      expect(response.status).toBe(200);
      expect(names(db)).toContain("ingest_football_fixture");
      expect(names(db)).toContain("service_record_rapidapi_calls");
    }
  });
});
