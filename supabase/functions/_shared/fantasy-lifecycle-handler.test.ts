import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_BUDGET_MS,
  handleFantasyWorkerRequest,
  workerLimits,
  type FantasyWorkerRpcClient,
} from "./fantasy-lifecycle-handler.ts";
import {
  AMBIGUOUS_LEASE_EXTENSION_SECONDS,
  WORKER_LEASE_SECONDS,
  acquireWorkerLease,
  ambiguousRpcTimeout,
  databaseWorkerStatus,
  leasedGateway,
  replyShowsStatementOver,
  runFantasyWorkerPass,
  unconfirmedWrite,
  type FantasyWorkerGateway,
} from "./fantasy-lifecycle-worker.ts";
import { SCHEDULER_TOKEN_HEADER } from "./scheduler-token.ts";

const TOKEN = "ab".repeat(32);
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const seasonId = id(2);

type Call = { name: string; args: Record<string, unknown> };

interface World {
  /** Gameweeks the calendar sync reports. */
  gameweeks: { id: string; sequence: number; status: string }[];
  /** The database worker switch (an `edge:` lease is refused while false). */
  enabled: boolean;
  lease: { holder: string; token: string; expiresAt: number; released: boolean } | null;
  clock: { now: number };
  /** Time every RPC takes. */
  rpcMs: number;
  recorded: Record<string, unknown>[];
  calls: Call[];
  failOn?: string;
  /** Make one RPC really (not simulated) slow: `times` calls, `ms` of wall-clock time each. */
  slow?: { name: string; ms: number; times?: number };
  slowed?: number;
  /** Start / end of every RPC on the "server", in the order they happened. */
  events: string[];
  /** The client offers `.abortSignal()`, as supabase-js does; the signals it was given. */
  abortable?: boolean;
  signals: { name: string; signal: AbortSignal }[];
  /** `service_evaluate_fantasy_prizes` answers this instead of "nothing to do". */
  prizes?: unknown;
  /** Throw this (as a failed RPC) from `service_evaluate_fantasy_prizes`. */
  prizeFailure?: string;
}

function world(overrides: Partial<World> = {}): World {
  return {
    gameweeks: [{ id: id(1), sequence: 1, status: "live" }],
    enabled: true,
    lease: null,
    clock: { now: Date.parse("2026-10-14T12:00:00Z") },
    rpcMs: 0,
    recorded: [],
    calls: [],
    events: [],
    signals: [],
    ...overrides,
  };
}

/** An in-memory database behind the worker's RPCs, lease semantics included. */
function rpcFor(w: World) {
  let counter = 0;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
  const run = async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    w.calls.push({ name, args });
    w.clock.now += w.rpcMs;
    if (w.slow?.name === name && (w.slowed ?? 0) < (w.slow.times ?? Infinity)) {
      w.slowed = (w.slowed ?? 0) + 1;
      await sleep(w.slow.ms);
    }
    if (name === w.failOn) throw new Error("fantasy_worker_rpc_failed");
    switch (name) {
      case "service_fantasy_worker_lease_acquire": {
        const holder = String(args.p_holder);
        if (holder.startsWith("edge:") && !w.enabled)
          return { acquired: false, reason: "disabled" };
        if (w.lease && !w.lease.released && w.lease.expiresAt > w.clock.now)
          return { acquired: false, reason: "held", holder: w.lease.holder, expiresAt: null };
        const token = id(900 + ++counter);
        w.lease = {
          holder,
          token,
          expiresAt: w.clock.now + Number(args.p_ttl_seconds) * 1000,
          released: false,
        };
        return { acquired: true, token, holder, expiresAt: null };
      }
      case "service_fantasy_worker_lease_extend": {
        const ok =
          w.lease !== null &&
          w.lease.token === args.p_token &&
          !w.lease.released &&
          w.lease.expiresAt > w.clock.now;
        if (ok) w.lease!.expiresAt = w.clock.now + Number(args.p_ttl_seconds) * 1000;
        return { extended: ok };
      }
      case "service_fantasy_worker_lease_release": {
        const ok = w.lease !== null && w.lease.token === args.p_token && !w.lease.released;
        if (ok) w.lease!.released = true;
        return { released: ok };
      }
      case "service_fantasy_worker_record_run":
        w.recorded.push(args.p_run as Record<string, unknown>);
        return 1;
      case "service_sync_fantasy_calendar":
        return {
          schemaVersion: 1,
          seasonId,
          seasonStatus: "active",
          expectedClubs: 16,
          gameweeksCreated: 0,
          assignmentsAdded: 0,
          assignmentsSuperseded: 0,
          kickoffsRealigned: 0,
          deadlineChanges: 0,
          blockedRounds: 0,
          rounds: [],
          gameweeks: w.gameweeks.map((gw) => ({
            id: gw.id,
            sequence: gw.sequence,
            status: gw.status,
            deadlineAt: "2026-10-10T18:00:00Z",
            scoringInputVersion: 1,
            nextGameweekId: null,
            advancedToGameweekId: null,
          })),
        };
      case "service_fantasy_lifecycle_state": {
        const gw = w.gameweeks.find((item) => item.id === args.p_gameweek_id)!;
        return {
          gameweekId: gw.id,
          seasonId,
          status: gw.status,
          lockVersion: 3,
          sequenceNumber: gw.sequence,
          scoringInputVersion: 1,
        };
      }
      case "service_advance_fantasy_lifecycle": {
        const gw = w.gameweeks.find((item) => item.id === args.p_gameweek_id)!;
        return {
          gameweekId: gw.id,
          seasonId,
          status: gw.status,
          lockVersion: 3,
          sequenceNumber: gw.sequence,
          scoringInputVersion: 1,
          changed: false,
          hasMore: false,
          waitingReason: "football_not_final",
        };
      }
      case "service_evaluate_fantasy_prizes":
        if (w.prizeFailure) throw new Error(w.prizeFailure);
        return w.prizes ?? { evaluatedCount: 0, evaluated: [], blocked: [], hasMore: false };
      default:
        throw new Error(`unexpected_rpc_${name}`);
    }
  };
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    w.events.push(`start:${name}`);
    try {
      return await run(name, args);
    } finally {
      w.events.push(`end:${name}`);
    }
  };
}

