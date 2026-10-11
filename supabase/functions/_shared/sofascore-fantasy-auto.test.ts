import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import type { LiveRefreshRpcClient } from "./football-live-refresh.ts";
import { createRapidApiClient } from "./rapidapi-client.ts";
import { BOTOLA_UNIQUE_TOURNAMENT_ID, SOFASCORE_LIVE_EVENTS_PATH } from "./sofascore-fixtures.ts";
import {
  FANTASY_MAX_ATTEMPTS_DEFAULT,
  SofascoreFantasyRun,
  readFantasyConfig,
  retryDelayMinutes,
  type SofascoreFantasyMode,
  type SofascoreRawReplies,
} from "./sofascore-fantasy-auto.ts";
import { parseSofascoreLineups } from "./sofascore-performance-parse.ts";
import { runSofascoreDetailsBackfill, runSofascoreRefresh } from "./sofascore-live-refresh.ts";

// The automatic Fantasy step: a finished match's replies (a real committed
// SofaScore match, 17132481, full coverage) become an observation with no extra
// request; a match held back is retried from the stored replies; nothing here
// can hold back a score or the match details. The database is a small in-memory
// stand-in for the four functions the step calls.

const EVENT = "17132481";
const SEASON = 102220;
const START = 1_790_000_000;
const NOW = new Date((START + 3 * 3600) * 1000);
const uuid = (prefix: string, n: number) =>
  `${prefix}0000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const FIXTURE = uuid("f", 1);
const HOME = uuid("7", 101);
const AWAY = uuid("7", 102);
const part = (name: string) =>
  JSON.parse(
    readFileSync(
      new URL(`../../../tests/fixtures/providers/sofascore/${EVENT}.${name}.json`, import.meta.url),
      "utf8",
    ),
  );
const REPLIES: SofascoreRawReplies = {
  incidents: part("incidents"),
  lineups: part("lineups"),
  statistics: part("statistics"),
};
const DETAIL = part("detail") as {
  event: { homeScore: { current: number }; awayScore: { current: number } };
};
const PLAYERS = parseSofascoreLineups(REPLIES.lineups).players.map((p) => p.externalId);
const STARTERS = parseSofascoreLineups(REPLIES.lineups)
  .players.filter((p) => p.starter)
  .map((p) => p.externalId);

interface World {
  mapped: Set<string>;
  status: string;
  finalized: boolean;
  gameweekStatus: string | null;
  adaptiveEnabled: boolean;
  observations: number;
  unreviewed: Set<string>;
}
const newWorld = (over: Partial<World> = {}): World => ({
  mapped: new Set(PLAYERS),
  status: "finished",
  finalized: true,
  gameweekStatus: "live",
  adaptiveEnabled: true,
  observations: 0,
  unreviewed: new Set(),
  ...over,
});

interface Attempt {
  status: string;
  attempts: number;
  matchData: unknown;
  outcome: string;
}
interface Options {
  world?: World;
  /** undefined: function missing (PGRST202); otherwise its answer. */
  autoMap?: "missing" | ((args: Record<string, unknown>, world: World) => unknown);
  recordError?: { code?: string; message?: string } | "throw";
  contextMissing?: boolean;
  dueCatchUp?: { fixtureId: string; eventId: string }[];
}
function fakeDb(options: Options = {}) {
  const world = options.world ?? newWorld();
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const attempts = new Map<string, Attempt>();
  const missing = {
    data: null,
    error: { code: "PGRST202", message: "Could not find the function" },
  };
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          switch (name) {
            case "service_sofascore_fantasy_context": {
              if (options.contextMissing) return Promise.resolve(missing);
              const ids = args.p_player_ids as string[];
              const attempt = attempts.get(String(args.p_fixture_id));
              return Promise.resolve({
                error: null,
                data: {
                  found: true,
                  sofascoreEventId: EVENT,
                  status: world.status,
                  finalized: world.finalized,
                  homeScore: DETAIL.event.homeScore.current,
                  awayScore: DETAIL.event.awayScore.current,
                  homeTeamId: HOME,
                  awayTeamId: AWAY,
                  gameweekStatus: world.gameweekStatus,
                  adaptiveEnabled: world.adaptiveEnabled,
                  observations: world.observations,
                  attempt: attempt
                    ? {
                        status: attempt.status,
                        attempts: attempt.attempts,
                        matchData: attempt.matchData,
                      }
                    : null,
                  players: ids
                    .filter((id) => world.mapped.has(id) || world.unreviewed.has(id))
                    .map((id) => ({
                      id: uuid("a", Number(id) % 100000),
                      externalId: id,
                      appPlayerId: uuid("5", Number(id) % 100000),
                      active: true,
                      reviewed: !world.unreviewed.has(id),
                      version: "test",
                      updatedAt: "2026-10-11T00:00:00.000Z",
                    })),
                },
              });
            }
            case "service_sofascore_fantasy_note": {
              const before = attempts.get(String(args.p_fixture_id));
              attempts.set(String(args.p_fixture_id), {
                status: String(args.p_status),
                attempts: (before?.attempts ?? 0) + 1,
                matchData:
                  args.p_status === "held"
                    ? (args.p_match_data ?? before?.matchData ?? null)
                    : null,
                outcome: String(args.p_outcome),
              });
              return Promise.resolve({ data: {}, error: null });
            }
            case "service_sofascore_fantasy_due":
              return Promise.resolve({
                error: null,
                data: {
                  retry: [...attempts.entries()]
                    .filter(([, a]) => a.status === "held" && a.matchData !== null)
                    .map(([id]) => id),
                  catchUp: options.dueCatchUp ?? [],
                },
              });
            case "service_sofascore_auto_map_players":
              if (options.autoMap === undefined || options.autoMap === "missing")
                return Promise.resolve(missing);
              return Promise.resolve({ error: null, data: options.autoMap(args, world) });
            case "service_record_sofascore_fantasy_observation":
              if (options.recordError === "throw") return Promise.reject(new Error("boom"));
              if (options.recordError)
                return Promise.resolve({ data: null, error: options.recordError });
              if (args.p_dry_run !== true) world.observations += 1;
              return Promise.resolve({
                error: null,
                data: { created: args.p_dry_run !== true, observationId: 1, fullReady: true },
              });
            default:
              return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
          }
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls, attempts, world };
}

function fakeRapid() {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    const detail = /^matches\/get-(incidents|lineups|statistics)\?matchId=\d+$/.exec(path);
    return detail
      ? Response.json(part(detail[1]), {
          headers: {
            "x-ratelimit-requests-limit": "10000",
            "x-ratelimit-requests-remaining": "5000",
          },
        })
      : new Response("{}", { status: 404 });
  };
  const rapid = createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0 });
  return { rapid, paths };
}

function makeRun(
  db: ReturnType<typeof fakeDb>,
  mode: SofascoreFantasyMode = "sofascore",
  environment: Record<string, string> = {},
) {
  const lines: Record<string, unknown>[] = [];
  const net = fakeRapid();
  const run = new SofascoreFantasyRun({
    mode,
    client: db.client,
    rapid: net.rapid,
    environment,
    now: NOW,
    log: (line) => lines.push(JSON.parse(line)),
  });
  return { run, lines, net };
}
const names = (db: ReturnType<typeof fakeDb>) => db.calls.map((c) => c.name);
const records = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter((c) => c.name === "service_record_sofascore_fantasy_observation");

describe("automatic Fantasy: a finished match", () => {
  test("is recorded from the replies already fetched, with no SofaScore request", async () => {
    const db = fakeDb();
    const { run, lines, net } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(net.paths).toEqual([]);
    expect(records(db)).toHaveLength(1);
    const call = records(db)[0].args as {
      p_fixture_id: string;
      p_dry_run: boolean;
      p_request: { sofascoreEventId: string; coverage: string; payload: { players: unknown[] } };
    };
    expect(call.p_fixture_id).toBe(FIXTURE);
    expect(call.p_dry_run).toBe(false);
    expect(call.p_request.sofascoreEventId).toBe(EVENT);
    expect(call.p_request.coverage).toBe("full");
    expect(call.p_request.payload.players.length).toBeGreaterThanOrEqual(22);
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "recorded", matchData: null });
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({
      event: "football_live_refresh_fantasy",
      mode: "sofascore",
      fixtureId: FIXTURE,
      eventId: EVENT,
      outcome: "recorded",
      source: "fresh",
      coverage: "full",
      expectedMode: "full",
    });
    expect(run.summary()).toMatchObject({ recorded: 1, held: 0, errors: 0, requests: 0 });
  });

  test("a fixture already observed is left alone", async () => {
    const db = fakeDb({ world: newWorld({ observations: 1 }) });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(records(db)).toHaveLength(0);
    expect(lines[0].outcome).toBe("skipped:already_observed");
  });

  test("a fixture that is not finished and finalized is skipped", async () => {
    for (const world of [
      newWorld({ status: "live_second_half" }),
      newWorld({ finalized: false }),
    ]) {
      const db = fakeDb({ world });
      const { run, lines } = makeRun(db);
      await run.fromReplies(FIXTURE, EVENT, REPLIES);
      expect(records(db)).toHaveLength(0);
      expect(lines[0].outcome).toBe("skipped:not_finalized");
    }
  });

  test("a gameweek that no longer takes observations ends the attempts", async () => {
    const db = fakeDb({ world: newWorld({ gameweekStatus: "finalizing" }) });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(records(db)).toHaveLength(0);
    expect(lines[0].outcome).toBe("skipped:gameweek_finalizing");
    expect(db.attempts.get(FIXTURE)?.status).toBe("gave_up");
  });

  test("adaptive scoring off for the gameweek holds the match with its replies kept", async () => {
    const db = fakeDb({ world: newWorld({ adaptiveEnabled: false }) });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0].outcome).toBe("held:adaptive_policy_not_enabled");
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "held" });
    expect(db.attempts.get(FIXTURE)?.matchData).not.toBeNull();
  });
});

describe("automatic Fantasy: a match held back is retried without a request", () => {
  test("unmapped players hold it, then a later tick records it from the stored replies", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[3]);
    world.mapped.delete(STARTERS[15]);
    const db = fakeDb({ world });
    const first = makeRun(db);
    await first.run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(first.lines[0]).toMatchObject({
      outcome: "held:unmapped_players",
      unmapped: 2,
      attempts: 1,
      retry: true,
      autoMap: "missing",
    });
    expect(records(db)).toHaveLength(0);
    const stored = db.attempts.get(FIXTURE);
    expect(stored).toMatchObject({ status: "held" });
    expect(stored?.matchData).toMatchObject({ version: 1 });
    // The retry time was set with a back-off.
    const note = db.calls.find((c) => c.name === "service_sofascore_fantasy_note")!;
    expect(note.args.p_next_retry_at).toBe(new Date(NOW.getTime() + 15 * 60_000).toISOString());

    // Later: the two players are mapped (a person reviewed them). A new tick sweeps.
    world.mapped.add(STARTERS[3]);
    world.mapped.add(STARTERS[15]);
    const second = makeRun(db);
    await second.run.sweep();
    expect(second.net.paths).toEqual([]);
    expect(second.lines).toHaveLength(1);
    expect(second.lines[0]).toMatchObject({ outcome: "recorded", source: "stored" });
    expect(records(db)).toHaveLength(1);
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "recorded", matchData: null });

    // And it is not picked up again.
    const third = makeRun(db);
    await third.run.sweep();
    expect(third.lines).toHaveLength(0);
  });

  test("still unmapped on the retry: held again, attempts counted, no request", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[0]);
    const db = fakeDb({ world });
    await makeRun(db).run.fromReplies(FIXTURE, EVENT, REPLIES);
    const retry = makeRun(db);
    await retry.run.sweep();
    expect(retry.lines[0]).toMatchObject({ outcome: "held:unmapped_players", attempts: 2 });
    expect(retry.net.paths).toEqual([]);
    expect(db.attempts.get(FIXTURE)?.attempts).toBe(2);
  });

  test("it stops after the maximum number of attempts", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[0]);
    const db = fakeDb({ world });
    await makeRun(db).run.fromReplies(FIXTURE, EVENT, REPLIES);
    db.attempts.get(FIXTURE)!.attempts = FANTASY_MAX_ATTEMPTS_DEFAULT - 1;
    const last = makeRun(db);
    await last.run.sweep();
    expect(last.lines[0]).toMatchObject({ outcome: "held:unmapped_players", retry: false });
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "gave_up", matchData: null });
    const after = makeRun(db);
    await after.run.sweep();
    expect(after.lines).toHaveLength(0);
  });

  test("a data problem the same replies cannot fix is not retried", async () => {
    const lineups = JSON.parse(JSON.stringify(REPLIES.lineups)) as {
      home: { players: { substitute: boolean }[] };
    };
    lineups.home.players.find((p) => p.substitute === false)!.substitute = true;
    const db = fakeDb();
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, { ...REPLIES, lineups });
    expect(lines[0].outcome).toBe("held:appearance_unexplained");
    expect(lines[0].retry).toBe(false);
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "gave_up", matchData: null });
  });

  test("the database refusing an identity keeps the replies for a retry", async () => {
    const db = fakeDb({ recordError: { message: "sofascore_identity_not_reviewed" } });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({
      outcome: "held:sofascore_identity_not_reviewed",
      retry: true,
    });
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "held" });
  });

  test("a refusal that needs a person ends the attempts", async () => {
    const db = fakeDb({ recordError: { message: "adaptive_statistics_inconsistent" } });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0].outcome).toBe("held:adaptive_statistics_inconsistent");
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "gave_up" });
  });
});

describe("automatic Fantasy: the player auto-mapping", () => {
  test("is skipped, and the run continues, when the function does not exist", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[2]);
    const db = fakeDb({ world, autoMap: "missing" });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(names(db)).toContain("service_sofascore_auto_map_players");
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players", autoMap: "missing" });
    // Only asked once per run.
    const other = uuid("f", 2);
    await run.fromReplies(other, EVENT, REPLIES);
    expect(names(db).filter((n) => n === "service_sofascore_auto_map_players")).toHaveLength(1);
  });

  test("is called before building, and its mappings are read again", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[2]);
    world.mapped.delete(STARTERS[14]);
    const db = fakeDb({
      world,
      autoMap: (args, w) => {
        const players = args.p_players as { sofascorePlayerId: string; appeared: boolean }[];
        for (const p of players) w.mapped.add(p.sofascorePlayerId);
        return {
          mapped: players.map((p) => ({ sofascorePlayerId: p.sofascorePlayerId, playerId: "x" })),
          queued: 0,
          conflicts: 0,
        };
      },
    });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    const order = names(db);
    expect(order.indexOf("service_sofascore_auto_map_players")).toBeLessThan(
      order.indexOf("service_record_sofascore_fantasy_observation"),
    );
    expect(order.filter((n) => n === "service_sofascore_fantasy_context")).toHaveLength(2);
    const sent = db.calls.find((c) => c.name === "service_sofascore_auto_map_players")!.args as {
      p_fixture_id: string;
      p_players: Record<string, unknown>[];
    };
    expect(sent.p_fixture_id).toBe(FIXTURE);
    expect(sent.p_players.map((p) => p.sofascorePlayerId).sort()).toEqual(
      [STARTERS[2], STARTERS[14]].sort(),
    );
    expect(Object.keys(sent.p_players[0]).sort()).toEqual(
      [
        "appeared",
        "name",
        "position",
        "shirtNumber",
        "shortName",
        "side",
        "sofascorePlayerId",
      ].sort(),
    );
    expect(sent.p_players.every((p) => p.appeared === true)).toBe(true);
    expect(lines[0]).toMatchObject({
      outcome: "recorded",
      autoMap: "mapped=2,queued=0,conflicts=0",
    });
  });

  test("is not called when every appearing player is already mapped", async () => {
    const db = fakeDb({ autoMap: () => ({ mapped: [], queued: 0, conflicts: 0 }) });
    await makeRun(db).run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(names(db)).not.toContain("service_sofascore_auto_map_players");
  });

  test("a mapping that is not reviewed does not count as mapped", async () => {
    const world = newWorld();
    world.unreviewed.add(STARTERS[1]);
    world.mapped.delete(STARTERS[1]);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0].outcome).toBe("held:unmapped_players");
  });
});

describe("automatic Fantasy: shadow", () => {
  test("asks the database as a dry run, logs, and writes and maps nothing", async () => {
    const world = newWorld();
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db, "shadow");
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(records(db)).toHaveLength(1);
    expect(records(db)[0].args.p_dry_run).toBe(true);
    expect(names(db)).not.toContain("service_sofascore_fantasy_note");
    expect(names(db)).not.toContain("service_sofascore_auto_map_players");
    expect(world.observations).toBe(0);
    expect(lines[0]).toMatchObject({ mode: "shadow", outcome: "skipped:shadow_dry_run_ok" });
    await run.sweep();
    expect(names(db)).not.toContain("service_sofascore_fantasy_due");
  });

  test("a held match is logged and nothing is stored", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[0]);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db, "shadow");
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0].outcome).toBe("held:unmapped_players");
    expect(names(db)).toEqual(["service_sofascore_fantasy_context"]);
  });
});

describe("automatic Fantasy: it never breaks anything else", () => {
  test("a database that throws, or refuses to answer, ends in a log line, not an exception", async () => {
    const throwing = fakeDb({ recordError: "throw" });
    const a = makeRun(throwing);
    await a.run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(a.lines[0].outcome).toBe("held:database_unavailable");
    const unreadable = { schema: () => ({ rpc: () => Promise.reject(new Error("down")) }) };
    const b = new SofascoreFantasyRun({
      mode: "sofascore",
      client: unreadable as unknown as LiveRefreshRpcClient,
      rapid: fakeRapid().rapid,
      environment: {},
      now: NOW,
      log: () => {
        throw new Error("log broke");
      },
    });
    await b.fromReplies(FIXTURE, EVENT, REPLIES);
    await b.sweep();
    expect(b.summary().errors + b.summary().skipped).toBeGreaterThan(0);
  });

  test("replies that do not parse are counted as an error and the attempt is noted", async () => {
    const db = fakeDb();
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, { ...REPLIES, incidents: { nope: true } });
    expect(lines[0].outcome).toBe("error:invalid_provider_payload");
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "held", matchData: null });
    await run.fromReplies(uuid("f", 2), EVENT, { ...REPLIES, lineups: null });
    expect(lines[1].outcome).toBe("error:lineups_unavailable");
  });

  test("a database without the state functions is skipped, once, and nothing is written", async () => {
    const db = fakeDb({ contextMissing: true });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    await run.fromReplies(uuid("f", 2), EVENT, REPLIES);
    await run.sweep();
    expect(lines).toHaveLength(1);
    expect(lines[0].outcome).toBe("skipped:state_function_missing");
    expect(records(db)).toHaveLength(0);
  });

  test("SOFASCORE_FANTASY_ENABLED=false does nothing at all", async () => {
    const db = fakeDb();
    const { run, lines } = makeRun(db, "sofascore", { SOFASCORE_FANTASY_ENABLED: "false" });
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    await run.sweep();
    expect(db.calls).toHaveLength(0);
    expect(lines).toHaveLength(0);
  });
});

describe("automatic Fantasy: catch-up of a finished match never attempted", () => {
  const listed = [1, 2, 3].map((n) => ({ fixtureId: uuid("f", n), eventId: EVENT }));

  test("fetches at most the per-tick cap, 3 requests each, then records", async () => {
    const db = fakeDb({ dueCatchUp: listed });
    const { run, lines, net } = makeRun(db);
    await run.sweep();
    expect(net.paths).toEqual([
      `matches/get-incidents?matchId=${EVENT}`,
      `matches/get-lineups?matchId=${EVENT}`,
      `matches/get-statistics?matchId=${EVENT}`,
    ]);
    expect(lines[0]).toMatchObject({ outcome: "recorded", source: "catch_up" });
    expect(run.summary().requests).toBe(3);
  });

  test("the cap and the window come from the environment", async () => {
    const db = fakeDb({ dueCatchUp: listed });
    const { run, net } = makeRun(db, "sofascore", { SOFASCORE_FANTASY_CATCHUP_PER_TICK: "2" });
    await run.sweep();
    expect(net.paths).toHaveLength(6);
    const due = db.calls.find((c) => c.name === "service_sofascore_fantasy_due")!.args;
    expect(due).toMatchObject({ p_catchup_limit: 2, p_hours: 72, p_max_attempts: 24 });
    const off = makeRun(fakeDb({ dueCatchUp: listed }), "sofascore", {
      SOFASCORE_FANTASY_CATCHUP_PER_TICK: "0",
    });
    await off.run.sweep();
    expect(off.net.paths).toEqual([]);
  });

  test("a quota refusal stops the catch-up and is not counted against the fixture", async () => {
    const db = fakeDb({ dueCatchUp: listed });
    const lines: Record<string, unknown>[] = [];
    const refuse = createRapidApiClient(
      "sofascore",
      { RAPIDAPI_KEY: "k" },
      {
        fetch: async () =>
          Response.json(
            {},
            {
              headers: {
                "x-ratelimit-requests-limit": "10000",
                "x-ratelimit-requests-remaining": "5",
              },
            },
          ),
        maxRetries: 0,
      },
    );
    const run = new SofascoreFantasyRun({
      mode: "sofascore",
      client: db.client,
      rapid: refuse,
      environment: { SOFASCORE_FANTASY_CATCHUP_PER_TICK: "3" },
      now: NOW,
      log: (line) => lines.push(JSON.parse(line)),
    });
    await run.sweep();
    expect(lines).toHaveLength(1);
    expect(lines[0].outcome).toBe("error:provider_rate_limited");
    expect(names(db)).not.toContain("service_sofascore_fantasy_note");
  });
});

describe("configuration", () => {
  test("defaults, bounds and the back-off", () => {
    expect(readFantasyConfig({})).toEqual({
      enabled: true,
      retriesPerTick: 6,
      catchUpPerTick: 1,
      catchUpHours: 72,
      maxAttempts: 24,
      fetchAttempts: 4,
    });
    expect(
      readFantasyConfig({
        SOFASCORE_FANTASY_ENABLED: "off",
        SOFASCORE_FANTASY_RETRIES_PER_TICK: "99",
        SOFASCORE_FANTASY_CATCHUP_PER_TICK: "x",
        SOFASCORE_FANTASY_MAX_ATTEMPTS: "0",
      }),
    ).toMatchObject({ enabled: false, retriesPerTick: 6, catchUpPerTick: 1, maxAttempts: 24 });
    expect([1, 3, 4, 12, 13, 30].map(retryDelayMinutes)).toEqual([15, 15, 60, 60, 360, 360]);
  });
});

// ---------------------------------------------------------------------------
// Through the Edge tick: a finished match writes its score, its details and
// its Fantasy observation, and a Fantasy failure changes none of that.

const fixtureEvent = {
  id: Number(EVENT),
  startTimestamp: START,
  status: { code: 100, type: "finished", description: "Ended" },
  roundInfo: { round: 4 },
  tournament: { id: 1, uniqueTournament: { id: BOTOLA_UNIQUE_TOURNAMENT_ID } },
  season: { id: SEASON },
  homeTeam: { id: 101 },
  awayTeam: { id: 102 },
  changes: { changeTimestamp: START + 6000 },
  homeScore: { current: DETAIL.event.homeScore.current },
  awayScore: { current: DETAIL.event.awayScore.current },
};
const mapping = (type: string, external: string, internal: string) => ({
  provider_name: "sofascore",
  entity_type: type,
  external_id: external,
  internal_entity_id: internal,
  active: true,
});

function tickDb(fantasyRecordThrows: boolean, fixtureOverride: Record<string, unknown> = {}) {
  const world = newWorld();
  const inner = fakeDb({ world, recordError: fantasyRecordThrows ? "throw" : undefined });
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const snapshot = {
    mappings: [
      mapping("competition", "937", uuid("c", 1)),
      mapping("season", String(SEASON), uuid("5", 1)),
      mapping("round", `${SEASON}:4`, uuid("a", 4)),
      mapping("team", "101", HOME),
      mapping("team", "102", AWAY),
      mapping("fixture", EVENT, FIXTURE),
    ],
    fixtures: [
      {
        id: FIXTURE,
        externalId: EVENT,
        kickoffAt: new Date(START * 1000).toISOString(),
        status: "live_second_half",
        period: "second_half",
        homeScore: 0,
        awayScore: 0,
        providerUpdatedAt: new Date((START + 100) * 1000).toISOString(),
        sourceSequence: (START + 100) * 1000,
        finalizedAt: null,
        homeTeamId: HOME,
        awayTeamId: AWAY,
        ...fixtureOverride,
      },
    ],
  };
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          switch (name) {
            case "football_sofascore_live_snapshot":
              return Promise.resolve({ data: snapshot, error: null });
            case "begin_football_ingestion":
              return Promise.resolve({ data: uuid("9", 1), error: null });
            case "ingest_football_fixture":
              return Promise.resolve({ data: FIXTURE, error: null });
            case "ingest_football_match_details":
              return Promise.resolve({ data: { outcome: "stored", events: 1 }, error: null });
            case "complete_football_ingestion":
              return Promise.resolve({ data: null, error: null });
            case "service_football_match_details_due":
              return Promise.resolve({ data: [{ externalId: EVENT }], error: null });
            default:
              return (
                inner.client as unknown as {
                  schema(n: string): { rpc(n: string, a: unknown): Promise<unknown> };
                }
              )
                .schema("api")
                .rpc(name, args);
          }
        },
      };
    },
  } as unknown as LiveRefreshRpcClient;
  return { client, calls, world };
}

function tickFetch() {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    const headers = {
      "x-ratelimit-requests-limit": "10000",
      "x-ratelimit-requests-remaining": "5000",
    };
    const detail = /^matches\/get-(incidents|lineups|statistics)\?matchId=\d+$/.exec(path);
    if (detail) return Response.json(part(detail[1]), { headers });
    if (path.startsWith(SOFASCORE_LIVE_EVENTS_PATH))
      return Response.json({ events: [fixtureEvent] }, { headers });
    return Response.json({ events: [] }, { headers });
  };
  return { fetch, paths };
}

describe("automatic Fantasy: through the live tick", () => {
  for (const throws of [false, true]) {
    test(`a finished match: score, details and ${throws ? "a failing Fantasy step" : "its observation"}`, async () => {
      const db = tickDb(throws);
      const net = tickFetch();
      const lines: string[] = [];
      const outcome = await runSofascoreRefresh({
        mode: "sofascore",
        job: "fixtures",
        client: db.client,
        rapid: createRapidApiClient(
          "sofascore",
          { RAPIDAPI_KEY: "k" },
          { fetch: net.fetch, maxRetries: 0 },
        ),
        environment: {},
        now: NOW,
        log: (line) => lines.push(line),
      });
      const called = db.calls.map((c) => c.name);
      // Score and details are written either way, and the tick succeeds.
      expect(outcome.status).toBe(200);
      expect(called).toContain("ingest_football_fixture");
      expect(called).toContain("ingest_football_match_details");
      // Exactly one live list and the three replies of one match: nothing extra for Fantasy.
      expect(net.paths).toHaveLength(4);
      expect(called.indexOf("ingest_football_fixture")).toBeLessThan(
        called.indexOf("service_sofascore_fantasy_context"),
      );
      const fantasyLines = lines
        .map((l) => JSON.parse(l))
        .filter((l) => l.event === "football_live_refresh_fantasy");
      expect(fantasyLines).toHaveLength(1);
      expect(fantasyLines[0].outcome).toBe(throws ? "held:database_unavailable" : "recorded");
      expect(outcome.body.fantasy).toMatchObject({ mode: "sofascore" });
    });
  }

  test("the backfill feeds the Fantasy step with the same replies", async () => {
    const db = tickDb(false, {
      status: "finished",
      finalizedAt: new Date(NOW.getTime() - 3600_000).toISOString(),
    });
    const net = tickFetch();
    const outcome = await runSofascoreDetailsBackfill({
      mode: "sofascore",
      client: db.client,
      rapid: createRapidApiClient(
        "sofascore",
        { RAPIDAPI_KEY: "k" },
        { fetch: net.fetch, maxRetries: 0 },
      ),
      environment: {},
      now: NOW,
      log: () => {},
    });
    expect(outcome.status).toBe(200);
    expect(net.paths).toHaveLength(3);
    expect(db.calls.map((c) => c.name)).toContain("service_record_sofascore_fantasy_observation");
    expect(outcome.body.fantasy).toMatchObject({ recorded: 1 });
  });
});
