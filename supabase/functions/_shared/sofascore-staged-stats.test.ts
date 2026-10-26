import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { createRapidApiClient } from "./rapidapi-client.ts";
import { parseSofascoreLineups } from "./sofascore-performance-parse.ts";
import {
  REQUESTS_PER_PULL,
  STAGED_BUDGET_STOP,
  SofascoreStagedStats,
  readStagedConfig,
} from "./sofascore-staged-stats.ts";

// Later pulls of a finished match (docs/backend/SOFASCORE_STAGED_STATS.md). The
// database decides the status; these tests check what the Edge side sends it.

const EVENT = "17132481";
const NOW = new Date("2026-10-20T12:00:00.000Z");
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
type Side = { players: { statistics?: Record<string, number | undefined> }[] };
type Lineups = { home: Side; away: Side };
const forEachPlayer = (lineups: Lineups, fn: (s: Record<string, number | undefined>) => void) => {
  for (const side of [lineups.home, lineups.away])
    for (const entry of side.players) if (entry.statistics) fn(entry.statistics);
};
/** Full coverage: every player who played has a rating and a pass count. */
const fullLineups = (): Lineups => {
  const lineups = part("lineups") as Lineups;
  forEachPlayer(lineups, (s) => {
    if ((s.minutesPlayed ?? 0) > 0) {
      s.rating ??= 6.2;
      s.totalPass ??= 12;
    }
  });
  return lineups;
};
/** Core data only: no rating and no pass count anywhere. */
const coreLineups = (): Lineups => {
  const lineups = part("lineups") as Lineups;
  forEachPlayer(lineups, (s) => {
    delete s.rating;
    delete s.totalPass;
  });
  return lineups;
};
const DETAIL = part("detail") as {
  event: { homeScore: { current: number }; awayScore: { current: number } };
};
const PLAYERS = parseSofascoreLineups(fullLineups()).players.map((p) => p.externalId);

interface DueItem {
  fixtureId: string;
  eventId: string;
  coverage: "unknown" | "core" | "full";
  finalPull: boolean;
}
interface Options {
  due?: DueItem[];
  budgetStopped?: boolean;
  dueError?: { code?: string; message: string };
  mapped?: Set<string>;
  recordError?: string;
  recordedId?: number;
  created?: boolean;
  pullAnswer?: Record<string, unknown>;
}
function fakeDb(options: Options = {}) {
  const calls: { name: string; args: Record<string, unknown> }[] = [];
  const mapped = options.mapped ?? new Set(PLAYERS);
  const client = {
    schema() {
      return {
        rpc(name: string, args: Record<string, unknown>) {
          calls.push({ name, args });
          switch (name) {
            case "service_sofascore_staged_due":
              if (options.dueError) return Promise.resolve({ data: null, error: options.dueError });
              return Promise.resolve({
                error: null,
                data: { due: options.due ?? [], budgetStopped: options.budgetStopped ?? false },
              });
            case "service_sofascore_fantasy_context":
              return Promise.resolve({
                error: null,
                data: {
                  found: true,
                  sofascoreEventId: EVENT,
                  status: "finished",
                  finalized: true,
                  homeScore: DETAIL.event.homeScore.current,
                  awayScore: DETAIL.event.awayScore.current,
                  homeTeamId: HOME,
                  awayTeamId: AWAY,
                  players: (args.p_player_ids as string[])
                    .filter((id) => mapped.has(id))
                    .map((id) => ({
                      id: uuid("a", Number(id) % 100000),
                      externalId: id,
                      appPlayerId: uuid("5", Number(id) % 100000),
                      active: true,
                      reviewed: true,
                      version: "test",
                      updatedAt: "2026-10-11T00:00:00.000Z",
                    })),
                },
              });
            case "service_record_sofascore_fantasy_observation":
              if (options.recordError)
                return Promise.resolve({ data: null, error: { message: options.recordError } });
              return Promise.resolve({
                error: null,
                data: {
                  created: options.created ?? true,
                  observationId: options.recordedId ?? 77,
                  fullReady: true,
                },
              });
            case "service_sofascore_staged_record_pull":
              return Promise.resolve({
                error: null,
                data: options.pullAnswer ?? { status: "PROVISIONAL", coverage: "full" },
              });
            default:
              return Promise.resolve({ data: null, error: { message: `unexpected ${name}` } });
          }
        },
      };
    },
  };
  return { client, calls };
}