function gatewayFor(w: World): FantasyWorkerGateway {
  const call = rpcFor(w);
  return { rpc: (name, args) => call(name, args) };
}

function clientFor(w: World): FantasyWorkerRpcClient {
  const call = rpcFor(w);
  type Answer = { data?: unknown; error?: { message?: string; code?: string } | null };
  return {
    schema: () => ({
      rpc: (name: string, args: Record<string, unknown>) => {
        let signal: AbortSignal | undefined;
        const builder = {
          // Like a supabase-js builder, the request starts when it is awaited.
          then<A = Answer, B = never>(
            onfulfilled?: ((value: Answer) => A | PromiseLike<A>) | null,
            onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
          ) {
            const server = (async (): Promise<Answer> => {
              try {
                return { data: await call(name, args), error: null };
              } catch (error) {
                return { data: null, error: { message: (error as Error).message } };
              }
            })();
            // An abort answers the client at once. The "server" carries on regardless:
            // aborting a request does not prove the database statement stopped.
            const aborted = signal
              ? new Promise<Answer>((resolve) => {
                  const answer = {
                    data: null,
                    error: { message: "AbortError", code: "" },
                    status: 0,
                  };
                  if (signal!.aborted) resolve(answer);
                  else signal!.addEventListener("abort", () => resolve(answer));
                })
              : null;
            return (aborted ? Promise.race([server, aborted]) : server).then(
              onfulfilled,
              onrejected,
            );
          },
          ...(w.abortable
            ? {
                abortSignal(next: AbortSignal) {
                  signal = next;
                  w.signals.push({ name, signal: next });
                  return builder;
                },
              }
            : {}),
        };
        return builder;
      },
    }),
  };
}

/** A gateway for a database whose lease functions do not exist yet (PostgREST PGRST202). */
function noLeaseFunction(w: World): FantasyWorkerGateway {
  const base = rpcFor(w);
  return {
    rpc: async (name, args) => {
      if (name.startsWith("service_fantasy_worker_lease"))
        throw Object.assign(new Error("fantasy_worker_rpc_failed"), { postgrestCode: "PGRST202" });
      return base(name, args);
    },
  };
}

function request(init: { method?: string; token?: string | null; body?: string } = {}) {
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (init.token !== null) headers[SCHEDULER_TOKEN_HEADER] = init.token ?? TOKEN;
  return new Request("https://example.test/functions/v1/fantasy-lifecycle-worker", {
    method: init.method ?? "POST",
    headers,
    body: init.method === "GET" ? undefined : (init.body ?? '{"job":"lifecycle"}'),
  });
}

const environment = { BOTOLAGO_SCHEDULER_TOKEN: TOKEN };
const names = (w: World) => w.calls.map((call) => call.name);

