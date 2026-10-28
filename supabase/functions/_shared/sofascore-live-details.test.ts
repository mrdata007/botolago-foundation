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
function fakeDb(
  snapshot: { mappings: unknown[]; fixtures: unknown[] },
  due: unknown[] = [],
  schedule: unknown = null,
): Db {
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
            service_football_details_schedule: schedule,
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
  environmentOverrides: Record<string, string> = {},
  minRemaining = 100,
) {
  // These tests are about match details: the Fantasy step has its own tests.
  const environment = { SOFASCORE_FANTASY_ENABLED: "false", ...environmentOverrides };
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

  test("an in-play fixture with nothing written is not fetched, however recent its provider change", async () => {
    const quiet = state(1, { homeScore: 1 }); // identical to SofaScore: not written
    const old = event(1, LIVE, START + 100); // changed an hour ago
    const dbQuiet = fakeDb({ mappings: mappings([1]), fixtures: [quiet] });
    const quietRun = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [old] } });
    await tick("sofascore", "fixtures", dbQuiet, quietRun.fetch);
    expect(detailPaths(quietRun.paths)).toEqual([]);

    // changed 60 seconds ago: still nothing is read. The provider's change
    // timestamp moves for every minor edit; only a written score, status or
    // period change earns the incidents request.
    const recent = event(1, LIVE, START + 3540);
    const dbRecent = fakeDb({ mappings: mappings([1]), fixtures: [quiet] });
    const recentRun = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [recent] } });
    await tick("sofascore", "fixtures", dbRecent, recentRun.fetch);
    expect(detailPaths(recentRun.paths)).toEqual([]);
    expect(named(dbRecent, "ingest_football_match_details")).toHaveLength(0);
  });

  test("a fixture that just finished reads all three replies", async () => {
    const db = fakeDb({ mappings: mappings([1]), fixtures: [state(1)] });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, FINISHED)] },
    });
    await tick("sofascore", "fixtures", db, fetch);
    expect(detailPaths(paths)).toEqual([
      "matches/get-incidents?matchId=1",
      "matches/get-lineups?matchId=1",
      "matches/get-statistics?matchId=1",
    ]);
  });

  test("a provider change alone (no score, status or period write) reads nothing, whatever the age of the stored details", async () => {
    const moved = new Date(NOW.getTime() - 30_000);
    const changeTimestamp = Math.floor(moved.getTime() / 1000);
    const lists = {
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, LIVE, changeTimestamp, 1)] },
    };
    for (const agoMs of [120_000, 3_600_000]) {
      const db = fakeDb(
        {
          mappings: mappings([1]),
          fixtures: [state(1, { homeScore: 1, awayScore: 0, minute: null })],
        },
        [],
        {
          followUps: [],
          lastStored: { "1": new Date(NOW.getTime() - agoMs).toISOString() },
        },
      );
      const run = fakeFetch(lists);
      await tick("sofascore", "fixtures", db, run.fetch);
      expect(detailPaths(run.paths)).toEqual([]);
    }
  });

  test("an unmapped fixture is never fetched", async () => {
    const db = fakeDb({ mappings: mappings([1]), fixtures: [state(1)] });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(9, FINISHED)] },
    });
    await tick("sofascore", "fixtures", db, fetch);
    expect(detailPaths(paths)).toEqual([]);
  });

  test("a finished fixture is read again only when the database says a retry is due and nothing was stored since the whistle, within the cap", async () => {
    const recent = new Date(NOW.getTime() - 35 * 60 * 1000).toISOString();
    const snapshotOf = () => ({
      mappings: mappings([1, 2, 3]),
      fixtures: [
        state(1, { status: "finished", finalizedAt: recent }),
        state(2, { status: "finished", finalizedAt: recent }),
        state(3, { status: "finished", finalizedAt: recent }),
      ],
    });
    const lists = { [SOFASCORE_LIVE_EVENTS_PATH]: { events: [] } };
    // Nothing due (or an older database without the schedule): no request at all.
    for (const schedule of [null, { followUps: [], lastStored: {} }]) {
      const db = fakeDb(snapshotOf(), [], schedule);
      const { fetch, paths } = fakeFetch(lists);
      await tick("sofascore", "fixtures", db, fetch);
      expect(detailPaths(paths)).toEqual([]);
    }
    // Fixtures 1 and 2 are due, fixture 3 is not; the cap of 1 keeps the first.
    const db = fakeDb(snapshotOf(), [], { followUps: ["1", "2"], lastStored: {} });
    const { fetch, paths } = fakeFetch(lists);
    await tick("sofascore", "fixtures", db, fetch, { SOFASCORE_DETAILS_PER_TICK: "1" });
    expect(named(db, "ingest_football_fixture")).toHaveLength(0);
    expect(
      named(db, "ingest_football_match_details").map((c) => c.args.p_fixture_external_id),
    ).toEqual(["1"]);
    expect(detailPaths(paths)).toHaveLength(3);
    // Details already stored after the whistle (here 5 minutes ago): a mark
    // passing does not buy a second read.
    const storedAt = new Date(NOW.getTime() - 5 * 60 * 1000).toISOString();
    const stored = fakeDb(snapshotOf(), [], {
      followUps: ["1", "2"],
      lastStored: { "1": storedAt },
    });
    const storedRun = fakeFetch(lists);
    await tick("sofascore", "fixtures", stored, storedRun.fetch);
    expect(
      named(stored, "ingest_football_match_details").map((c) => c.args.p_fixture_external_id),
    ).toEqual(["2"]);
    expect(detailPaths(storedRun.paths)).toHaveLength(3);
  });

  test("unchanged final scores still refresh details without duplicate targets", async () => {
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [
        state(1, {
          status: "finished",
          period: "finished",
          homeScore: 1,
          finalizedAt: new Date(NOW.getTime() - 1000).toISOString(),
        }),
      ],
    });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, FINISHED)] },
    });
    await tick("shadow", "fixtures", db, fetch);
    expect(named(db, "ingest_football_match_details")).toHaveLength(0);
    expect(detailPaths(paths)).toHaveLength(3);
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
    expect(db.calls.map((c) => c.name)).toEqual([
      "football_sofascore_live_snapshot",
      "service_football_details_schedule",
    ]);
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
    environmentOverrides: Record<string, string> = {},
  ) => {
    const lines: string[] = [];
    const environment = { SOFASCORE_FANTASY_ENABLED: "false", ...environmentOverrides };
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
    expect(outcome.status).toBe(502);
    expect(named(db, "record_football_ingestion_rejection")[0].args).toMatchObject({
      p_external_id: "11",
      p_error_code: "unresolved_team_mapping",
    });
    expect(named(db, "complete_football_ingestion")[0].args).toMatchObject({
      p_status: "failed",
      p_records_rejected: 1,
    });
  });

  test("unresolved clubs in shadow are reported without recording a rejection", async () => {
    const db = fakeDb(
      { mappings: mappings([11]), fixtures: [state(11, { homeTeamId: uuid("7", 999) })] },
      [{ externalId: "11" }],
    );
    const { fetch, paths } = fakeFetch({});
    const { outcome } = await run("shadow", db, fetch);
    expect(outcome.body).toMatchObject({ unresolvedTeams: 1 });
    expect(paths).toEqual([]);
    expect(named(db, "begin_football_ingestion")).toHaveLength(0);
    expect(named(db, "record_football_ingestion_rejection")).toHaveLength(0);
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

describe("the live minute on the live tick", () => {
  const timed = (periodStart: number | undefined) => ({
    ...event(1, LIVE, START + 3000),
    ...(periodStart === undefined ? {} : { time: { currentPeriodStartTimestamp: periodStart } }),
  });
  const run = async (periodStart: number | undefined) => {
    const quiet = state(1, { homeScore: 1 });
    const db = fakeDb({ mappings: mappings([1]), fixtures: [quiet] });
    const { fetch } = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [timed(periodStart)] } });
    const { lines } = await tick("sofascore", "fixtures", db, fetch, {
      SOFASCORE_DETAILS_PER_TICK: "0",
    });
    return { db, summary: JSON.parse(lines[0]) };
  };

  test("an unchanged score is still written while the clock runs, with the minute", async () => {
    const { db, summary } = await run(START + 3000);
    const calls = named(db, "ingest_football_fixture");
    expect(calls).toHaveLength(1);
    expect((calls[0].args.p_fixture as { minute: number }).minute).toBe(11);
    expect(summary.periodStart).toEqual([
      { eventId: "1", period: "first_half", present: true, minute: 11 },
    ]);
  });

  test("without the half start nothing is written and the log says it was absent", async () => {
    const { db, summary } = await run(undefined);
    expect(named(db, "ingest_football_fixture")).toHaveLength(0);
    expect(summary.periodStart).toEqual([
      { eventId: "1", period: "first_half", present: false, minute: null },
    ]);
  });

  // A tick that only moves the clock: the provider's changeTimestamp is an hour
  // old, so nothing but the minute differs from what is stored.
  const clockTick = async (
    stored: Record<string, unknown>,
    periodStart: number | undefined,
    over: Partial<ReturnType<typeof event>> = {},
  ) => {
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { homeScore: 1, ...stored })],
    });
    const { fetch, paths } = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: {
        events: [
          {
            ...event(1, LIVE, START + 100),
            ...(periodStart === undefined
              ? {}
              : { time: { currentPeriodStartTimestamp: periodStart } }),
            ...over,
          },
        ],
      },
    });
    await tick("sofascore", "fixtures", db, fetch); // details on, default cap
    const writes = named(db, "ingest_football_fixture");
    return {
      writes,
      minutes: writes.map((c) => (c.args.p_fixture as { minute: number | null }).minute),
      details: detailPaths(paths),
    };
  };

  test("a clock-only write costs no details request (stored minute unknown or known)", async () => {
    const unknown = await clockTick({}, START + 3000);
    expect(unknown.minutes).toEqual([11]);
    expect(unknown.details).toEqual([]);
    const known = await clockTick({ minute: 10 }, START + 3000);
    expect(known.minutes).toEqual([11]);
    expect(known.details).toEqual([]);
  });

  test("a goal with the clock reads the incidents; a status change without a goal does not", async () => {
    const goal = await clockTick({ minute: 10 }, START + 3000, { homeScore: { current: 2 } });
    expect(goal.writes).toHaveLength(1);
    expect(goal.details).toEqual(["matches/get-incidents?matchId=1"]);
    // Stored half time, the feed says the second half began: written, nothing worth a read.
    const resumed = await clockTick({ minute: 10, status: "half_time" }, START + 3000);
    expect(resumed.writes).toHaveLength(1);
    expect(resumed.details).toEqual([]);
    // Stored first half, the feed says half time: one incidents read.
    const half = await clockTick({ minute: 10 }, START + 3000, {
      status: { code: 31, type: "inprogress", description: "x" },
    });
    expect(half.writes).toHaveLength(1);
    expect(half.details).toEqual(["matches/get-incidents?matchId=1"]);
  });

  test("the clock disappearing clears a stored minute instead of freezing it", async () => {
    const cleared = await clockTick({ minute: 44 }, undefined);
    expect(cleared.minutes).toEqual([null]);
    expect(cleared.details).toEqual([]); // clearing the clock is not worth a request either
  });

  test("the stored minute unchanged is not a write, nor is a null that is already null", async () => {
    expect((await clockTick({ minute: 11 }, START + 3000)).writes).toHaveLength(0);
    expect((await clockTick({ minute: null }, undefined)).writes).toHaveLength(0);
  });
});