function fakeRapid(overrides: { lineups?: unknown; status?: number; lineupsStatus?: number } = {}) {
  const paths: string[] = [];
  const fetch = async (input: string) => {
    const url = new URL(input);
    const path = url.pathname.slice(1) + url.search;
    paths.push(path);
    if (overrides.status) return new Response("{}", { status: overrides.status });
    const detail = /^matches\/get-(incidents|lineups|statistics)\?matchId=\d+$/.exec(path);
    if (!detail) return new Response("{}", { status: 404 });
    if (detail[1] === "lineups" && overrides.lineupsStatus)
      return new Response("{}", { status: overrides.lineupsStatus });
    const body = detail[1] === "lineups" ? (overrides.lineups ?? fullLineups()) : part(detail[1]);
    return Response.json(body, {
      headers: {
        "x-ratelimit-requests-limit": "10000",
        "x-ratelimit-requests-remaining": "5000",
      },
    });
  };
  const rapid = createRapidApiClient("sofascore", { RAPIDAPI_KEY: "k" }, { fetch, maxRetries: 0 });
  return { rapid, paths };
}

function makeRun(
  db: ReturnType<typeof fakeDb>,
  net: ReturnType<typeof fakeRapid>,
  environment: Record<string, string> = {},
  mode: "sofascore" | "shadow" = "sofascore",
) {
  const lines: Record<string, unknown>[] = [];
  const run = new SofascoreStagedStats({
    mode,
    client: db.client as never,
    rapid: net.rapid,
    environment,
    now: NOW,
    log: (line) => lines.push(JSON.parse(line)),
  });
  return { run, lines };
}
const due = (over: Partial<DueItem> = {}): DueItem => ({
  fixtureId: FIXTURE,
  eventId: EVENT,
  coverage: "core",
  finalPull: false,
  ...over,
});
const names = (db: ReturnType<typeof fakeDb>) => db.calls.map((c) => c.name);
const pullCall = (db: ReturnType<typeof fakeDb>) =>
  db.calls.find((c) => c.name === "service_sofascore_staged_record_pull")?.args as {
    p_fixture_id: string;
    p_pull: Record<string, unknown>;
  };