describe("fantasy-lifecycle-worker Edge handler", () => {
  it("answers only a POST that carries the scheduler token, before any database call", async () => {
    const w = world();
    const dependencies = { environment, client: clientFor(w) };
    expect(
      (await handleFantasyWorkerRequest(request({ method: "GET" }), dependencies)).status,
    ).toBe(405);
    expect((await handleFantasyWorkerRequest(request({ token: null }), dependencies)).status).toBe(
      401,
    );
    expect(
      (await handleFantasyWorkerRequest(request({ token: "cd".repeat(32) }), dependencies)).status,
    ).toBe(401);
    expect(
      (await handleFantasyWorkerRequest(request(), { environment: {}, client: clientFor(w) }))
        .status,
    ).toBe(503);
    expect(
      (await handleFantasyWorkerRequest(request({ body: '{"job":"scoring"}' }), dependencies))
        .status,
    ).toBe(400);
    expect((await handleFantasyWorkerRequest(request({ body: "{" }), dependencies)).status).toBe(
      400,
    );
    expect(w.calls).toEqual([]);
  });

  it("runs one bounded pass: lease, calendar, the gameweek's worker, prizes, release, one log row", async () => {
    const w = world({ rpcMs: 10 });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      randomHex: () => "0a1b2c3d4e5f",
    });
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.recorded).toBe(true);
    expect(names(w)).toEqual([
      "service_fantasy_worker_lease_acquire",
      "service_sync_fantasy_calendar",
      "service_fantasy_lifecycle_state",
      "service_advance_fantasy_lifecycle",
      "service_evaluate_fantasy_prizes",
      "service_fantasy_worker_lease_release",
      "service_fantasy_worker_record_run",
    ]);
    expect(w.calls[0]!.args).toEqual({ p_holder: "edge:0a1b2c3d4e5f", p_ttl_seconds: 420 });
    expect(w.lease?.released).toBe(true);
    expect(w.recorded).toHaveLength(1);
    const row = w.recorded[0]!;
    expect(row).toMatchObject({
      holder: "edge:0a1b2c3d4e5f",
      outcome: "ok",
      gameweekId: id(1),
      gameweekSequence: 1,
      workerCode: "football_not_final",
      calls: 2,
    });
    expect(Number(row.durationMs)).toBeGreaterThan(0);
    // The log row carries no credential and no token.
    expect(JSON.stringify(row)).not.toContain(TOKEN);
    expect(JSON.stringify(row)).not.toContain(w.lease!.token);
  });

  it("does nothing, and logs nothing, while the database worker is switched off", async () => {
    const w = world({ enabled: false });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    expect(response.status).toBe(200);
    expect(((await response.json()) as { status: string }).status).toBe("disabled");
    expect(names(w)).toEqual(["service_fantasy_worker_lease_acquire"]);
    expect(w.recorded).toEqual([]);
  });

  it("turns away a pass while another holder (the GitHub orchestrator) has the lease", async () => {
    const w = world();
    w.lease = {
      holder: "github:123",
      token: id(950),
      expiresAt: w.clock.now + 60_000,
      released: false,
    };
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    expect(((await response.json()) as { status: string }).status).toBe("lease_held");
    // No lifecycle RPC ran, and the other holder's lease is untouched.
    expect(names(w)).toEqual([
      "service_fantasy_worker_lease_acquire",
      "service_fantasy_worker_record_run",
    ]);
    expect(w.lease?.released).toBe(false);
    expect(w.recorded[0]).toMatchObject({ outcome: "lease_held" });
    expect(JSON.stringify(w.recorded[0])).toContain("github:123");
  });

  it("logs a failed pass as failed and still frees the lease", async () => {
    const w = world({ failOn: "service_advance_fantasy_lifecycle" });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    expect(response.status).toBe(500);
    expect(w.recorded[0]).toMatchObject({
      outcome: "failed",
      workerCode: "fantasy_worker_rpc_failed",
      gameweekSequence: 1,
    });
    expect(w.lease?.released).toBe(true);
  });

  it("answers 500 without a row when the lease itself cannot be read", async () => {
    const w = world({ failOn: "service_fantasy_worker_lease_acquire" });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    expect(response.status).toBe(500);
    expect(w.recorded).toEqual([]);
  });

  it("reduces a database error message to a safe code", async () => {
    const w = world();
    const client = clientFor(w);
    const noisy: FantasyWorkerRpcClient = {
      schema: () => ({
        rpc: async (name: string, args: Record<string, unknown>) =>
          name === "service_advance_fantasy_lifecycle"
            ? { error: { message: 'duplicate key value violates "secret_table" sk_live_123' } }
            : client.schema("api").rpc(name, args),
      }),
    };
    const response = await handleFantasyWorkerRequest(request(), { environment, client: noisy });
    expect(response.status).toBe(500);
    expect(JSON.stringify(w.recorded)).not.toContain("sk_live");
    expect(w.recorded[0]).toMatchObject({ workerCode: "fantasy_worker_rpc_failed" });
  });

  it("clamps the budget knobs", () => {
    expect(workerLimits({})).toEqual({
      budgetMs: DEFAULT_BUDGET_MS,
      maxGameweeks: 4,
      maxCallsPerGameweek: 1500,
    });
    expect(
      workerLimits({
        FANTASY_WORKER_BUDGET_MS: "9999999",
        FANTASY_WORKER_MAX_GAMEWEEKS: "0",
        FANTASY_WORKER_MAX_CALLS: "x",
      }),
    ).toEqual({ budgetMs: 120_000, maxGameweeks: 1, maxCallsPerGameweek: 1500 });
  });
});

