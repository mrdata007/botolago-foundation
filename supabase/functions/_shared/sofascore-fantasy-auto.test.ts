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
// Starters who scored (895127 a penalty for the home side, 1939981 for the away side): an
// unmapped scorer can never be left out of the request, so he always holds the match.
const HOME_SCORER = "895127";
const AWAY_SCORER = "1939981";

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
  /** The Pépites sync: undefined or "missing" is PGRST202; otherwise its answer (or an error). */
  performances?:
    | "missing"
    | "throw"
    | ((args: Record<string, unknown>) => { data?: unknown; error?: { message: string } });
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
            case "service_sync_sofascore_player_performances": {
              if (options.performances === undefined || options.performances === "missing")
                return Promise.resolve(missing);
              if (options.performances === "throw") return Promise.reject(new Error("boom"));
              const answer = options.performances(args);
              return Promise.resolve({ data: answer.data ?? null, error: answer.error ?? null });
            }
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
  // `lines` are the Fantasy lines; the Pépites sync logs its own event (`performanceLines`).
  const lines: Record<string, unknown>[] = [];
  const performanceLines: Record<string, unknown>[] = [];
  const net = fakeRapid();
  const run = new SofascoreFantasyRun({
    mode,
    client: db.client,
    rapid: net.rapid,
    environment,
    now: NOW,
    log: (line) => {
      const parsed = JSON.parse(line) as Record<string, unknown>;
      (parsed.event === "football_live_refresh_performances" ? performanceLines : lines).push(
        parsed,
      );
    },
  });
  return { run, lines, performanceLines, net };
}
const names = (db: ReturnType<typeof fakeDb>) => db.calls.map((c) => c.name);
const records = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter((c) => c.name === "service_record_sofascore_fantasy_observation");
const syncs = (db: ReturnType<typeof fakeDb>) =>
  db.calls.filter((c) => c.name === "service_sync_sofascore_player_performances");
const written = (fixtureId: string) => ({
  data: {
    results: [
      {
        fixtureId,
        outcome: "written",
        rows: 22,
        replaced: 0,
        rated: 20,
        unknownFields: { assists: 0, penaltiesMissed: 0, goalkeeperSaves: 0 },
      },
    ],
  },
});

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

