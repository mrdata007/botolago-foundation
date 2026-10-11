import { describe, expect, test } from "bun:test";
import { handleFootballLiveRefreshRequest } from "./football-live-refresh.ts";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";
import { createRapidApiClient } from "./rapidapi-client.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID, SOFASCORE_LIVE_EVENTS_PATH } from "./sofascore-fixtures.ts";
import { runSofascoreRefresh, skipReason } from "./sofascore-live-refresh.ts";

// Synthetic ids and payloads only.
const SEASON = 102220;
const START = 1_790_000_000; // seconds
const KICKOFF = new Date(START * 1000);
const NOW = new Date((START + 3600) * 1000); // an hour after kickoff
const TOKEN = "b".repeat(64);

const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

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
    homeTeam: { id: home },
    awayTeam: { id: away },
    changes: { changeTimestamp: START + 3000 },
    homeScore: { current: 1 },
    awayScore: { current: 0 },
    ...extra,
  };
}
const LIVE = { code: 6, type: "inprogress" };
const FINISHED = { code: 100, type: "finished" };

function mappings(events: number[]) {
  const row = (entity_type: string, external_id: string, internal_entity_id: string) => ({
    provider_name: "sofascore",
    entity_type,
    external_id,
    internal_entity_id,
    active: true,
  });
  return [
    row("competition", "937", uuid("c", 1)),
    row("season", String(SEASON), uuid("5", 1)),
    row("round", `${SEASON}:4`, uuid("a", 4)),
    ...[101, 102, 103, 104].map((t) => row("team", String(t), uuid("7", t))),
    ...events.map((e) => row("fixture", String(e), uuid("f", e))),
  ];
}

function fixtureState(id: number, over: Record<string, unknown> = {}) {
  return {
    id: uuid("f", id),
    externalId: String(id),
    kickoffAt: KICKOFF.toISOString(),
    status: "live_first_half",
    period: "first_half",
    homeScore: 0,
    awayScore: 0,
    providerUpdatedAt: new Date((START + 100) * 1000).toISOString(),
    sourceSequence: (START + 100) * 1000,
    finalizedAt: null,
    ...over,
  };
}

interface FakeDb {
  client: LiveRefreshRpcClient;
  calls: { name: string; args: Record<string, unknown> }[];
}
function fakeDb(
  source: string,
  snapshot: { mappings: unknown[]; fixtures: unknown[] },
  ingestError: (externalId: string) => { code?: string; message: string } | null = () => null,
): FakeDb {
  const calls: FakeDb["calls"] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          switch (name) {
            case "football_data_source":
              return Promise.resolve({ data: source, error: null });
            case "football_sofascore_live_snapshot":
              return Promise.resolve({ data: snapshot, error: null });
            case "begin_football_ingestion":
              return Promise.resolve({ data: uuid("9", 1), error: null });
            case "complete_football_ingestion":
              return Promise.resolve({ data: null, error: null });
            case "ingest_football_fixture": {
              const error = ingestError(String(args.p_external_id));
              return Promise.resolve({ data: error ? null : uuid("f", 1), error });
            }
            default:
              return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
          }
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls };
}

/** Routes by path; records every path asked for. */
function fakeFetch(routes: Record<string, unknown>, remaining = 5000) {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    const key = Object.keys(routes).find((candidate) => path.startsWith(candidate));
    if (!key) return new Response("{}", { status: 404 });
    return Response.json(routes[key], {
      headers: {
        "x-ratelimit-requests-limit": "10000",
        "x-ratelimit-requests-remaining": String(remaining),
      },
    });
  };
  return { fetch, paths };
}

const rapid = (fetch: (input: string) => Promise<Response>, minRemaining?: number) =>
  createRapidApiClient(
    "sofascore",
    { RAPIDAPI_KEY: "k" },
    {
      fetch,
      maxRetries: 0,
      minRemaining,
    },
  );

function run(
  mode: "sofascore" | "shadow",
  job: "fixtures" | "season_fixtures",
  db: FakeDb,
  fetch: (input: string) => Promise<Response>,
  minRemaining?: number,
) {
  const lines: string[] = [];
  return runSofascoreRefresh({
    mode,
    job,
    client: db.client,
    rapid: rapid(fetch, minRemaining),
    environment: {},
    now: NOW,
    log: (line) => lines.push(line),
  }).then((outcome) => ({ outcome, lines }));
}

const ingests = (db: FakeDb) => db.calls.filter((c) => c.name === "ingest_football_fixture");