describe("the bounded pass", () => {
  it("does nothing but read when no gameweek has work", async () => {
    const w = world({ gameweeks: [{ id: id(1), sequence: 1, status: "scheduled" }] });
    const result = await runFantasyWorkerPass(gatewayFor(w), {
      holder: "edge:t1",
      now: () => w.clock.now,
    });
    expect(result.outcome).toBe("ok");
    expect(result.gameweeks).toEqual([]);
    expect(names(w)).not.toContain("service_fantasy_lifecycle_state");
  });

  it("stops on the time budget, reports partial, frees the lease and leaves the rest to the next tick", async () => {
    const w = world({
      rpcMs: 4_000,
      gameweeks: [
        { id: id(1), sequence: 1, status: "live" },
        { id: id(2), sequence: 2, status: "locked" },
      ],
    });
    const result = await runFantasyWorkerPass(gatewayFor(w), {
      holder: "edge:t2",
      now: () => w.clock.now,
      budgetMs: 10_000,
    });
    expect(result.outcome).toBe("partial");
    expect(result.deferred).toBeGreaterThan(0);
    expect(w.lease?.released).toBe(true);
    // No RPC was started once the budget was spent.
    const started = w.calls.length;
    expect(started).toBeLessThan(10);
  });

  it("stops a gameweek at its RPC allowance as partial, not failed", async () => {
    const w = world();
    const result = await runFantasyWorkerPass(gatewayFor(w), {
      holder: "edge:t3",
      now: () => w.clock.now,
      maxCallsPerGameweek: 1,
    });
    expect(result.outcome).toBe("partial");
    expect(result.workerCode).toBe("fantasy_worker_batch_limit");
  });

  it("works on at most maxGameweeks and says how many wait", async () => {
    const w = world({
      gameweeks: [1, 2, 3].map((n) => ({ id: id(n), sequence: n, status: "live" })),
    });
    const result = await runFantasyWorkerPass(gatewayFor(w), {
      holder: "edge:t4",
      now: () => w.clock.now,
      maxGameweeks: 2,
    });
    expect(result.gameweeks).toHaveLength(2);
    expect(result.deferred).toBe(1);
    expect(result.outcome).toBe("partial");
  });

  it("carries on with the other gameweeks when one fails, and reports failed", async () => {
    const w = world({
      gameweeks: [
        { id: id(1), sequence: 1, status: "live" },
        { id: id(2), sequence: 2, status: "live" },
      ],
    });
    const base = rpcFor(w);
    let advances = 0;
    const gateway: FantasyWorkerGateway = {
      rpc: async (name, args) => {
        if (name === "service_advance_fantasy_lifecycle" && ++advances === 1)
          throw new Error("fantasy_scoring_snapshot_changed");
        return base(name, args);
      },
    };
    const result = await runFantasyWorkerPass(gateway, {
      holder: "edge:t5",
      now: () => w.clock.now,
    });
    expect(result.outcome).toBe("failed");
    expect(result.gameweeks.map((gw) => gw.outcome)).toEqual(["failed", "waiting"]);
    expect(result.workerCode).toBe("fantasy_scoring_snapshot_changed");
  });

  it("refuses to work without a lease unless a caller opts in, and names the missing function", async () => {
    const w = world();
    const result = await runFantasyWorkerPass(noLeaseFunction(w), {
      holder: "edge:t6",
      now: () => w.clock.now,
    });
    expect(result.outcome).toBe("failed");
    expect(result.workerCode).toBe("fantasy_worker_lease_function_missing");
    expect(result.missingFunction).toBe("service_fantasy_worker_lease_acquire");
    // Nothing ran: not the calendar sync, not a gameweek.
    expect(names(w)).toEqual([]);
  });

  it("the Edge handler refuses too, answers 500 naming the function, and logs the row", async () => {
    const w = world();
    const base = clientFor(w);
    const client: FantasyWorkerRpcClient = {
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) =>
          name.startsWith("service_fantasy_worker_lease")
            ? Promise.resolve({ error: { message: "not found", code: "PGRST202" } })
            : base.schema("api").rpc(name, args),
      }),
    };
    const response = await handleFantasyWorkerRequest(request(), { environment, client });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      status: "failed",
      workerCode: "fantasy_worker_lease_function_missing",
      missingFunction: "service_fantasy_worker_lease_acquire",
    });
    expect(names(w)).toEqual(["service_fantasy_worker_record_run"]);
    expect(w.recorded[0]).toMatchObject({
      outcome: "failed",
      workerCode: "fantasy_worker_lease_function_missing",
    });
  });

  it("works without a lease only when the caller opts in, and the time budget still applies", async () => {
    const w = world({ rpcMs: 6_000 });
    const result = await runFantasyWorkerPass(noLeaseFunction(w), {
      holder: "edge:t6",
      now: () => w.clock.now,
      allowUnmanaged: true,
      budgetMs: 10_000,
    });
    // The calendar sync and the state read use 12 s of a 10 s budget; the wrapper
    // then refuses to start the write, inside the gameweek, as it does for a leased pass.
    expect(result.outcome).toBe("partial");
    expect(result.workerCode).toBe("fantasy_worker_time_limit");
    expect(names(w)).toEqual(["service_sync_fantasy_calendar", "service_fantasy_lifecycle_state"]);
  });

  it("an unmanaged opt-in on a healthy database still just works", async () => {
    const w = world();
    const result = await runFantasyWorkerPass(noLeaseFunction(w), {
      holder: "edge:t6",
      now: () => w.clock.now,
      allowUnmanaged: true,
    });
    expect(result.outcome).toBe("ok");
    expect(result.gameweeks).toHaveLength(1);
  });
});

describe("the lease keeps two writers apart", () => {
  it("lets only one of two holders in, until it is released or expires", async () => {
    const w = world();
    const call = rpcFor(w);
    const first = await acquireWorkerLease(call, "github:1");
    const second = await acquireWorkerLease(call, "edge:abc");
    expect(first.kind).toBe("acquired");
    expect(second).toMatchObject({ kind: "held", holder: "github:1" });
    // Expiry frees a dead holder.
    w.clock.now += 421_000;
    expect((await acquireWorkerLease(call, "edge:abc")).kind).toBe("acquired");
  });

  it("refuses an edge holder while the worker is off, but never the owner's own runs", async () => {
    const w = world({ enabled: false });
    const call = rpcFor(w);
    expect((await acquireWorkerLease(call, "edge:abc")).kind).toBe("disabled");
    expect((await acquireWorkerLease(call, "manual:9")).kind).toBe("acquired");
  });

  it("a holder whose lease was taken stops at its next lease extension", async () => {
    const w = world();
    const call = rpcFor(w);
    const lease = await acquireWorkerLease(call, "edge:slow", 60);
    if (lease.kind !== "acquired") throw new Error("expected a lease");
    const leased = leasedGateway(
      { rpc: call },
      { token: lease.token, ttlSeconds: 60, now: () => w.clock.now },
    );
    await leased.rpc("service_fantasy_lifecycle_state", { p_gameweek_id: id(1) });
    // The holder stalls past its expiry; another takes the lease.
    w.clock.now += 61_000;
    expect((await acquireWorkerLease(call, "github:2")).kind).toBe("acquired");
    await expect(
      leased.rpc("service_fantasy_lifecycle_state", { p_gameweek_id: id(1) }),
    ).rejects.toThrow("fantasy_worker_lease_lost");
  });

  it("extends the lease every quarter of its length while working", async () => {
    const w = world({ rpcMs: 20_000 });
    const call = rpcFor(w);
    const lease = await acquireWorkerLease(call, "edge:long", 60);
    if (lease.kind !== "acquired") throw new Error("expected a lease");
    const leased = leasedGateway(
      { rpc: call },
      { token: lease.token, ttlSeconds: 60, now: () => w.clock.now },
    );
    for (let i = 0; i < 10; i += 1)
      await leased.rpc("service_fantasy_lifecycle_state", { p_gameweek_id: id(1) });
    expect(
      names(w).filter((n) => n === "service_fantasy_worker_lease_extend").length,
    ).toBeGreaterThan(5);
    expect(leased.calls).toBe(10);
  });

  it("stops starting RPCs after the deadline", async () => {
    const w = world();
    const call = rpcFor(w);
    const leased = leasedGateway(
      { rpc: call },
      { token: id(1), now: () => w.clock.now, deadlineAt: w.clock.now - 1 },
    );
    await expect(leased.rpc("service_fantasy_lifecycle_state", {})).rejects.toThrow(
      "fantasy_worker_time_limit",
    );
  });

  it("reads the database worker's status, and treats a missing function as not installed", async () => {
    const ok = await databaseWorkerStatus(async () => ({
      enabled: true,
      databaseWorkerActive: true,
      workPending: true,
      lastOkAt: "2026-10-14T11:55:00Z",
      leaseHeld: false,
    }));
    expect(ok).toMatchObject({ installed: true, databaseWorkerActive: true });
    expect(
      await databaseWorkerStatus(async () => {
        throw Object.assign(new Error("x"), { postgrestCode: "PGRST202" });
      }),
    ).toEqual({ installed: false });
  });
});