describe("automatic Fantasy: unknown substitutes (no app player)", () => {
  // 2161842 came on at 86' for 544156 and has no goal, assist or card; 1919299 came on and scored.
  const UNKNOWN_SUB = "2161842";
  const UNKNOWN_SCORER = "1919299";

  test("an unmapped substitute with no scoring trace does not hold the match: it is recorded with the exclusion listed", async () => {
    const world = newWorld();
    world.mapped.delete(UNKNOWN_SUB);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(records(db)).toHaveLength(1);
    const payload = (
      records(db)[0].args as {
        p_request: {
          payload: {
            squadComplete?: boolean;
            squadCompleteExceptExcluded?: boolean;
            excludedUnmappedPlayers: { sofascoreId: string; reason: string }[];
            players: { identity: { sofascoreId: string }; stats: Record<string, unknown> }[];
          };
        };
      }
    ).p_request.payload;
    expect(payload.squadComplete).toBeUndefined();
    expect(payload.squadCompleteExceptExcluded).toBe(true);
    expect(payload.excludedUnmappedPlayers).toEqual([
      expect.objectContaining({ sofascoreId: UNKNOWN_SUB, reason: "no_candidate" }),
    ]);
    expect(payload.players.some((r) => r.identity.sofascoreId === UNKNOWN_SUB)).toBe(false);
    // The player he replaced keeps his minutes.
    expect(payload.players.find((r) => r.identity.sofascoreId === "544156")?.stats.minutes).toBe(
      86,
    );
    expect(lines[0]).toMatchObject({
      outcome: "recorded",
      excludedUnmapped: [UNKNOWN_SUB],
    });
  });

  test("the database refusing the exclusion keeps the match held, retried later like any hold", async () => {
    const world = newWorld();
    world.mapped.delete(UNKNOWN_SUB);
    const db = fakeDb({
      world,
      recordError: { code: "PT409", message: "sofascore_unmapped_exclusion_refused" },
    });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({
      outcome: "held:sofascore_unmapped_exclusion_refused",
      excludedUnmapped: [UNKNOWN_SUB],
      retry: true,
    });
    expect(db.attempts.get(FIXTURE)).toMatchObject({ status: "held" });
    expect(db.attempts.get(FIXTURE)?.matchData).not.toBeNull();
    expect(world.observations).toBe(0);
  });

  test("an unmapped substitute who scored still holds the match, and nothing is sent", async () => {
    const world = newWorld();
    world.mapped.delete(UNKNOWN_SCORER);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players", unmapped: 1 });
    expect(records(db)).toHaveLength(0);
  });

  test("minute overrides are logged even when an unmapped scorer holds the match", async () => {
    const world = newWorld();
    world.mapped.delete(UNKNOWN_SCORER);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    const lineups = part("lineups") as {
      home: { players: { player: { id: number }; statistics: { minutesPlayed: number } }[] };
    };
    // This mapped goalkeeper played the full match; the provider's 30 minutes
    // therefore override his timeline while the unrelated scorer stays unmapped.
    lineups.home.players.find((p) => p.player.id === 1140820)!.statistics.minutesPlayed = 30;
    await run.fromReplies(FIXTURE, EVENT, { ...REPLIES, lineups });
    expect(lines[0]).toMatchObject({
      outcome: "held:unmapped_players",
      unmapped: 1,
      minutesFromSofascore: 1,
    });
    expect(records(db)).toHaveLength(0);
    expect(world.observations).toBe(0);
  });

  test("an unmapped starter with no scoring trace is left out as an anonymous starter of his club", async () => {
    const world = newWorld();
    world.mapped.delete(STARTERS[3]);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "recorded", excludedUnmapped: [STARTERS[3]] });
    const payload = (
      records(db)[0].args as {
        p_request: {
          payload: {
            anonymousStarters: number;
            anonymousByTeam: Record<string, number>;
            excludedUnmappedPlayers: { sofascoreId: string; started?: boolean }[];
          };
        };
      }
    ).p_request.payload;
    expect(payload.anonymousStarters).toBe(1);
    expect(payload.anonymousByTeam).toEqual({ [HOME]: 1 });
    expect(payload.excludedUnmappedPlayers).toEqual([
      expect.objectContaining({ sofascoreId: STARTERS[3], started: true }),
    ]);
  });

  test("an unmapped starter who scored still holds the match", async () => {
    const world = newWorld();
    world.mapped.delete(HOME_SCORER);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players" });
    expect(records(db)).toHaveLength(0);
  });

  test("three unmapped starters on one side hold the match", async () => {
    const world = newWorld();
    // Three home starters with no goal, assist or card.
    for (const id of ["1004523", "1004426", "970766"]) world.mapped.delete(id);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players", unmapped: 3 });
    expect(records(db)).toHaveLength(0);
  });

  test("an unknown substitute and an unknown scorer together send nothing", async () => {
    const world = newWorld();
    world.mapped.delete(UNKNOWN_SUB);
    world.mapped.delete(UNKNOWN_SCORER);
    const db = fakeDb({ world });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players", unmapped: 2 });
    expect(records(db)).toHaveLength(0);
  });
});