describe("staged statistics: when it runs", () => {
  test("config defaults and bounds", () => {
    expect(readStagedConfig({})).toEqual({ enabled: true, pullsPerTick: 2, budgetStop: 8500 });
    expect(readStagedConfig({ SOFASCORE_STAGED_PULLS_PER_TICK: "5" }).pullsPerTick).toBe(5);
    expect(readStagedConfig({ SOFASCORE_STAGED_PULLS_PER_TICK: "50" }).pullsPerTick).toBe(2);
    expect(readStagedConfig({ SOFASCORE_STAGED_ENABLED: "false" }).enabled).toBe(false);
    expect(STAGED_BUDGET_STOP).toBe(8500);
    expect(REQUESTS_PER_PULL).toBe(3);
  });

  test("off by switch, by shadow mode and by zero cap: no database call, no request", async () => {
    for (const [env, mode] of [
      [{ SOFASCORE_STAGED_ENABLED: "false" }, "sofascore"],
      [{}, "shadow"],
      [{ SOFASCORE_STAGED_PULLS_PER_TICK: "0" }, "sofascore"],
    ] as const) {
      const db = fakeDb({ due: [due()] });
      const net = fakeRapid();
      const { run } = makeRun(db, net, env, mode);
      const summary = await run.sweep();
      expect(db.calls).toEqual([]);
      expect(net.paths).toEqual([]);
      expect(summary.pulled).toBe(0);
    }
  });

  test("nothing due: one database call and no request", async () => {
    const db = fakeDb();
    const net = fakeRapid();
    const { run } = makeRun(db, net);
    const summary = await run.sweep();
    expect(names(db)).toEqual(["service_sofascore_staged_due"]);
    expect(db.calls[0].args).toEqual({ p_limit: 2, p_budget_stop: 8500 });
    expect(net.paths).toEqual([]);
    expect(summary).toMatchObject({ due: 0, pulled: 0, requests: 0, stoppedBy: null });
  });

  test("the budget stop is reported and nothing is pulled", async () => {
    const db = fakeDb({ budgetStopped: true });
    const net = fakeRapid();
    const { run } = makeRun(db, net);
    expect((await run.sweep()).stoppedBy).toBe("budget_stop");
    expect(net.paths).toEqual([]);
  });

  test("a database without the function stands down", async () => {
    const db = fakeDb({ dueError: { code: "PGRST202", message: "Could not find the function" } });
    const { run } = makeRun(db, fakeRapid());
    expect((await run.sweep()).stoppedBy).toBe("function_missing");
  });
});

