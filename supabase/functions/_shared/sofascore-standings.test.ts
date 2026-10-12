import { describe, expect, test } from "bun:test";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";
import { createRapidApiClient } from "./rapidapi-client.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID, SOFASCORE_LIVE_EVENTS_PATH } from "./sofascore-fixtures.ts";
import { runSofascoreRefresh } from "./sofascore-live-refresh.ts";
import {
  buildStandingsPayload,
  countOrNull,
  finishedWrittenThisTick,
  isDailyStandingsHour,
  parseStandingsRows,
  standingsPath,
} from "./sofascore-standings.ts";

// Synthetic ids and figures only.
const SEASON = 102220;
const START = 1_790_000_000;
const NOW = new Date((START + 3600) * 1000); // 2026-09-21 ... 01:xx UTC is not asserted
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function standingRow(team: number, position: number, over: Record<string, unknown> = {}) {
  return {
    team: { id: team, name: `T${team}` },
    position,
    matches: 5,
    wins: 3,
    draws: 1,
    losses: 1,
    scoresFor: 7,
    scoresAgainst: 4,
    points: 10,
    ...over,
  };
}
const table = (rows: unknown[], extra: Record<string, unknown> = {}) => ({
  standings: [{ type: "total", rows, updatedAtTimestamp: START, ...extra }],
});