describe("automatic Fantasy: a match held back is retried without a request", () => {
  test("unmapped players hold it, then a later tick records it from the stored replies", async () => {
    const world = newWorld();
    world.mapped.delete(HOME_SCORER);
    world.mapped.delete(AWAY_SCORER);
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
    world.mapped.add(HOME_SCORER);
    world.mapped.add(AWAY_SCORER);
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
    world.mapped.delete(HOME_SCORER);
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
    world.mapped.delete(HOME_SCORER);
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
    world.mapped.delete(HOME_SCORER);
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
    world.unreviewed.add(HOME_SCORER);
    world.mapped.delete(HOME_SCORER);
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
    world.mapped.delete(HOME_SCORER);
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
      log: (line) => {
        const parsed = JSON.parse(line) as Record<string, unknown>;
        if (parsed.event === "football_live_refresh_fantasy") lines.push(parsed);
      },
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
      performancesPerTick: 20,
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

  test("a match in play: its lineup players are offered to the matching, nothing is recorded", async () => {
    const db = tickDb(false);
    db.world.mapped.delete(STARTERS[2]);
    const net = tickFetch();
    const lines: string[] = [];
    const live = {
      ...fixtureEvent,
      status: { code: 7, type: "inprogress", description: "2nd half" },
    };
    const fetch = async (input: string) => {
      const url = new URL(input);
      const path = url.pathname.slice(1) + url.search;
      if (path.startsWith(SOFASCORE_LIVE_EVENTS_PATH)) {
        net.paths.push(path);
        return Response.json(
          { events: [live] },
          {
            headers: {
              "x-ratelimit-requests-limit": "10000",
              "x-ratelimit-requests-remaining": "5000",
            },
          },
        );
      }
      return net.fetch(input);
    };
    const outcome = await runSofascoreRefresh({
      mode: "sofascore",
      job: "fixtures",
      client: db.client,
      rapid: createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0 }),
      environment: {},
      now: NOW,
      log: (line) => lines.push(line),
    });
    expect(outcome.status).toBe(200);
    const called = db.calls.map((c) => c.name);
    expect(called).toContain("ingest_football_match_details");
    // The live list and the three replies of the match: the matching adds no request.
    expect(net.paths).toHaveLength(4);
    const parsed = lines.map((l) => JSON.parse(l) as Record<string, unknown>);
    expect(parsed.filter((l) => l.event === "football_live_refresh_live_matching")).toEqual([
      expect.objectContaining({ fixtureId: FIXTURE, eventId: EVENT, outcome: "offered" }),
    ]);
    expect(parsed.filter((l) => l.event === "football_live_refresh_fantasy")).toHaveLength(0);
    expect(called).not.toContain("service_record_sofascore_fantasy_observation");
  });

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

// Pépites: the same observation feeds app.player_fixture_performances through
// api.service_sync_sofascore_player_performances. The database derives the rows,
// so no SofaScore request is made and a failure never changes the Fantasy outcome.
describe("automatic Fantasy: Pépites performances", () => {
  test("right after a recording, one call for that fixture with the ratings of the replies", async () => {
    const db = fakeDb({ performances: () => written(FIXTURE) });
    const { run, lines, performanceLines, net } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(net.paths).toEqual([]);
    expect(names(db).indexOf("service_sync_sofascore_player_performances")).toBeGreaterThan(
      names(db).indexOf("service_record_sofascore_fantasy_observation"),
    );
    expect(syncs(db)).toHaveLength(1);
    const args = syncs(db)[0].args as {
      p_fixture_id: string;
      p_limit: number;
      p_ratings: Record<string, number>;
    };
    expect(args.p_fixture_id).toBe(FIXTURE);
    expect(args.p_limit).toBe(1);
    // Every lineup player SofaScore rated, by SofaScore id; nothing outside 0..10.
    const rated = parseSofascoreLineups(REPLIES.lineups).players.filter(
      (p) => typeof p.stats?.rating === "number",
    );
    expect(Object.keys(args.p_ratings).sort()).toEqual(rated.map((p) => p.externalId).sort());
    expect(Object.values(args.p_ratings).every((r) => r >= 0 && r <= 10)).toBe(true);
    expect(args.p_ratings["1140820"]).toBe(5.9);
    expect(lines).toHaveLength(1);
    expect(lines[0]).toMatchObject({ outcome: "recorded" });
    expect(performanceLines).toHaveLength(1);
    expect(performanceLines[0]).toMatchObject({
      event: "football_live_refresh_performances",
      fixtureId: FIXTURE,
      eventId: EVENT,
      source: "fresh",
      outcome: "written",
      rows: 22,
    });
    expect(run.summary().performances).toEqual({
      written: 1,
      unchanged: 0,
      rated: 0,
      refused: 0,
      errors: 0,
    });
    expect(run.summary()).toMatchObject({ recorded: 1, requests: 0 });
  });

  test("a refusal or a database failure never changes the Fantasy outcome", async () => {
    const refusal = fakeDb({
      performances: () => ({ error: { message: "sofascore_performances_identity_not_reviewed" } }),
    });
    const a = makeRun(refusal);
    await a.run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(a.lines).toHaveLength(1);
    expect(a.lines[0]).toMatchObject({ outcome: "recorded" });
    expect(refusal.attempts.get(FIXTURE)).toMatchObject({ status: "recorded" });
    expect(a.run.summary()).toMatchObject({ recorded: 1, errors: 0 });
    expect(a.run.summary().performances).toMatchObject({ refused: 1, errors: 0 });
    expect(a.performanceLines[0]).toMatchObject({
      outcome: "error:sofascore_performances_identity_not_reviewed",
    });

    const down = fakeDb({ performances: "throw" });
    const b = makeRun(down);
    await b.run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(b.lines[0]).toMatchObject({ outcome: "recorded" });
    expect(b.run.summary()).toMatchObject({ recorded: 1, errors: 0 });
    expect(b.run.summary().performances).toMatchObject({ refused: 0, errors: 1 });
    expect(b.performanceLines[0]).toMatchObject({ outcome: "error:database_unavailable" });
  });

  test("a database without the function skips it once, with one log line", async () => {
    const db = fakeDb(); // performances: missing
    const { run, lines, performanceLines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    await run.fromReplies(uuid("f", 2), EVENT, REPLIES);
    await run.sweep();
    expect(syncs(db)).toHaveLength(1);
    expect(performanceLines).toHaveLength(1);
    expect(performanceLines[0]).toMatchObject({ outcome: "skipped:performances_function_missing" });
    expect(lines.map((l) => l.outcome)).toEqual(["recorded", "skipped:already_observed"]);
    expect(run.summary().performances).toEqual({
      written: 0,
      unchanged: 0,
      rated: 0,
      refused: 0,
      errors: 0,
    });
  });

  test("a fixture Fantasy already observed is still offered to Pépites, with the fresh ratings", async () => {
    const db = fakeDb({
      world: newWorld({ observations: 1 }),
      performances: () => ({
        data: { results: [{ fixtureId: FIXTURE, outcome: "rated", rows: 22, rated: 2 }] },
      }),
    });
    const { run, lines, performanceLines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(records(db)).toHaveLength(0);
    expect(lines[0]).toMatchObject({ outcome: "skipped:already_observed" });
    expect(syncs(db)).toHaveLength(1);
    expect((syncs(db)[0].args as { p_ratings: unknown }).p_ratings).toBeDefined();
    expect(performanceLines[0]).toMatchObject({ outcome: "rated", rated: 2 });
    expect(run.summary().performances).toMatchObject({ rated: 1 });
  });

  test("a recorded attempt is offered too; an unfinished or unfinalized fixture never is", async () => {
    const db = fakeDb({ performances: () => written(FIXTURE) });
    db.attempts.set(FIXTURE, {
      status: "recorded",
      attempts: 1,
      matchData: null,
      outcome: "recorded",
    });
    const first = makeRun(db);
    await first.run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(syncs(db)).toHaveLength(1);
    for (const over of [{ status: "live_first_half" }, { finalized: false }]) {
      const other = fakeDb({
        world: newWorld({ observations: 1, ...over }),
        performances: () => written(FIXTURE),
      });
      await makeRun(other).run.fromReplies(FIXTURE, EVENT, REPLIES);
      expect(syncs(other)).toHaveLength(0);
    }
  });

  test("a held fixture is not offered (there is no observation)", async () => {
    const db = fakeDb({
      world: newWorld({ mapped: new Set(STARTERS.slice(1)) }),
      performances: () => written(FIXTURE),
    });
    const { run, lines } = makeRun(db);
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    expect(lines[0]).toMatchObject({ outcome: "held:unmapped_players" });
    expect(syncs(db)).toHaveLength(0);
  });

  test("the sweep asks for the fixtures that need rows, after the retries, with no request", async () => {
    const db = fakeDb({
      performances: () => ({
        data: {
          results: [
            { fixtureId: uuid("f", 7), outcome: "written", rows: 22, replaced: 0, rated: 0 },
            { fixtureId: uuid("f", 8), outcome: "unchanged", rows: 22, replaced: 0, rated: 0 },
            {
              fixtureId: uuid("f", 9),
              outcome: "refused",
              reason: "sofascore_performances_other_provider_rows",
            },
          ],
        },
      }),
    });
    const { run, performanceLines, net } = makeRun(db);
    await run.sweep();
    expect(net.paths).toEqual([]);
    const order = names(db);
    expect(order.indexOf("service_sync_sofascore_player_performances")).toBeGreaterThan(
      order.indexOf("service_sofascore_fantasy_due"),
    );
    expect(syncs(db)).toHaveLength(1);
    expect(syncs(db)[0].args).toEqual({ p_limit: 20 });
    expect(performanceLines.map((l) => l.outcome)).toEqual([
      "written",
      "unchanged",
      "refused:sofascore_performances_other_provider_rows",
    ]);
    expect(performanceLines.map((l) => l.fixtureId)).toEqual([
      uuid("f", 7),
      uuid("f", 8),
      uuid("f", 9),
    ]);
    expect(run.summary().performances).toEqual({
      written: 1,
      unchanged: 1,
      rated: 0,
      refused: 1,
      errors: 0,
    });
  });

  test("the sweep still syncs when the Fantasy state functions are missing or retries are off", async () => {
    const db = fakeDb({ contextMissing: true, performances: () => ({ data: { results: [] } }) });
    await makeRun(db).run.sweep();
    expect(syncs(db)).toHaveLength(1);
    const off = fakeDb({ performances: () => ({ data: { results: [] } }) });
    await makeRun(off, "sofascore", {
      SOFASCORE_FANTASY_RETRIES_PER_TICK: "0",
      SOFASCORE_FANTASY_CATCHUP_PER_TICK: "0",
    }).run.sweep();
    expect(names(off)).toEqual(["service_sync_sofascore_player_performances"]);
  });

  test("SOFASCORE_PEPITES_SYNC_PER_TICK sets the batch, 0 switches the sync off", async () => {
    expect(readFantasyConfig({}).performancesPerTick).toBe(20);
    expect(readFantasyConfig({ SOFASCORE_PEPITES_SYNC_PER_TICK: "7" }).performancesPerTick).toBe(7);
    expect(readFantasyConfig({ SOFASCORE_PEPITES_SYNC_PER_TICK: "51" }).performancesPerTick).toBe(
      20,
    );
    expect(readFantasyConfig({ SOFASCORE_PEPITES_SYNC_PER_TICK: "x" }).performancesPerTick).toBe(
      20,
    );
    const db = fakeDb({ performances: () => ({ data: { results: [] } }) });
    const { run } = makeRun(db, "sofascore", { SOFASCORE_PEPITES_SYNC_PER_TICK: "0" });
    await run.fromReplies(FIXTURE, EVENT, REPLIES);
    await run.sweep();
    expect(syncs(db)).toHaveLength(0);
    const batch = fakeDb({ performances: () => ({ data: { results: [] } }) });
    await makeRun(batch, "sofascore", { SOFASCORE_PEPITES_SYNC_PER_TICK: "7" }).run.sweep();
    expect(syncs(batch)[0].args).toEqual({ p_limit: 7 });
  });

  test("shadow mode and a switched-off path never call it", async () => {
    const shadow = fakeDb({ performances: () => ({ data: { results: [] } }) });
    const a = makeRun(shadow, "shadow");
    await a.run.fromReplies(FIXTURE, EVENT, REPLIES);
    await a.run.sweep();
    expect(syncs(shadow)).toHaveLength(0);
    const disabled = fakeDb({ performances: () => ({ data: { results: [] } }) });
    const b = makeRun(disabled, "sofascore", { SOFASCORE_FANTASY_ENABLED: "false" });
    await b.run.fromReplies(FIXTURE, EVENT, REPLIES);
    await b.run.sweep();
    expect(disabled.calls).toHaveLength(0);
  });
});

describe("automatic Fantasy: players matched while the match is on", () => {
  const liveLines = (lines: string[]) =>
    lines
      .map((l) => JSON.parse(l) as Record<string, unknown>)
      .filter((l) => l.event === "football_live_refresh_live_matching");

  function liveRun(db: ReturnType<typeof fakeDb>, mode: SofascoreFantasyMode = "sofascore") {
    const raw: string[] = [];
    const run = new SofascoreFantasyRun({
      mode,
      client: db.client,
      rapid: fakeRapid().rapid,
      environment: {},
      now: NOW,
      log: (line) => raw.push(line),
    });
    return { run, raw };
  }

  test("an unmapped player in a live lineup is offered to the auto-mapping; nothing is recorded", async () => {
    const world = newWorld({ status: "live", finalized: false });
    world.mapped.delete(STARTERS[2]);
    const db = fakeDb({ world, autoMap: () => ({ mapped: [], queued: 1, conflicts: 0 }) });
    const { run, raw } = liveRun(db);
    await run.fromLiveReplies(FIXTURE, EVENT, REPLIES);
    const sent = db.calls.find((c) => c.name === "service_sofascore_auto_map_players")!.args as {
      p_fixture_id: string;
      p_players: { sofascorePlayerId: string; appeared: boolean }[];
    };
    expect(sent.p_fixture_id).toBe(FIXTURE);
    expect(sent.p_players.map((p) => p.sofascorePlayerId)).toEqual([STARTERS[2]]);
    expect(sent.p_players[0].appeared).toBe(true);
    expect(records(db)).toHaveLength(0);
    expect(names(db)).not.toContain("service_sofascore_fantasy_note");
    expect(liveLines(raw)).toEqual([
      expect.objectContaining({ outcome: "offered", autoMap: "mapped=0,queued=1,conflicts=0" }),
    ]);
    // Once per fixture per tick.
    await run.fromLiveReplies(FIXTURE, EVENT, REPLIES);
    expect(names(db).filter((n) => n === "service_sofascore_auto_map_players")).toHaveLength(1);
    // It counts as nothing in the Fantasy summary.
    expect(run.summary()).toMatchObject({ recorded: 0, held: 0, skipped: 0, errors: 0 });
  });

  test("nothing to offer when every appearing player is mapped, and nothing at all in shadow", async () => {
    const db = fakeDb({ world: newWorld({ status: "live", finalized: false }) });
    const a = liveRun(db);
    await a.run.fromLiveReplies(FIXTURE, EVENT, REPLIES);
    expect(names(db)).not.toContain("service_sofascore_auto_map_players");
    expect(liveLines(a.raw)).toEqual([expect.objectContaining({ outcome: "not_needed" })]);

    const world = newWorld({ status: "live", finalized: false });
    world.mapped.delete(STARTERS[2]);
    const shadowDb = fakeDb({ world });
    const b = liveRun(shadowDb, "shadow");
    await b.run.fromLiveReplies(FIXTURE, EVENT, REPLIES);
    expect(shadowDb.calls).toHaveLength(0);
  });

  test("unreadable lineups or a database without the function never throw", async () => {
    const world = newWorld({ status: "live", finalized: false });
    world.mapped.delete(STARTERS[2]);
    const db = fakeDb({ world, autoMap: "missing" });
    const { run, raw } = liveRun(db);
    await run.fromLiveReplies(FIXTURE, EVENT, { ...REPLIES, lineups: { nonsense: true } });
    expect(liveLines(raw)[0]).toMatchObject({ outcome: "skipped:lineups_unreadable" });
    await run.fromLiveReplies(uuid("f", 3), EVENT, REPLIES);
    expect(liveLines(raw)[1]).toMatchObject({ outcome: "offered", autoMap: "missing" });
    // Not asked again once it is known to be missing.
    await run.fromLiveReplies(uuid("f", 4), EVENT, REPLIES);
    expect(names(db).filter((n) => n === "service_sofascore_auto_map_players")).toHaveLength(1);
  });
});

describe("automatic Fantasy: stoppage time is kept with the stored replies", () => {
  test("a held match stores the announced stoppage time, and the retry builds with it", async () => {
    const incidents = JSON.parse(JSON.stringify(REPLIES.incidents)) as {
      incidents: Record<string, unknown>[];
    };
    incidents.incidents.push({ incidentType: "injuryTime", time: 45, addedTime: 0, length: 6 });
    const world = newWorld();
    world.mapped.delete(HOME_SCORER);
    const db = fakeDb({ world });
    await makeRun(db).run.fromReplies(FIXTURE, EVENT, { ...REPLIES, incidents });
    expect(db.attempts.get(FIXTURE)?.matchData).toMatchObject({
      version: 1,
      stoppage: { firstHalf: 6, secondHalf: null },
    });
    world.mapped.add(HOME_SCORER);
    const retry = makeRun(db);
    await retry.run.sweep();
    expect(retry.lines[0]).toMatchObject({ outcome: "recorded", source: "stored" });
  });

  test("the stoppage time is part of the payload reference the observation carries", async () => {
    const payloadRef = async (replies: SofascoreRawReplies) => {
      const db = fakeDb();
      await makeRun(db).run.fromReplies(FIXTURE, EVENT, replies);
      const request = records(db)[0].args.p_request as { payload: { references: string[] } };
      return request.payload.references.find((r) => r.startsWith("sofascore:payload:"));
    };
    const incidents = JSON.parse(JSON.stringify(REPLIES.incidents)) as {
      incidents: Record<string, unknown>[];
    };
    incidents.incidents.push({ incidentType: "injuryTime", time: 45, addedTime: 0, length: 6 });
    const plain = await payloadRef(REPLIES);
    const announced = await payloadRef({ ...REPLIES, incidents });
    expect(plain).toBeDefined();
    expect(announced).toBeDefined();
    expect(announced).not.toBe(plain);
  });

  test("replies stored before stoppage time was kept still retry", async () => {
    const world = newWorld();
    world.mapped.delete(HOME_SCORER);
    const db = fakeDb({ world });
    await makeRun(db).run.fromReplies(FIXTURE, EVENT, REPLIES);
    const stored = db.attempts.get(FIXTURE)!;
    const { stoppage: _dropped, ...older } = stored.matchData as Record<string, unknown>;
    stored.matchData = older;
    world.mapped.add(HOME_SCORER);
    const retry = makeRun(db);
    await retry.run.sweep();
    expect(retry.lines[0]).toMatchObject({ outcome: "recorded", source: "stored" });
  });
});