const SYNC = "service_sync_fantasy_calendar";
const ADVANCE = "service_advance_fantasy_lifecycle";
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("a write that timed out is ambiguous, not failed (SEC-01)", () => {
  it("keeps the lease, stops the pass and says so when a slow write has not answered", async () => {
    // The audit's repro: 10 ms timeout, an 80 ms calendar sync.
    const w = world({ slow: { name: SYNC, ms: 80, times: 1 } });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      status: "failed",
      workerCode: "fantasy_worker_rpc_timeout",
      ambiguous: true,
      rpc: SYNC,
      leaseReleased: false,
    });
    // The original write is still running; the lease is still ours.
    expect(w.events).not.toContain(`end:${SYNC}`);
    await wait(120);
    expect(w.events).toContain(`end:${SYNC}`);
    expect(w.lease?.released).toBe(false);
    expect(names(w)).not.toContain("service_fantasy_worker_lease_release");
    // The pass did not go on to a gameweek.
    expect(names(w)).not.toContain("service_fantasy_lifecycle_state");
    // The run record names it for the operator.
    expect(w.recorded[0]).toMatchObject({
      outcome: "failed",
      workerCode: "fantasy_worker_rpc_timeout",
      detail: { ambiguous: { rpc: SYNC, settled: false, leaseReleased: false } },
    });
  });

  it("pushes the lease out again so the unfinished write is covered for a full lease", async () => {
    const w = world({ slow: { name: SYNC, ms: 80, times: 1 } });
    await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    expect(names(w)).toContain("service_fantasy_worker_lease_extend");
    expect(w.lease!.expiresAt).toBeGreaterThanOrEqual(w.clock.now + 419_000);
    await wait(100);
  });

  it("turns the next pass away while the lease stands, then lets a later one in once it has expired", async () => {
    const w = world({ slow: { name: SYNC, ms: 60, times: 1 } });
    const dependencies = {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 10,
    };
    await handleFantasyWorkerRequest(request(), dependencies);
    await wait(100);
    const second = await handleFantasyWorkerRequest(request(), dependencies);
    expect(((await second.json()) as { status: string }).status).toBe("lease_held");
    // A crashed or abandoned holder frees the lease by expiry alone.
    w.clock.now += 421_000;
    const third = await handleFantasyWorkerRequest(request(), dependencies);
    expect(((await third.json()) as { status: string }).status).toBe("ok");
  });

  it("releases the lease only after the slow write has really answered", async () => {
    const w = world({ slow: { name: SYNC, ms: 40, times: 1 } });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 1_000,
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body).toMatchObject({ ambiguous: true, rpc: SYNC, leaseReleased: true });
    const answered = w.events.indexOf(`end:${SYNC}`);
    const released = w.events.indexOf("start:service_fantasy_worker_lease_release");
    expect(answered).toBeGreaterThan(-1);
    expect(released).toBeGreaterThan(answered);
    expect(w.recorded[0]).toMatchObject({
      detail: { ambiguous: { rpc: SYNC, settled: true, leaseReleased: true } },
    });
  });

  it("starts no other gameweek after a gameweek's write timed out", async () => {
    const w = world({
      gameweeks: [
        { id: id(1), sequence: 1, status: "live" },
        { id: id(2), sequence: 2, status: "live" },
      ],
      slow: { name: ADVANCE, ms: 80, times: 1 },
    });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    expect(await response.json()).toMatchObject({ ambiguous: true, rpc: ADVANCE });
    await wait(120);
    expect(w.calls.some((call) => call.args.p_gameweek_id === id(2))).toBe(false);
    expect(w.lease?.released).toBe(false);
    expect(w.recorded[0]).toMatchObject({ gameweekSequence: 1 });
  });

  it("also stops when the prize write is the one that timed out", async () => {
    const w = world({ slow: { name: "service_evaluate_fantasy_prizes", ms: 80, times: 1 } });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    expect(await response.json()).toMatchObject({
      status: "failed",
      ambiguous: true,
      rpc: "service_evaluate_fantasy_prizes",
      leaseReleased: false,
    });
    await wait(120);
  });

  it("gives the request an abort signal, but does not read an abort as the write having stopped", async () => {
    const w = world({ slow: { name: SYNC, ms: 80, times: 1 }, abortable: true });
    await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    const sent = w.signals.find((item) => item.name === SYNC);
    expect(sent).toBeDefined();
    // Aborted once the grace ran out: the client now has an "AbortError" answer,
    // while the write has not ended yet. The lease must not be released on it.
    expect(sent!.signal.aborted).toBe(true);
    expect(w.events).not.toContain(`end:${SYNC}`);
    expect(w.lease?.released).toBe(false);
    expect(names(w)).not.toContain("service_fantasy_worker_lease_release");
    await wait(120);
    expect(w.lease?.released).toBe(false);
  });

  it("does not abort a write that answers within the grace", async () => {
    const w = world({ slow: { name: SYNC, ms: 30, times: 1 }, abortable: true });
    await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 1_000,
    });
    expect(w.signals.find((item) => item.name === SYNC)!.signal.aborted).toBe(false);
    expect(w.lease?.released).toBe(true);
  });

  it("keeps today's behaviour for a read that timed out: a plain failure, the lease freed", async () => {
    const w = world({ slow: { name: "service_fantasy_lifecycle_state", ms: 60, times: 1 } });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 20,
    });
    expect(response.status).toBe(500);
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.workerCode).toBe("fantasy_worker_rpc_timeout");
    expect(body.ambiguous).toBeUndefined();
    expect(w.lease?.released).toBe(true);
    expect(w.recorded[0]!.detail).not.toHaveProperty("ambiguous");
    await wait(80);
  });

  it("a write that failed cleanly stays an ordinary, resumable failure", async () => {
    const w = world({
      gameweeks: [
        { id: id(1), sequence: 1, status: "live" },
        { id: id(2), sequence: 2, status: "live" },
      ],
    });
    const base = clientFor(w);
    let advances = 0;
    const client: FantasyWorkerRpcClient = {
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) =>
          name === ADVANCE && ++advances === 1
            ? Promise.resolve({
                error: { message: "fantasy_scoring_snapshot_changed", code: "PT409" },
              })
            : base.schema("api").rpc(name, args),
      }),
    };
    const response = await handleFantasyWorkerRequest(request(), { environment, client });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ambiguous).toBeUndefined();
    expect((body.gameweeks as { outcome: string }[]).map((gw) => gw.outcome)).toEqual([
      "failed",
      "waiting",
    ]);
    expect(w.lease?.released).toBe(true);
  });
});