describe("sofascore live refresh", () => {
  test("shadow computes the writes, logs one JSON line and writes nothing", async () => {
    const db = fakeDb("shadow", { mappings: mappings([1]), fixtures: [fixtureState(1)] });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, 101, 102, LIVE)] },
    });
    const { outcome, lines } = await run("shadow", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(outcome.body).toMatchObject({ status: "shadow", wouldIngest: 1, written: 0 });
    expect(paths).toHaveLength(1);
    expect(db.calls.map((c) => c.name)).toEqual(["football_sofascore_live_snapshot"]);
    expect(lines).toHaveLength(1);
    const logged = JSON.parse(lines[0]);
    expect(logged.result).toBe("shadow");
    expect(logged.wouldIngest[0].p_external_id).toBe("1");
    expect(logged.requests[0].quotaRemaining).toBe(5000);
  });

  test("sofascore writes only mapped and changed fixtures", async () => {
    const db = fakeDb("sofascore", {
      mappings: mappings([1, 2]),
      fixtures: [
        fixtureState(1), // 0-0 in db, 1-0 at SofaScore: changed
        fixtureState(2, { homeScore: 1, awayScore: 0 }), // identical: unchanged
      ],
    });
    const { fetch } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: {
        events: [
          event(1, 101, 102, LIVE),
          event(2, 103, 104, LIVE),
          event(3, 101, 104, LIVE), // no fixture mapping
        ],
      },
    });
    const { outcome, lines } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    const sent = ingests(db);
    expect(sent).toHaveLength(1);
    expect(sent[0].args.p_provider_name).toBe("sofascore");
    expect(sent[0].args.p_external_id).toBe("1");
    expect(sent[0].args.p_fixture).toMatchObject({
      status: "live_first_half",
      homeScore: 1,
      awayScore: 0,
      finalizedAt: null,
    });
    expect(outcome.body).toMatchObject({ written: 1, unchanged: 1, unmapped: 1 });
    const logged = JSON.parse(lines[0]);
    expect(logged.unmapped).toEqual([{ sofascoreEventId: "3", missing: ["fixture"] }]);
    // the run is recorded so the ops health checks see a fixture refresh
    expect(db.calls.map((c) => c.name)).toEqual([
      "football_sofascore_live_snapshot",
      "begin_football_ingestion",
      "ingest_football_fixture",
      "complete_football_ingestion",
    ]);
  });

  test("a mapped fixture that left the live list costs one extra request and finishes with finalizedAt", async () => {
    const db = fakeDb("sofascore", { mappings: mappings([1]), fixtures: [fixtureState(1)] });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [] },
      "tournaments/get-last-matches": {
        events: [
          event(1, 101, 102, FINISHED, { homeScore: { current: 2 }, awayScore: { current: 1 } }),
        ],
      },
    });
    const { outcome } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(paths).toEqual([
      SOFASCORE_LIVE_EVENTS_PATH,
      `tournaments/get-last-matches?tournamentId=937&seasonId=${SEASON}&pageIndex=0`,
    ]);
    const call = ingests(db)[0].args.p_fixture as Record<string, unknown>;
    expect(call.status).toBe("finished");
    expect(call.finalizedAt).toBe(NOW.toISOString());
    expect(call.homeScore).toBe(2);
  });

  test("no fallback request when nothing mapped is in play", async () => {
    const db = fakeDb("sofascore", {
      mappings: mappings([1]),
      fixtures: [
        fixtureState(1, {
          status: "scheduled",
          kickoffAt: new Date((START + 86400) * 1000).toISOString(),
        }),
      ],
    });
    const { fetch, paths } = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [] } });
    const { outcome } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(paths).toHaveLength(1);
    expect(ingests(db)).toHaveLength(0);
  });

  test("season job reads next and last matches, 2 requests", async () => {
    const db = fakeDb("sofascore", {
      mappings: mappings([1]),
      fixtures: [
        fixtureState(1, {
          status: "not_started",
          period: "pre_match",
          kickoffAt: "2026-12-01T00:00:00.000Z",
        }),
      ],
    });
    const { fetch, paths } = fakeFetch({
      "tournaments/get-next-matches": {
        events: [
          event(
            1,
            101,
            102,
            { code: 0, type: "notstarted" },
            { homeScore: undefined, awayScore: undefined },
          ),
        ],
      },
      "tournaments/get-last-matches": { events: [] },
    });
    const { outcome } = await run("sofascore", "season_fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(paths.map((p) => p.split("?")[0])).toEqual([
      "tournaments/get-next-matches",
      "tournaments/get-last-matches",
    ]);
    // kickoff moved (db 2026-12-01, SofaScore START): written
    expect(ingests(db)).toHaveLength(1);
  });

  test("an unknown status is never written", async () => {
    const db = fakeDb("sofascore", { mappings: mappings([1]), fixtures: [fixtureState(1)] });
    const { fetch } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: {
        events: [event(1, 101, 102, { code: 999, type: "inprogress" })],
      },
      "tournaments/get-last-matches": { events: [] },
    });
    const { outcome, lines } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(ingests(db)).toHaveLength(0);
    expect(JSON.parse(lines[0]).unknownStatus).toEqual([
      { sofascoreEventId: "1", rawStatusType: "inprogress", rawStatusCode: 999 },
    ]);
  });

  test("a quota refusal returns a clear error and writes nothing", async () => {
    const db = fakeDb("sofascore", { mappings: mappings([1]), fixtures: [fixtureState(1)] });
    // first response reports 50 left, below the floor of 100: the second request is refused
    const { fetch, paths } = fakeFetch(
      {
        [SOFASCORE_LIVE_EVENTS_PATH]: { events: [] },
        "tournaments/get-last-matches": { events: [] },
      },
      50,
    );
    const { outcome } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(429);
    expect(outcome.body).toMatchObject({ error: "provider_rate_limited", written: 0 });
    expect(paths).toHaveLength(1);
    expect(db.calls.map((c) => c.name)).toEqual(["football_sofascore_live_snapshot"]);
  });

  test("a database refusal of one fixture is reported, the run is recorded partial", async () => {
    const db = fakeDb(
      "sofascore",
      { mappings: mappings([1, 2]), fixtures: [fixtureState(1), fixtureState(2)] },
      (id) => (id === "1" ? { message: "boom" } : null),
    );
    const { fetch } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: {
        events: [event(1, 101, 102, LIVE), event(2, 103, 104, LIVE)],
      },
    });
    const { outcome } = await run("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(502);
    expect(outcome.body).toMatchObject({ error: "fixture_item_rejected", written: 1 });
    const complete = db.calls.find((c) => c.name === "complete_football_ingestion");
    expect(complete?.args.p_status).toBe("partial");
  });
});