describe("staged statistics: one pull", () => {
  test("full coverage: 3 requests, observation recorded, pull reported with digest and trimmed data", async () => {
    const db = fakeDb({ due: [due()] });
    const net = fakeRapid();
    const { run, lines } = makeRun(db, net);
    const summary = await run.sweep();
    expect(net.paths).toHaveLength(3);
    expect(net.paths.map((p) => p.split("?")[0])).toEqual([
      "matches/get-incidents",
      "matches/get-lineups",
      "matches/get-statistics",
    ]);
    expect(names(db)).toEqual([
      "service_sofascore_staged_due",
      "service_sofascore_fantasy_context",
      "service_record_sofascore_fantasy_observation",
      "service_sofascore_staged_record_pull",
    ]);
    const record = db.calls[2].args as {
      p_dry_run: boolean;
      p_request: { coverage: string; sofascoreEventId: string };
    };
    expect(record.p_dry_run).toBe(false);
    expect(record.p_request).toMatchObject({ coverage: "full", sofascoreEventId: EVENT });
    const pull = pullCall(db);
    expect(pull.p_fixture_id).toBe(FIXTURE);
    expect(pull.p_pull).toMatchObject({
      outcome: "pulled",
      coverage: "full",
      regressed: false,
      requests: 3,
      observationId: 77,
    });
    expect(pull.p_pull.dataDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(pull.p_pull.matchData).toMatchObject({ version: 1 });
    // No raw payload: only the trimmed parsed lineups, incidents and team statistics.
    expect(Object.keys(pull.p_pull.matchData as object).sort()).toEqual(
      ["incidents", "lineups", "statistics", "stoppage", "version"].filter(
        (k) => k in (pull.p_pull.matchData as object),
      ),
    );
    expect(summary).toMatchObject({ pulled: 1, recorded: 1, errors: 0, requests: 3 });
    expect(lines.at(-1)).toMatchObject({
      event: "football_live_refresh_staged_stats",
      outcome: "recorded",
      coverage: "full",
    });
  });

  test("core coverage is reported as core and still recorded (core points recalculated)", async () => {
    const db = fakeDb({ due: [due({ coverage: "core" })] });
    const { run } = makeRun(db, fakeRapid({ lineups: coreLineups() }));
    await run.sweep();
    const record = db.calls.find((c) => c.name === "service_record_sofascore_fantasy_observation")!
      .args as { p_request: { coverage: string } };
    expect(record.p_request.coverage).toBe("limited");
    expect(pullCall(db).p_pull).toMatchObject({ coverage: "core", regressed: false });
  });

  test("an unchanged pull is not a new observation", async () => {
    const db = fakeDb({ due: [due({ coverage: "full" })], created: false });
    const { run, lines } = makeRun(db, fakeRapid());
    const summary = await run.sweep();
    expect(summary.recorded).toBe(0);
    expect(lines.at(-1)?.outcome).toBe("unchanged");
    expect(pullCall(db).p_pull.observationId).toBe(77);
  });

  test("coverage worse than the recorded one is traced, never recorded", async () => {
    const db = fakeDb({ due: [due({ coverage: "full" })] });
    const { run, lines } = makeRun(db, fakeRapid({ lineups: coreLineups() }));
    await run.sweep();
    expect(names(db)).not.toContain("service_record_sofascore_fantasy_observation");
    expect(pullCall(db).p_pull).toMatchObject({ coverage: "core", regressed: true });
    expect(pullCall(db).p_pull.observationId).toBeUndefined();
    expect(lines.at(-1)?.outcome).toBe("regressed");
  });

  test("a match that cannot be built is still reported (no observation id)", async () => {
    const db = fakeDb({ due: [due()], mapped: new Set() });
    const { run, lines } = makeRun(db, fakeRapid());
    await run.sweep();
    expect(names(db)).not.toContain("service_record_sofascore_fantasy_observation");
    expect(pullCall(db).p_pull).toMatchObject({ outcome: "pulled", coverage: "full" });
    expect(pullCall(db).p_pull.observationId).toBeUndefined();
    expect(String(lines.at(-1)?.outcome)).toStartWith("held:");
  });

  test("a database refusal is a held pull, the schedule still moves on", async () => {
    const db = fakeDb({ due: [due()], recordError: "adaptive_reviewed_correction_required" });
    const { run, lines } = makeRun(db, fakeRapid());
    await run.sweep();
    expect(lines.at(-1)?.outcome).toBe("held:adaptive_reviewed_correction_required");
    expect(pullCall(db).p_pull.outcome).toBe("pulled");
  });

  test("lineups the provider does not have: an error pull, retried by the database", async () => {
    const db = fakeDb({ due: [due()] });
    const net = fakeRapid({ lineupsStatus: 404 });
    const { run } = makeRun(db, net);
    const summary = await run.sweep();
    expect(pullCall(db).p_pull).toMatchObject({ outcome: "error", error: "lineups_unavailable" });
    expect(summary.errors).toBe(1);
  });

  test("a provider failure is an error pull", async () => {
    const db = fakeDb({ due: [due()] });
    const { run } = makeRun(db, fakeRapid({ status: 500 }));
    await run.sweep();
    expect(pullCall(db).p_pull).toMatchObject({ outcome: "error", error: "fetch_failed" });
  });

  test("a quota refusal ends the sweep and writes nothing", async () => {
    const db = fakeDb({
      due: [due(), due({ fixtureId: uuid("f", 2), eventId: "17132482" })],
    });
    const { run } = makeRun(db, fakeRapid({ status: 429 }));
    const summary = await run.sweep();
    expect(summary.stoppedBy).toBe("rate_limited");
    expect(names(db)).not.toContain("service_sofascore_staged_record_pull");
    // The second match was not tried.
    expect(summary.results).toHaveLength(1);
  });

  test("at most the per-tick cap is pulled", async () => {
    const items = [1, 2, 3].map((n) => due({ fixtureId: uuid("f", n) }));
    const db = fakeDb({ due: items });
    const net = fakeRapid();
    const { run } = makeRun(db, net, { SOFASCORE_STAGED_PULLS_PER_TICK: "1" });
    await run.sweep();
    expect(net.paths).toHaveLength(3);
    expect(db.calls.filter((c) => c.name === "service_sofascore_staged_record_pull")).toHaveLength(
      1,
    );
  });
});