describe("parseStandingsRows: unknown is null, never 0", () => {
  test("a figure SofaScore left out is null; a real 0 stays 0", () => {
    const parsed = parseStandingsRows(
      table([
        standingRow(101, 1, { wins: undefined, draws: 0, losses: 0, scoresFor: 0 }),
        standingRow(102, 2, { points: null, matches: "5", scoresAgainst: -1 }),
      ]),
    );
    expect(parsed?.rows[0]).toMatchObject({
      won: null,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      points: 10,
    });
    expect(parsed?.rows[1]).toMatchObject({
      points: null, // null
      played: null, // a string is not a count
      goalsAgainst: null, // negative is not a count
    });
  });

  test("countOrNull accepts whole numbers >= 0 only", () => {
    expect(countOrNull(0)).toBe(0);
    expect(countOrNull(12)).toBe(12);
    for (const bad of [undefined, null, "3", -1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(countOrNull(bad)).toBeNull();
    }
  });

  test("a row with no team id is counted malformed, not guessed", () => {
    const parsed = parseStandingsRows(table([standingRow(101, 1), { position: 2, matches: 4 }]));
    expect(parsed?.rows.map((row) => row.teamExternalId)).toEqual(["101"]);
    expect(parsed?.malformedRows).toBe(1);
  });

  test("reads the total table and its update time; other shapes are not a table", () => {
    const parsed = parseStandingsRows({
      standings: [
        { type: "home", rows: [standingRow(999, 1)] },
        { type: "total", rows: [standingRow(101, 1)], updatedAtTimestamp: START },
      ],
    });
    expect(parsed?.rows.map((row) => row.teamExternalId)).toEqual(["101"]);
    expect(parsed?.updatedAt).toBe(new Date(START * 1000).toISOString());
    expect(parseStandingsRows({})).toBeNull();
    expect(parseStandingsRows({ standings: [{ type: "total" }] })).toBeNull();
    expect(parseStandingsRows(null)).toBeNull();
  });

  test("an incomplete row is not sent: no zero is invented for it", () => {
    const parsed = parseStandingsRows(
      table([
        standingRow(101, 1),
        standingRow(102, 2, { wins: undefined }),
        standingRow(103, 2), // repeats position 2... but 102 was dropped, so 103 may hold it
        standingRow(104, 3, { position: 1 }), // repeats position 1: dropped
      ]),
    );
    const payload = buildStandingsPayload(parsed!);
    expect(payload.rows.map((row) => row.teamExternalId)).toEqual(["101", "103"]);
    expect(payload.incomplete).toEqual(["102", "104"]);
    expect(payload.rows.every((row) => Object.values(row).every((v) => v !== null))).toBe(true);
  });
});

describe("when the table is refreshed", () => {
  test("a daily hour (UTC) for the season job, 03 by default", () => {
    expect(isDailyStandingsHour(new Date("2026-10-13T03:25:00Z"), {})).toBe(true);
    expect(isDailyStandingsHour(new Date("2026-10-13T04:00:00Z"), {})).toBe(false);
    expect(
      isDailyStandingsHour(new Date("2026-10-13T05:00:00Z"), { SOFASCORE_DAILY_HOUR_UTC: "5" }),
    ).toBe(true);
    // a bad value falls back to the default
    expect(
      isDailyStandingsHour(new Date("2026-10-13T03:00:00Z"), { SOFASCORE_DAILY_HOUR_UTC: "99" }),
    ).toBe(true);
  });

  test("finishedWrittenThisTick is a yes or no, however many finished", () => {
    const call = (status: string) =>
      ({ p_provider_name: "sofascore", p_external_id: "1", p_fixture: { status } }) as never;
    expect(finishedWrittenThisTick([])).toBe(false);
    expect(finishedWrittenThisTick([call("live_first_half")])).toBe(false);
    expect(finishedWrittenThisTick([call("finished"), call("finished"), call("finished")])).toBe(
      true,
    );
  });
});

// --- through the live tick ---------------------------------------------------

function event(id: number, home: number, away: number, code: number, type: string) {
  return {
    id,
    startTimestamp: START,
    status: { code, type, description: "x" },
    roundInfo: { round: 4 },
    tournament: { id: 1, uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
    season: { id: SEASON },
    homeTeam: { id: home },
    awayTeam: { id: away },
    changes: { changeTimestamp: START + 3000 },
    homeScore: { current: 1 },
    awayScore: { current: 0 },
  };
}
const FINISHED = (id: number, home: number, away: number) => event(id, home, away, 100, "finished");
const LIVE = (id: number, home: number, away: number) => event(id, home, away, 6, "inprogress");

function snapshot(fixtureIds: number[]) {
  const row = (entity_type: string, external_id: string, internal_entity_id: string) => ({
    provider_name: "sofascore",
    entity_type,
    external_id,
    internal_entity_id,
    active: true,
  });
  return {
    mappings: [
      row("competition", "937", uuid("c", 1)),
      row("season", String(SEASON), uuid("5", 1)),
      row("round", `${SEASON}:4`, uuid("a", 4)),
      ...[101, 102, 103, 104].map((t) => row("team", String(t), uuid("7", t))),
      ...fixtureIds.map((e) => row("fixture", String(e), uuid("f", e))),
    ],
    fixtures: fixtureIds.map((id) => ({
      id: uuid("f", id),
      externalId: String(id),
      kickoffAt: new Date(START * 1000).toISOString(),
      status: "live_first_half",
      period: "first_half",
      homeScore: 0,
      awayScore: 0,
      providerUpdatedAt: new Date((START + 100) * 1000).toISOString(),
      sourceSequence: (START + 100) * 1000,
      finalizedAt: null,
    })),
  };
}

function fakeDb(source: string, fixtureIds: number[], applyError = false) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const state = snapshot(fixtureIds);
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          switch (name) {
            case "football_data_source":
              return Promise.resolve({ data: source, error: null });
            case "football_sofascore_live_snapshot":
              return Promise.resolve({ data: state, error: null });
            case "begin_football_ingestion":
              return Promise.resolve({ data: uuid("9", 1), error: null });
            case "complete_football_ingestion":
              return Promise.resolve({ data: null, error: null });
            case "ingest_football_fixture":
              return Promise.resolve({ data: uuid("f", 1), error: null });
            case "service_apply_sofascore_standings":
              return Promise.resolve(
                applyError
                  ? { data: null, error: { message: "RANK_CONFLICT" } }
                  : { data: { inserted: 0, updated: 2, unchanged: 0 }, error: null },
              );
            default:
              return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
          }
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls };
}