describe("a prize failure is visible without stopping the game or spoiling the pass (ASTRA-03)", () => {
  it("keeps the pass ok, and shows a failed prize evaluation in the response, the record and the log", async () => {
    const w = world({ prizeFailure: "fantasy_prize_rpc_failed" });
    const logged: string[] = [];
    const log = console.log;
    console.log = (line: unknown) => void logged.push(String(line));
    const response = await (async () => {
      try {
        return await handleFantasyWorkerRequest(request(), { environment, client: clientFor(w) });
      } finally {
        console.log = log;
      }
    })();
    expect(response.status).toBe(200);
    const body = (await response.json()) as Record<string, unknown>;
    // An ok pass is what the health check and the GitHub fallback look for: the
    // game kept up, so a prize problem must not turn it into something else.
    expect(body.status).toBe("ok");
    expect(body.workerCode).toBe("football_not_final");
    expect(body.prizeAttention).toBe("fantasy_prize_rpc_failed");
    expect(body.prizes).toEqual({ error: "fantasy_prize_rpc_failed" });
    expect(w.recorded[0]).toMatchObject({
      outcome: "ok",
      detail: {
        prizeAttention: "fantasy_prize_rpc_failed",
        prizes: { error: "fantasy_prize_rpc_failed" },
      },
    });
    expect(logged.join("\n")).toContain('"prizeAttention":"fantasy_prize_rpc_failed"');
    // The core game ran, the lease was freed, and prizes were asked once (no second award attempt).
    expect(body.gameweeks).toMatchObject([{ outcome: "waiting" }]);
    expect(w.lease?.released).toBe(true);
    expect(names(w).filter((n) => n === "service_evaluate_fantasy_prizes")).toHaveLength(1);
  });

  it("keeps the pass ok for a blocked prize season too, and names it", async () => {
    const w = world({
      prizes: {
        evaluatedCount: 0,
        evaluated: [],
        blocked: [{ seasonId: seasonId, reason: "fantasy_prize_season_unresolved" }],
        hasMore: false,
      },
    });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    const body = (await response.json()) as Record<string, unknown>;
    expect(response.status).toBe(200);
    expect(body.status).toBe("ok");
    expect(body.prizeAttention).toBe("fantasy_prizes_blocked");
    expect(body.prizes).toMatchObject({ blocked: ["fantasy_prize_season_unresolved"] });
    expect(w.recorded[0]).toMatchObject({
      outcome: "ok",
      detail: { prizeAttention: "fantasy_prizes_blocked" },
    });
  });

  it("says nothing about prizes on a clean pass, or on a database without prizes yet", async () => {
    const clean = world();
    const cleanResponse = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(clean),
    });
    const cleanBody = (await cleanResponse.json()) as Record<string, unknown>;
    expect(cleanBody.status).toBe("ok");
    expect(cleanBody.prizeAttention).toBeUndefined();

    const missing = world();
    const base = clientFor(missing);
    const client: FantasyWorkerRpcClient = {
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) =>
          name === "service_evaluate_fantasy_prizes"
            ? Promise.resolve({ error: { message: "not found", code: "PGRST202" } })
            : base.schema("api").rpc(name, args),
      }),
    };
    const missingResponse = await handleFantasyWorkerRequest(request(), { environment, client });
    const body = (await missingResponse.json()) as Record<string, unknown>;
    expect(body.status).toBe("ok");
    expect(body.prizeAttention).toBeUndefined();
    expect(body.prizes).toEqual({ skipped: "prizes_not_installed" });
  });

  it("does not hide a worse outcome behind the prize code", async () => {
    const w = world({ prizeFailure: "fantasy_prize_rpc_failed", failOn: ADVANCE });
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientFor(w),
    });
    // A failed gameweek skips the prize catch-up altogether; the pass stays failed.
    expect(response.status).toBe(500);
    expect(((await response.json()) as { status: string }).status).toBe("failed");
  });
});