describe("lineups in play and statistics after the post-match window", () => {
  const liveEvent = (score: number) => event(1, LIVE, START + 100, score);

  test("a goal in a match with no stored lineup reads the incidents and the lineups; with one, the incidents alone", async () => {
    // Snapshot (migration 20261014120000) says no lineup is stored; the score moved.
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { homeScore: 0, hasLineups: false })],
    });
    const run = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [liveEvent(1)] } });
    await tick("sofascore", "fixtures", db, run.fetch);
    expect(detailPaths(run.paths)).toEqual([
      "matches/get-incidents?matchId=1",
      "matches/get-lineups?matchId=1",
    ]);
    for (const over of [{ hasLineups: true }, {}]) {
      const stored = fakeDb({
        mappings: mappings([1]),
        fixtures: [state(1, { homeScore: 0, ...over })],
      });
      const again = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [liveEvent(1)] } });
      await tick("sofascore", "fixtures", stored, again.fetch);
      expect(detailPaths(again.paths)).toEqual(["matches/get-incidents?matchId=1"]);
    }
  });

  test("the tick that sees the match start reads the lineups alone, once", async () => {
    const kickoff = (over: Record<string, unknown>) =>
      fakeDb({
        mappings: mappings([1]),
        // Stored as not started, score 0-0; the feed says 1st half, 0-0.
        fixtures: [state(1, { status: "scheduled", period: "none", ...over })],
      });
    const feed = { [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, LIVE, START + 100, 0)] } };
    const first = kickoff({});
    const firstRun = fakeFetch(feed);
    await tick("sofascore", "fixtures", first, firstRun.fetch);
    expect(detailPaths(firstRun.paths)).toEqual(["matches/get-lineups?matchId=1"]);
    const sent = named(first, "ingest_football_match_details");
    expect(sent).toHaveLength(1);
    expect(sent[0].args.p_details).toMatchObject({ events: null, statistics: [] });
    // The next tick: the match is in play, no score change, a lineup is stored.
    const second = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { hasLineups: true })],
    });
    const secondRun = fakeFetch(feed);
    await tick("sofascore", "fixtures", second, secondRun.fetch);
    expect(detailPaths(secondRun.paths)).toEqual([]);
  });

  test("a lineup the provider has not published yet is unavailable, not a rejection", async () => {
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { status: "scheduled", period: "none" })],
    });
    const paths: string[] = [];
    const fetch = async (input: string) => {
      const path = new URL(input).pathname.slice(1) + new URL(input).search;
      paths.push(path);
      if (path.startsWith("matches/get-lineups"))
        return Response.json({ error: { code: 404, message: "Not Found" } });
      return Response.json({ events: [event(1, LIVE, START + 100, 0)] });
    };
    const outcome = await tick("sofascore", "fixtures", db, fetch);
    expect(paths.filter((p) => p.startsWith("matches/"))).toEqual([
      "matches/get-lineups?matchId=1",
    ]);
    expect(named(db, "ingest_football_match_details")).toHaveLength(0);
    expect(JSON.stringify(outcome)).toContain('"unavailable":1');
  });

  test("a provider change alone (nothing written) reads nothing, missing lineups included", async () => {
    const db = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { homeScore: 1, hasLineups: false })],
    });
    const run = fakeFetch({
      [SOFASCORE_LIVE_EVENTS_PATH]: { events: [event(1, LIVE, START + 3540, 1)] },
    });
    await tick("sofascore", "fixtures", db, run.fetch);
    expect(detailPaths(run.paths)).toEqual([]);
  });

  test("a staged statistics pull also stores the match details, with no request of its own", async () => {
    const finalized = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000).toISOString();
    const base = fakeDb({
      mappings: mappings([1]),
      fixtures: [state(1, { status: "finished", finalizedAt: finalized })],
    });
    const client = {
      schema() {
        const inner = base.client.schema("api");
        return {
          rpc(name: string, args: Record<string, unknown>) {
            if (name === "service_sofascore_staged_due") {
              base.calls.push({ name, args });
              return Promise.resolve({
                data: {
                  due: [
                    { fixtureId: uuid("f", 1), eventId: "1", coverage: "core", finalPull: false },
                  ],
                  budgetStopped: false,
                },
                error: null,
              });
            }
            return inner.rpc(name, args);
          },
        };
      },
    } as unknown as LiveRefreshRpcClient;
    const run = fakeFetch({ [SOFASCORE_LIVE_EVENTS_PATH]: { events: [] } });
    const outcome = await runSofascoreRefresh({
      mode: "sofascore",
      job: "fixtures",
      client,
      rapid: rapid(run.fetch),
      environment: {
        SOFASCORE_FANTASY_CATCHUP_PER_TICK: "0",
        SOFASCORE_FANTASY_RETRIES_PER_TICK: "0",
      },
      now: NOW,
      log: () => {},
    });
    // The pull's three replies, read once.
    expect(detailPaths(run.paths)).toEqual([
      "matches/get-incidents?matchId=1",
      "matches/get-lineups?matchId=1",
      "matches/get-statistics?matchId=1",
    ]);
    const stored = named(base, "ingest_football_match_details");
    expect(stored).toHaveLength(1);
    expect(stored[0].args.p_fixture_external_id).toBe("1");
    expect(
      (stored[0].args.p_details as { statistics: unknown[] }).statistics.length,
    ).toBeGreaterThan(0);
    const begun = named(base, "begin_football_ingestion").find(
      (c) => (c.args.p_target_scope as { scope?: string }).scope === "staged",
    );
    expect(begun).toBeDefined();
    expect(
      (outcome.body.fantasy as { stagedDetails?: { stored: number } }).stagedDetails,
    ).toMatchObject({ stored: 1 });
  });
});