function fakeNet(routes: Record<string, unknown>) {
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
        "x-ratelimit-requests-remaining": "5000",
      },
    });
  };
  return { fetch, paths };
}

const standingsRoute = {
  [standingsPath("937", String(SEASON))]: table([standingRow(101, 1), standingRow(102, 2)]),
};

function tick(
  mode: "sofascore" | "shadow",
  job: "fixtures" | "season_fixtures",
  db: ReturnType<typeof fakeDb>,
  net: ReturnType<typeof fakeNet>,
  environment: Record<string, string> = {},
  now = NOW,
) {
  const lines: string[] = [];
  return runSofascoreRefresh({
    mode,
    job,
    client: db.client,
    rapid: createRapidApiClient(
      "sofascore",
      { RAPIDAPI_KEY: "k" },
      { fetch: net.fetch, maxRetries: 0 },
    ),
    environment: {
      SOFASCORE_DETAILS_PER_TICK: "0",
      SOFASCORE_FANTASY_ENABLED: "false",
      ...environment,
    },
    now,
    log: (line) => lines.push(line),
  }).then((outcome) => ({ outcome, lines }));
}

const standingsRequests = (net: ReturnType<typeof fakeNet>) =>
  net.paths.filter((path) => path.startsWith("tournaments/get-standings"));
const standingsWrites = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter((call) => call.name === "service_apply_sofascore_standings");

describe("the live tick refreshes the table once after a match ends", () => {
  test("three matches finishing in the same tick cost ONE standings request and one write", async () => {
    const db = fakeDb("sofascore", [1, 2, 3]);
    const net = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: {
        events: [FINISHED(1, 101, 102), FINISHED(2, 103, 104), FINISHED(3, 101, 104)],
      },
      ...standingsRoute,
    });
    const { outcome } = await tick("sofascore", "fixtures", db, net);
    expect(outcome.status).toBe(200);
    expect(db.calls.filter((c) => c.name === "ingest_football_fixture")).toHaveLength(3);
    expect(standingsRequests(net)).toHaveLength(1);
    expect(standingsWrites(db)).toHaveLength(1);
    const args = standingsWrites(db)[0].args;
    expect(args.p_season_external_id).toBe(String(SEASON));
    expect((args.p_rows as unknown[]).length).toBe(2);
    expect(outcome.body).toMatchObject({ standings: { status: "ok", trigger: "after_match" } });
  });

  test("no match finished: no standings request", async () => {
    const db = fakeDb("sofascore", [1]);
    const net = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [LIVE(1, 101, 102)] },
      ...standingsRoute,
    });
    const { outcome } = await tick("sofascore", "fixtures", db, net);
    expect(outcome.status).toBe(200);
    expect(standingsRequests(net)).toHaveLength(0);
    expect(standingsWrites(db)).toHaveLength(0);
    expect(outcome.body).toMatchObject({ standings: { status: "skipped" } });
  });

  test("shadow reads the table and writes nothing", async () => {
    const db = fakeDb("shadow", [1]);
    const net = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [FINISHED(1, 101, 102)] },
      ...standingsRoute,
    });
    const { outcome, lines } = await tick("shadow", "fixtures", db, net);
    expect(outcome.status).toBe(200);
    expect(standingsRequests(net)).toHaveLength(1);
    expect(standingsWrites(db)).toHaveLength(0);
    expect(outcome.body).toMatchObject({ standings: { status: "shadow", sent: 2 } });
    expect(lines.some((line) => line.includes('"standings":"shadow"'))).toBe(true);
  });

  test("a table that cannot be read or written never fails the scores", async () => {
    const failingRead = fakeDb("sofascore", [1]);
    const net = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [FINISHED(1, 101, 102)] },
      // no standings route: 404
    });
    const read = await tick("sofascore", "fixtures", failingRead, net);
    expect(read.outcome.status).toBe(200);
    expect(read.outcome.body).toMatchObject({
      written: 1,
      standings: { status: "error", error: "data_unavailable" },
    });

    const failingWrite = fakeDb("sofascore", [1], true);
    const net2 = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [FINISHED(1, 101, 102)] },
      ...standingsRoute,
    });
    const write = await tick("sofascore", "fixtures", failingWrite, net2);
    expect(write.outcome.status).toBe(200);
    expect(write.outcome.body).toMatchObject({
      written: 1,
      standings: { status: "error", error: "database_rejected" },
    });
  });

  test("SOFASCORE_STANDINGS_ENABLED=false switches it off", async () => {
    const db = fakeDb("sofascore", [1]);
    const net = fakeNet({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [FINISHED(1, 101, 102)] },
      ...standingsRoute,
    });
    await tick("sofascore", "fixtures", db, net, { SOFASCORE_STANDINGS_ENABLED: "false" });
    expect(standingsRequests(net)).toHaveLength(0);
  });
});