/** A client that answers one RPC with something of its own and leaves the rest to the fake database. */
function clientWith(
  w: World,
  name: string,
  reply: () => PromiseLike<{
    data?: unknown;
    error?: { message?: string; code?: string } | null;
    status?: number;
  }>,
  times = 1,
): FantasyWorkerRpcClient {
  const base = clientFor(w);
  let used = 0;
  return {
    schema: () => ({
      rpc: (rpcName: string, args: Record<string, unknown>) =>
        rpcName === name && used++ < times ? reply() : base.schema("api").rpc(rpcName, args),
    }),
  };
}

describe("a write that failed before the timer, without a conclusive reply, is ambiguous too", () => {
  it("treats a status-0 reply (no answer from the database) to a write as unconfirmed", async () => {
    const w = world();
    const client = clientWith(w, SYNC, () =>
      Promise.resolve({
        data: null,
        error: { message: "TypeError: fetch failed", code: "" },
        status: 0,
      }),
    );
    const response = await handleFantasyWorkerRequest(request(), { environment, client });
    expect(response.status).toBe(500);
    expect(await response.json()).toMatchObject({
      status: "failed",
      workerCode: "fantasy_worker_rpc_unconfirmed",
      ambiguous: true,
      rpc: SYNC,
      settled: false,
      leaseReleased: false,
    });
    expect(w.lease?.released).toBe(false);
    expect(names(w)).not.toContain("service_fantasy_worker_lease_release");
    expect(names(w)).not.toContain("service_fantasy_lifecycle_state");
    expect(w.recorded[0]).toMatchObject({
      outcome: "failed",
      detail: {
        ambiguous: { rpc: SYNC, settled: false, leaseReleased: false, leaseExtended: true },
      },
    });
  });

  it("treats an exception from a write the same way, and starts no other gameweek", async () => {
    const w = world({
      gameweeks: [
        { id: id(1), sequence: 1, status: "live" },
        { id: id(2), sequence: 2, status: "live" },
      ],
    });
    const client = clientWith(w, ADVANCE, () => Promise.reject(new Error("socket hang up")));
    const response = await handleFantasyWorkerRequest(request(), { environment, client });
    expect(await response.json()).toMatchObject({
      workerCode: "fantasy_worker_rpc_unconfirmed",
      ambiguous: true,
      rpc: ADVANCE,
      leaseReleased: false,
    });
    expect(w.calls.some((call) => call.args.p_gameweek_id === id(2))).toBe(false);
    expect(w.lease?.released).toBe(false);
  });

  it("leaves a read, and a lease call, that fail the same way as the plain failures they were", async () => {
    const read = world();
    const readResponse = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientWith(read, "service_fantasy_lifecycle_state", () =>
        Promise.resolve({ data: null, error: { message: "fetch failed", code: "" }, status: 0 }),
      ),
    });
    const readBody = (await readResponse.json()) as Record<string, unknown>;
    expect(readBody.ambiguous).toBeUndefined();
    expect(readBody.workerCode).toBe("fantasy_worker_rpc_failed");
    expect(read.lease?.released).toBe(true);
  });

  it("keeps a settled database error, with or without a status, resumable", async () => {
    const w = world();
    const client = clientWith(w, ADVANCE, () =>
      Promise.resolve({ error: { message: "stale_update", code: "PT409" }, status: 409 }),
    );
    const response = await handleFantasyWorkerRequest(request(), { environment, client });
    const body = (await response.json()) as Record<string, unknown>;
    expect(body.ambiguous).toBeUndefined();
    expect(w.lease?.released).toBe(true);
  });
});

describe("what counts as the database having answered (a write that timed out)", () => {
  const slowReply =
    (status: number, code: string | undefined, ms = 40) =>
    () =>
      wait(ms).then(() => ({
        data: null,
        error: { message: "upstream", ...(code === undefined ? {} : { code }) },
        status,
      }));
  const run = async (reply: ReturnType<typeof slowReply>) => {
    const w = world();
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client: clientWith(w, SYNC, reply),
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 1_000,
    });
    return { w, body: (await response.json()) as Record<string, unknown> };
  };

  it("does not read a bare gateway 502/504/522 as an answer: the lease is kept", async () => {
    for (const status of [502, 504, 522]) {
      const { w, body } = await run(slowReply(status, undefined));
      expect(body).toMatchObject({ ambiguous: true, settled: false, leaseReleased: false });
      expect(w.lease?.released).toBe(false);
    }
  });

  it("does not read a 5xx with a non-database error code as an answer either", async () => {
    const { body } = await run(slowReply(502, ""));
    expect(body).toMatchObject({ settled: false, leaseReleased: false });
  });

  it("does read a 5xx that carries a PostgREST or SQLSTATE code as an answer", async () => {
    for (const code of ["PGRST000", "XX000", "57014"]) {
      const { w, body } = await run(slowReply(500, code));
      expect(body).toMatchObject({ ambiguous: true, settled: true, leaseReleased: true });
      expect(w.lease?.released).toBe(true);
    }
  });

  it("reads a 2xx and a 4xx reply as an answer", async () => {
    const ok = await run(() => wait(40).then(() => ({ data: { x: 1 }, error: null, status: 200 })));
    expect(ok.body).toMatchObject({ settled: true, leaseReleased: true });
    const refused = await run(slowReply(409, "PT409"));
    expect(refused.body).toMatchObject({ settled: true, leaseReleased: true });
  });

  it("does not read a status-0 reply, the client's own abort or network error, as an answer", async () => {
    const { w, body } = await run(slowReply(0, ""));
    expect(body).toMatchObject({ settled: false, leaseReleased: false });
    expect(w.lease?.released).toBe(false);
  });
});