describe("skipReason", () => {
  const call = (over: Record<string, unknown>) =>
    ({
      p_provider_name: "sofascore",
      p_external_id: "1",
      p_fixture: {
        kickoffAt: KICKOFF.toISOString(),
        status: "live_first_half",
        period: "first_half",
        homeScore: 0,
        awayScore: 0,
        providerUpdatedAt: new Date((START + 200) * 1000).toISOString(),
        sourceSequence: (START + 200) * 1000,
        finalizedAt: null,
        ...over,
      },
    }) as never;
  test("unchanged, stale and protected states are not sent", () => {
    expect(skipReason(call({}), fixtureState(1) as never)).toBe("unchanged");
    expect(
      skipReason(
        call({ providerUpdatedAt: new Date(START * 1000).toISOString() }),
        fixtureState(1, { homeScore: 5 }) as never,
      ),
    ).toBe("stale");
    expect(
      skipReason(
        call({ status: "live_second_half" }),
        fixtureState(1, { status: "finished" }) as never,
      ),
    ).toBe("protected_final_state");
    expect(skipReason(call({ homeScore: 1 }), fixtureState(1) as never)).toBeNull();
    expect(skipReason(call({}), undefined)).toBe("no_fixture_state");
  });
});

describe("handler wiring", () => {
  const request = (body: string) =>
    new Request("https://functions.example/football-live-refresh", {
      method: "POST",
      headers: { "content-type": "application/json", "x-botolago-scheduler-token": TOKEN },
      body,
    });
  const environment = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN, RAPIDAPI_KEY: "k" };

  test("sofascore source goes through RapidAPI and the ingest RPC, never SportsMonks", async () => {
    const db = fakeDb("sofascore", { mappings: mappings([1]), fixtures: [fixtureState(1)] });
    const hosts: string[] = [];
    const response = await handleFootballLiveRefreshRequest(request('{"job":"fixtures"}'), {
      environment,
      client: db.client,
      now: () => NOW,
      fetch: async (input) => {
        hosts.push(new URL(String(input)).host);
        return Response.json({ events: [event(1, 101, 102, LIVE)] });
      },
    });
    expect(response.status).toBe(200);
    expect(hosts).toEqual(["sofascore.p.rapidapi.com"]);
    expect(ingests(db)).toHaveLength(1);
  });
});