describe("the season job", () => {
  const nextPath = (page: number) =>
    `tournaments/get-next-matches?tournamentId=937&seasonId=${SEASON}&pageIndex=${page}`;
  const lastPath = (page: number) =>
    `tournaments/get-last-matches?tournamentId=937&seasonId=${SEASON}&pageIndex=${page}`;

  test("outside the daily hour: 2 requests, no standings (the hourly job as before)", async () => {
    const db = fakeDb("sofascore", [1]);
    const net = fakeNet({
      "tournaments/get-next-matches": { events: [], hasNextPage: true },
      "tournaments/get-last-matches": { events: [], hasNextPage: true },
      ...standingsRoute,
    });
    const { outcome } = await tick(
      "sofascore",
      "season_fixtures",
      db,
      net,
      {},
      new Date("2026-10-13T10:10:00Z"),
    );
    expect(outcome.status).toBe(200);
    expect(net.paths).toEqual([nextPath(0), lastPath(0)]);
  });

  test("in the daily hour: the whole schedule (pages until the end) and the table", async () => {
    const db = fakeDb("sofascore", [1]);
    const net = fakeNet({
      [nextPath(0)]: { events: [], hasNextPage: true },
      [nextPath(1)]: { events: [], hasNextPage: true },
      [nextPath(2)]: { events: [], hasNextPage: false },
      [lastPath(0)]: { events: [], hasNextPage: true },
      [lastPath(1)]: { events: [], hasNextPage: false },
      ...standingsRoute,
    });
    const { outcome } = await tick(
      "sofascore",
      "season_fixtures",
      db,
      net,
      {},
      new Date("2026-10-13T03:10:00Z"),
    );
    expect(outcome.status).toBe(200);
    expect(net.paths.filter((p) => p.startsWith("tournaments/get-next"))).toEqual([
      nextPath(0),
      nextPath(1),
      nextPath(2),
    ]);
    expect(net.paths.filter((p) => p.startsWith("tournaments/get-last"))).toEqual([
      lastPath(0),
      lastPath(1),
    ]);
    expect(standingsRequests(net)).toHaveLength(1);
    expect(standingsWrites(db)).toHaveLength(1);
    expect(outcome.body).toMatchObject({ standings: { status: "ok", trigger: "daily" } });
  });

  test("the full pull is bounded by SOFASCORE_SEASON_FULL_MAX_PAGES", async () => {
    const db = fakeDb("sofascore", [1]);
    const net = fakeNet({
      "tournaments/get-next-matches": { events: [], hasNextPage: true },
      "tournaments/get-last-matches": { events: [], hasNextPage: true },
      ...standingsRoute,
    });
    await tick(
      "sofascore",
      "season_fixtures",
      db,
      net,
      { SOFASCORE_SEASON_FULL_MAX_PAGES: "3" },
      new Date("2026-10-13T03:10:00Z"),
    );
    expect(net.paths.filter((p) => p.startsWith("tournaments/get-next"))).toHaveLength(3);
    expect(net.paths.filter((p) => p.startsWith("tournaments/get-last"))).toHaveLength(3);
  });
});
