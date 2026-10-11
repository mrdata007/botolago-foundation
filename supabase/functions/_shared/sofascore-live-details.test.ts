import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";
import { createRapidApiClient } from "./rapidapi-client.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID, SOFASCORE_LIVE_EVENTS_PATH } from "./sofascore-fixtures.ts";
import { runSofascoreDetailsBackfill, runSofascoreRefresh } from "./sofascore-live-refresh.ts";

// The SofaScore side of match details: which fixtures get fetched, how many,
// what is written. Synthetic ids; the three replies are a committed fixture.
const SEASON = 102220;
const START = 1_790_000_000;
const NOW = new Date((START + 3600) * 1000);
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const replyFile = (part: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sofascore/17132481.${part}.json`, import.meta.url),
      "utf8",
    ),
  );
const REPLIES = {
  "get-incidents": replyFile("incidents"),
  "get-lineups": replyFile("lineups"),
  "get-statistics": replyFile("statistics"),
};

const LIVE = { code: 6, type: "inprogress" };
const FINISHED = { code: 100, type: "finished" };

function event(
  id: number,
  status: { code: number; type: string },
  changeTimestamp = START + 3000,
  score = 1,
) {
  return {
    id,
    startTimestamp: START,
    status: { ...status, description: "x" },
    roundInfo: { round: 4 },
    tournament: { id: 1, uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
    season: { id: SEASON },
    homeTeam: { id: 101 },
    awayTeam: { id: 102 },
    changes: { changeTimestamp },
    homeScore: { current: score },
    awayScore: { current: 0 },
  };
}

function mappings(ids: number[]) {
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
    row("team", "101", uuid("7", 101)),
    row("team", "102", uuid("7", 102)),
    ...ids.map((e) => row("fixture", String(e), uuid("f", e))),
  ];
}

function state(id: number, over: Record<string, unknown> = {}) {
  return {
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
    homeTeamId: uuid("7", 101),
    awayTeamId: uuid("7", 102),
    ...over,
  };
}

interface Db {
  client: LiveRefreshRpcClient;
  calls: { name: string; args: Record<string, unknown> }[];
}
function fakeDb(snapshot: { mappings: unknown[]; fixtures: unknown[] }, due: unknown[] = []): Db {
  const calls: Db["calls"] = [];
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          const data: Record<string, unknown> = {
            football_sofascore_live_snapshot: snapshot,
            begin_football_ingestion: uuid("9", 1),
            ingest_football_fixture: uuid("f", 1),
            ingest_football_match_details: { outcome: "stored", events: 1 },
            service_football_match_details_due: due,
          };
          return Promise.resolve({ data: data[name] ?? null, error: null });
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls };
}

/** The live/list routes plus the three detail replies for any event id. */
function fakeFetch(
  lists: Record<string, unknown>,
  remaining: number | ((n: number) => number) = 5000,
) {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    const headers = {
      "x-ratelimit-requests-limit": "10000",
      "x-ratelimit-requests-remaining": String(
        typeof remaining === "number" ? remaining : remaining(paths.length),
      ),
    };
    const detail = /^matches\/(get-incidents|get-lineups|get-statistics)\?matchId=\d+$/.exec(path);
    if (detail) return Response.json(REPLIES[detail[1] as keyof typeof REPLIES], { headers });
    const key = Object.keys(lists).find((candidate) => path.startsWith(candidate));
    return key ? Response.json(lists[key], { headers }) : new Response("{}", { status: 404 });
  };
  return { fetch, paths };
}
const rapid = (fetch: (input: string) => Promise<Response>, minRemaining = 100) =>
  createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0, minRemaining });

async function tick(
  mode: "sofascore" | "shadow",
  job: "fixtures" | "season_fixtures",
  db: Db,
  fetch: (input: string) => Promise<Response>,
  environment: Record<string, string> = {},
  minRemaining = 100,
) {
  const lines: string[] = [];
  const outcome = await runSofascoreRefresh({
    mode,
    job,
    client: db.client,
    rapid: rapid(fetch, minRemaining),
    environment,
    now: NOW,
    log: (line) => lines.push(line),
  });
  return { outcome, lines };
}
const detailPaths = (paths: string[]) => paths.filter((p) => p.startsWith("matches/"));
const named = (db: Db, name: string) => db.calls.filter((c) => c.name === name);

describe("sofascore details on the live tick", () => {
  const ids = [1, 2, 3, 4, 5, 6];
  const snapshot = () => ({
    mappings: mappings(ids),
    fixtures: ids.map((id) => state(id)),
  });
  const lists = () => ({
    [SOFASCORE_LIVE_EVENTS_PATH]: { events: ids.map((id) => event(id, FINISHED)) },
  });

  test("at most 4 fixtures per tick by default, 3 requests each", async () => {
    const db = fakeDb(snapshot());
    const { fetch, paths } = fakeFetch(lists());
    const { outcome } = await tick("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(named(db, "ingest_football_fixture")).toHaveLength(6);
    expect(detailPaths(paths)).toHaveLength(12);
    expect(named(db, "ingest_football_match_details")).toHaveLength(4);
    expect(outcome.body.matchDetails).toMatchObject({
      scope: "live",
      offered: 4,
      attempted: 4,
      stored: 4,
    });
    // the scores are in before the first details request
    const order = db.calls.map((c) => c.name);
    expect(order.lastIndexOf("ingest_football_fixture")).toBeLessThan(
      order.indexOf("ingest_football_match_details"),
    );
  });

  test("the cap is configurable and 0 switches the details off", async () => {
    for (const [value, fixtures] of [
      ["2", 2],
      ["0", 0],
      ["99", 4], // out of range: the default
    ] as const) {
      const db = fakeDb(snapshot());
      const { fetch, paths } = fakeFetch(lists());
      await tick("sofascore", "fixtures", db, fetch, { SOFASCORE_DETAILS_PER_TICK: value });
      expect(detailPaths(paths)).toHaveLength(fixtures * 3);
      expect(named(db, "ingest_football_match_details")).toHaveLength(fixtures);
    }
  });

  test("a fixture just finished goes before one that is only in play", async () => {
    const db = fakeDb({
      mappings: mappings([1, 2]),
      fixtures: [state(1), state(2)],
    });
    const { fetch } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, LIVE, START + 3500), event(2, FINISHED)] },
    });
    await tick("sofascore", "fixtures", db, fetch, { SOFASCORE_DETAILS_PER_TICK: "1" });
    expect(
      named(db, "ingest_football_match_details").map((c) => c.args.p_fixture_external_id),
    ).toEqual(["2"]);
  });

  test("an in-play fixture with nothing new is not fetched; a recent change is", async () => {
    const quiet = state(1, { homeScore: 1 }); // identical to SofaScore: not written
    const old = event(1, LIVE, START + 100); // changed an hour ago
    const dbQuiet = fakeDb({ mappings: mappings([1]), fixtures: [quiet] });
    const quietRun = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [old] } });
    await tick("sofascore", "fixtures", dbQuiet, quietRun.fetch);
    expect(detailPaths(quietRun.paths)).toEqual([]);

    // changed 60 seconds ago: the match page needs its new card or substitution
    const recent = event(1, LIVE, START + 3540);
    const dbRecent = fakeDb({ mappings: mappings([1]), fixtures: [quiet] });
    const recentRun = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [recent] } });
    await tick("sofascore", "fixtures", dbRecent, recentRun.fetch);
    expect(detailPaths(recentRun.paths)).toHaveLength(3);
    expect(named(dbRecent, "ingest_football_fixture")).toHaveLength(0);
    expect(named(dbRecent, "ingest_football_match_details")).toHaveLength(1);
  });

  test("an unmapped fixture is never fetched", async () => {
    const db = fakeDb({ mappings: mappings([1]), fixtures: [state(1)] });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(9, FINISHED)] },
    });
    await tick("sofascore", "fixtures", db, fetch);
    expect(detailPaths(paths)).toEqual([]);
  });

  test("the clubs sent are the fixture's, from the database's home and away", async () => {
    // The database has the clubs the other way round from the event.
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { homeTeamId: uuid("7", 102), awayTeamId: uuid("7", 101) })],
    });
    const { fetch } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, FINISHED)] },
    });
    await tick("sofascore", "fixtures", db, fetch);
    const sent = named(db, "ingest_football_match_details")[0].args.p_details as {
      lineups: { teamExternalId: string }[];
    };
    expect(sent.lineups.map((l) => l.teamExternalId)).toEqual(["102", "101"]);
  });

  test("shadow reads and logs the details, writes nothing", async () => {
    const db = fakeDb(snapshot());
    const { fetch, paths } = fakeFetch(lists());
    const { outcome, lines } = await tick("shadow", "fixtures", db, fetch);
    expect(outcome.body).toMatchObject({ status: "shadow", written: 0 });
    expect(detailPaths(paths)).toHaveLength(12);
    expect(db.calls.map((c) => c.name)).toEqual(["football_sofascore_live_snapshot"]);
    const shadowLines = lines
      .map((l) => JSON.parse(l))
      .filter((l) => l.result === "shadow_match_details");
    expect(shadowLines).toHaveLength(4);
    expect(shadowLines.every((l) => l.written === 0)).toBe(true);
  });

  test("the season job fetches no details", async () => {
    const db = fakeDb(snapshot());
    const { fetch, paths } = fakeFetch({
      "tournaments/get-next-matches": { events: [] },
      "tournaments/get-last-matches": { events: ids.map((id) => event(id, FINISHED)) },
    });
    const { outcome } = await tick("sofascore", "season_fixtures", db, fetch);
    expect(outcome.body.matchDetails).toEqual({ status: "skipped" });
    expect(detailPaths(paths)).toEqual([]);
  });

  test("a quota refusal in the details keeps the scores and stops the details", async () => {
    const db = fakeDb(snapshot());
    // the live list reports plenty; the first details reply reports 50 left, below the floor
    const { fetch, paths } = fakeFetch(lists(), (n) => (n === 1 ? 5000 : 50));
    const { outcome } = await tick("sofascore", "fixtures", db, fetch);
    expect(outcome.status).toBe(200);
    expect(named(db, "ingest_football_fixture")).toHaveLength(6);
    expect(detailPaths(paths)).toEqual(["matches/get-incidents?matchId=1"]);
    expect(named(db, "ingest_football_match_details")).toHaveLength(0);
    expect(outcome.body.matchDetails).toMatchObject({ rateLimited: true, stored: 0, attempted: 1 });
  });
});

describe("sofascore details backfill", () => {
  const ids = [11, 12, 13];
  const snapshot = () => ({
    mappings: mappings(ids),
    fixtures: ids.map((id) =>
      state(id, { status: "finished", finalizedAt: "2026-10-10T00:00:00Z" }),
    ),
  });
  const run = (
    mode: "sofascore" | "shadow",
    db: Db,
    fetch: (input: string) => Promise<Response>,
    environment: Record<string, string> = {},
  ) => {
    const lines: string[] = [];
    return runSofascoreDetailsBackfill({
      mode,
      client: db.client,
      rapid: rapid(fetch),
      environment,
      now: NOW,
      log: (line) => lines.push(line),
    }).then((outcome) => ({ outcome, lines }));
  };

  test("asks the database which finished fixtures have no details, then fetches them", async () => {
    const db = fakeDb(snapshot(), [
      { externalId: "11", status: "finished" },
      { externalId: "12", status: "finished" },
    ]);
    const { fetch, paths } = fakeFetch({});
    const { outcome } = await run("sofascore", db, fetch);
    expect(outcome.status).toBe(200);
    const due = named(db, "service_football_match_details_due")[0].args;
    expect(due).toEqual({
      p_provider_name: "sofascore",
      p_season_external_id: String(SEASON),
      p_scope: "backfill",
      p_limit: 4,
    });
    expect(paths).toEqual([
      "matches/get-incidents?matchId=11",
      "matches/get-lineups?matchId=11",
      "matches/get-statistics?matchId=11",
      "matches/get-incidents?matchId=12",
      "matches/get-lineups?matchId=12",
      "matches/get-statistics?matchId=12",
    ]);
    const stored = named(db, "ingest_football_match_details");
    expect(stored.map((c) => c.args.p_fixture_external_id)).toEqual(["11", "12"]);
    // clubs came from the snapshot (internal ids -> SofaScore team ids)
    expect(
      (stored[0].args.p_details as { lineups: { teamExternalId: string }[] }).lineups.map(
        (l) => l.teamExternalId,
      ),
    ).toEqual(["101", "102"]);
    expect(outcome.body.matchDetails).toMatchObject({ scope: "backfill", stored: 2 });
  });

  test("the per-run cap is passed to the database and bounded", async () => {
    for (const [value, expected] of [
      ["2", 2],
      ["50", 4],
    ] as const) {
      const db = fakeDb(snapshot(), []);
      const { fetch } = fakeFetch({});
      await run("sofascore", db, fetch, { SOFASCORE_DETAILS_BACKFILL_LIMIT: value });
      expect(named(db, "service_football_match_details_due")[0].args.p_limit).toBe(expected);
    }
  });

  test("a limit of 0 switches the backfill off without reading anything", async () => {
    const db = fakeDb(snapshot(), []);
    const { fetch, paths } = fakeFetch({});
    const { outcome } = await run("sofascore", db, fetch, {
      SOFASCORE_DETAILS_BACKFILL_LIMIT: "0",
    });
    expect(outcome.body).toMatchObject({ status: "skipped", reason: "disabled" });
    expect(db.calls).toEqual([]);
    expect(paths).toEqual([]);
  });

  test("shadow reads and logs, writes nothing", async () => {
    const db = fakeDb(snapshot(), [{ externalId: "11", status: "finished" }]);
    const { fetch, paths } = fakeFetch({});
    const { outcome, lines } = await run("shadow", db, fetch);
    expect(outcome.status).toBe(200);
    expect(paths).toHaveLength(3);
    expect(db.calls.map((c) => c.name)).toEqual([
      "football_sofascore_live_snapshot",
      "service_football_match_details_due",
    ]);
    expect(lines.map((l) => JSON.parse(l)).some((l) => l.result === "shadow_match_details")).toBe(
      true,
    );
  });

  test("a fixture whose clubs cannot be resolved is skipped, not guessed", async () => {
    const db = fakeDb(
      {
        mappings: mappings([11]),
        fixtures: [state(11, { homeTeamId: uuid("7", 999) })],
      },
      [{ externalId: "11", status: "finished" }],
    );
    const { fetch, paths } = fakeFetch({});
    const { outcome } = await run("sofascore", db, fetch);
    expect(paths).toEqual([]);
    expect(outcome.body).toMatchObject({ due: 1, unresolvedTeams: 1 });
    expect(named(db, "ingest_football_match_details")).toHaveLength(0);
  });

  test("a quota refusal answers 429 and stores nothing for that fixture", async () => {
    const db = fakeDb(snapshot(), [{ externalId: "11", status: "finished" }]);
    const { fetch, paths } = fakeFetch({}, 50);
    const { outcome } = await run("sofascore", db, fetch);
    expect(outcome.status).toBe(429);
    expect(paths).toHaveLength(1);
    expect(named(db, "ingest_football_match_details")).toHaveLength(0);
  });
});
