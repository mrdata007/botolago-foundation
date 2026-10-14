import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_BUDGET_MS,
  handleFantasyWorkerRequest,
  workerLimits,
  type FantasyWorkerRpcClient,
} from "./fantasy-lifecycle-handler.ts";
import {
  acquireWorkerLease,
  databaseWorkerStatus,
  leasedGateway,
  runFantasyWorkerPass,
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
    ...overrides,
  };
}

/** An in-memory database behind the worker's RPCs, lease semantics included. */
function rpcFor(w: World) {
  let counter = 0;
  return async (name: string, args: Record<string, unknown>): Promise<unknown> => {
    w.calls.push({ name, args });
    w.clock.now += w.rpcMs;
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
        return { evaluatedCount: 0, evaluated: [], blocked: [], hasMore: false };
      default:
        throw new Error(`unexpected_rpc_${name}`);
    }
  };
}

function gatewayFor(w: World): FantasyWorkerGateway {
  const call = rpcFor(w);
  return { rpc: (name, args) => call(name, args) };
}

function clientFor(w: World): FantasyWorkerRpcClient {
  const call = rpcFor(w);
  return {
    schema: () => ({
      rpc: async (name: string, args: Record<string, unknown>) => {
        try {
          return { data: await call(name, args), error: null };
        } catch (error) {
          return { data: null, error: { message: (error as Error).message } };
        }
      },
    }),
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

  it("works without a lease on a database that has none yet (unmanaged)", async () => {
    const w = world();
    const base = rpcFor(w);
    const gateway: FantasyWorkerGateway = {
      rpc: async (name, args) => {
        if (name.startsWith("service_fantasy_worker_lease"))
          throw Object.assign(new Error("fantasy_worker_rpc_failed"), {
            postgrestCode: "PGRST202",
          });
        return base(name, args);
      },
    };
    const result = await runFantasyWorkerPass(gateway, {
      holder: "edge:t6",
      now: () => w.clock.now,
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