describe("the record says whether the lease was really extended, and the grace is bounded", () => {
  it("records leaseExtended: false when the extension itself fails", async () => {
    const w = world({ slow: { name: SYNC, ms: 60, times: 1 } });
    const base = clientFor(w);
    const client: FantasyWorkerRpcClient = {
      schema: () => ({
        rpc: (name: string, args: Record<string, unknown>) =>
          name === "service_fantasy_worker_lease_extend"
            ? Promise.reject(new Error("socket hang up"))
            : base.schema("api").rpc(name, args),
      }),
    };
    const response = await handleFantasyWorkerRequest(request(), {
      environment,
      client,
      rpcTimeoutMs: 10,
      ambiguousGraceMs: 10,
    });
    expect(await response.json()).toMatchObject({ ambiguous: true, leaseExtended: false });
    expect(w.recorded[0]).toMatchObject({ detail: { ambiguous: { leaseExtended: false } } });
    await wait(80);
  });

  it("extends by the named constant, and does not wait past the Edge wall clock", async () => {
    expect(AMBIGUOUS_LEASE_EXTENSION_SECONDS).toBeGreaterThanOrEqual(WORKER_LEASE_SECONDS);
    expect(AMBIGUOUS_LEASE_EXTENSION_SECONDS).toBeLessThanOrEqual(900);
    const w = world();
    const base = rpcFor(w);
    const asked: number[] = [];
    const gateway: FantasyWorkerGateway = {
      rpc: async (name, args) => {
        if (name !== SYNC) return base(name, args);
        throw ambiguousRpcTimeout(SYNC, async (graceMs) => {
          asked.push(graceMs);
          return "unsettled";
        });
      },
    };
    // The clock is already at the wall: no grace is left to wait.
    const result = await runFantasyWorkerPass(gateway, {
      holder: "edge:wall",
      now: () => w.clock.now,
      ambiguousGraceMs: 5_000,
      wallClockMs: 0,
    });
    expect(asked).toEqual([0]);
    expect(result.ambiguous).toMatchObject({ rpc: SYNC, settled: false, leaseExtended: true });
    const extend = w.calls.find((call) => call.name === "service_fantasy_worker_lease_extend");
    expect(extend!.args.p_ttl_seconds).toBe(AMBIGUOUS_LEASE_EXTENSION_SECONDS);
    // And with the wall far away the configured grace is what is asked (the first
    // pass's lease is left to expire, so let it).
    w.clock.now += 421_000;
    const far = await runFantasyWorkerPass(gateway, {
      holder: "edge:wall2",
      now: () => w.clock.now,
      ambiguousGraceMs: 5_000,
    });
    expect(asked).toEqual([0, 5_000]);
    expect(far.ambiguous?.settled).toBe(false);
  });
});

describe("replyShowsStatementOver", () => {
  it("is the rule the gateway uses", () => {
    expect(replyShowsStatementOver({})).toBe(true);
    expect(replyShowsStatementOver({ status: 200 })).toBe(true);
    expect(replyShowsStatementOver({ status: 409, error: { code: "PT409" } })).toBe(true);
    expect(replyShowsStatementOver({ status: 0 })).toBe(false);
    expect(replyShowsStatementOver({ status: 504 })).toBe(false);
    expect(replyShowsStatementOver({ status: 503, error: { code: "" } })).toBe(false);
    expect(replyShowsStatementOver({ status: 500, error: { code: "PGRST001" } })).toBe(true);
    expect(replyShowsStatementOver({ status: 500, error: { code: "XX000" } })).toBe(true);
    expect(unconfirmedWrite("service_fantasy_lifecycle_state", null)).toBeNull();
    expect(unconfirmedWrite("service_sync_fantasy_calendar", null)).not.toBeNull();
    expect(unconfirmedWrite("service_sync_fantasy_calendar", { status: 200 })).toBeNull();
    expect(unconfirmedWrite("some_new_rpc", { status: 0 })).not.toBeNull();
  });
});

describe("the function is wired up", () => {
  const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

  it("is deployed without a JWT, like the other scheduled functions, and maps zod for Deno", () => {
    const config = read("../../config.toml");
    expect(config).toContain("[functions.fantasy-lifecycle-worker]");
    expect(config).toContain('entrypoint = "./functions/fantasy-lifecycle-worker/index.ts"');
    expect(JSON.parse(read("../fantasy-lifecycle-worker/deno.json")).imports.zod).toMatch(
      /^npm:zod@4\./,
    );
    const pinned = JSON.parse(read("../../../package.json")).dependencies.zod as string;
    expect(pinned.replace(/^\^/, "").split(".")[0]).toBe("4");
  });

  it("imports nothing a Deno bundle cannot reach", () => {
    // Everything the Edge function loads lives under supabase/functions, with
    // explicit .ts extensions; only `zod` is a bare specifier.
    for (const file of [
      "fantasy-lifecycle-handler.ts",
      "fantasy-lifecycle-worker.ts",
      "fantasy-adaptive-scoring.ts",
      "fantasy-scoring-core.ts",
      "fantasy-substitutions-core.ts",
    ]) {
      const imports = [...read(file).matchAll(/^(?:import|export)[^;]*?from\s+"([^"]+)"/gms)].map(
        (match) => match[1]!,
      );
      for (const specifier of imports) {
        expect(specifier === "zod" || /^\.\/[a-z0-9-]+\.ts$/.test(specifier)).toBe(true);
      }
    }
  });
});
