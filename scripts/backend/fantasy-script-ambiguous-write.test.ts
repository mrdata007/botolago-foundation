import { describe, expect, test } from "bun:test";
import {
  calendarSyncSchema,
  orchestrateFantasySeason,
  orchestratorRpcGateways,
  renderHealthSummary,
  type OrchestratorGateway,
} from "./fantasy-season-orchestrator";
import {
  holdLeaseForAmbiguousWrite,
  lifecycleRpcGateway,
  runManualWorker,
  ambiguousRpcTimeout,
  type RpcApiClient,
} from "./fantasy-lifecycle-runner";

// SEC-01 residual: the GitHub orchestrator and the manual runner follow the same rule as
// the Edge worker. A write that timed out, or failed with no reply from the database, may
// still commit: the pass stops, runs no other gameweek, keeps the lease (extended) and
// releases it only after the original request really answered. These tests use fake
// clients only; no database, no network.

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));
const now = new Date("2026-09-24T22:00:00Z");

const ADVANCE = "service_advance_fantasy_lifecycle";
const STATE = "service_fantasy_lifecycle_state";
const SYNC = "service_sync_fantasy_calendar";
const PRIZES = "service_evaluate_fantasy_prizes";
const WATCH = "service_fantasy_deadline_watch";
const LEASE_EXTEND = "service_fantasy_worker_lease_extend";
const LEASE_RELEASE = "service_fantasy_worker_lease_release";

type Reply = { data?: unknown; error?: { message: string; code?: string } | null; status?: number };

interface Server {
  /** Sequence numbers of the locked gameweeks the calendar reports. */
  sequences: number[];
  /** Really slow RPCs: `ms` of wall-clock time per call, for the first `times` calls. */
  slow: Record<string, { ms: number; times?: number }>;
  /** A fixed reply (instead of the normal one) for an RPC. */
  reply: Record<string, () => Reply>;
  noLeaseFunction?: boolean;
  calls: string[];
  /** Start / end of every RPC on the "server", in order. */
  events: string[];
  lease: { token: string; released: boolean; extendedSeconds: number[] } | null;
  slowed: Record<string, number>;
}

function server(overrides: Partial<Server> = {}): Server {
  return {
    sequences: [1],
    slow: {},
    reply: {},
    calls: [],
    events: [],
    lease: null,
    slowed: {},
    ...overrides,
  };
}

function calendar(s: Server) {
  return calendarSyncSchema.parse({
    schemaVersion: 1,
    seasonId: id(1),
    seasonStatus: "active",
    expectedClubs: 16,
    gameweeksCreated: 0,
    assignmentsAdded: 0,
    assignmentsSuperseded: 0,
    kickoffsRealigned: 0,
    deadlineChanges: 0,
    blockedRounds: 0,
    rounds: [],
    gameweeks: s.sequences.map((sequence) => ({
      id: id(100 + sequence),
      sequence,
      status: "locked",
      deadlineAt: "2026-09-20T18:30:00Z",
      scoringInputVersion: 1,
      nextGameweekId: null,
      advancedToGameweekId: null,
    })),
  });
}

async function answer(s: Server, name: string, args: Record<string, unknown>): Promise<Reply> {
  const lifecycleShape = (extra: Record<string, unknown> = {}) => ({
    gameweekId: args.p_gameweek_id,
    seasonId: id(1),
    status: "locked",
    lockVersion: 5,
    sequenceNumber: s.sequences[0],
    scoringInputVersion: 1,
    ...extra,
  });
  const forced = s.reply[name];
  if (forced) return forced();
  switch (name) {
    case "service_fantasy_worker_lease_acquire":
      if (s.noLeaseFunction)
        return { data: null, error: { message: "not_found", code: "PGRST202" }, status: 404 };
      if (s.lease && !s.lease.released)
        return { data: { acquired: false, reason: "held", holder: "edge:other" }, status: 200 };
      s.lease = { token: id(990), released: false, extendedSeconds: [] };
      return { data: { acquired: true, token: id(990), holder: args.p_holder }, status: 200 };
    case LEASE_EXTEND: {
      const ok = s.lease !== null && s.lease.token === args.p_token && !s.lease.released;
      if (ok) s.lease!.extendedSeconds.push(Number(args.p_ttl_seconds));
      return { data: { extended: ok }, status: 200 };
    }
    case LEASE_RELEASE: {
      const ok = s.lease !== null && s.lease.token === args.p_token && !s.lease.released;
      if (ok) s.lease!.released = true;
      return { data: { released: ok }, status: 200 };
    }
    case SYNC:
      return { data: calendar(s), status: 200 };
    case STATE:
      return { data: lifecycleShape(), status: 200 };
    case ADVANCE:
      return {
        data: lifecycleShape({
          changed: false,
          hasMore: false,
          waitingReason: "football_not_final",
        }),
        status: 200,
      };
    case WATCH:
      return {
        data: {
          schemaVersion: 1,
          seasonId: id(1),
          seasonStatus: "active",
          warnHours: 72,
          escalateHours: 24,
          serverTime: now.toISOString(),
          remediation: "docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md",
          gameweeks: [],
        },
        status: 200,
      };
    case PRIZES:
      return {
        data: { evaluatedCount: 0, evaluated: [], blocked: [], hasMore: false },
        status: 200,
      };
    case "fantasy_gameweeks":
      return {
        data: {
          items: s.sequences.map((sequence) => ({
            id: id(100 + sequence),
            sequence,
            name: `Journée ${sequence}`,
            deadlineAt: "2026-09-20T18:30:00Z",
            startsAt: "2026-09-20T18:30:00Z",
            endsAt: "2026-12-31T00:00:00Z",
            status: "locked",
            pointsState: "provisional",
          })),
          nextCursor: null,
        },
        status: 200,
      };
    default:
      return {
        data: null,
        error: { message: `unexpected_rpc_${name}`, code: "P0001" },
        status: 400,
      };
  }
}

/**
 * A client shaped like supabase-js: `rpc(...)` is a thenable that starts the request when
 * awaited, and `.abortSignal()` answers the client at once with status 0 (as postgrest-js
 * does) while the "server" carries on: aborting a request proves nothing about the statement.
 */
function fakeApi(s: Server): RpcApiClient {
  return {
    rpc(name, args) {
      let signal: AbortSignal | undefined;
      const builder = {
        then<A = Reply, B = never>(
          onfulfilled?: ((value: Reply) => A | PromiseLike<A>) | null,
          onrejected?: ((reason: unknown) => B | PromiseLike<B>) | null,
        ) {
          s.calls.push(name);
          const run = (async (): Promise<Reply> => {
            s.events.push(`start:${name}`);
            const slow = s.slow[name];
            if (slow && (s.slowed[name] ?? 0) < (slow.times ?? Infinity)) {
              s.slowed[name] = (s.slowed[name] ?? 0) + 1;
              await wait(slow.ms);
            }
            try {
              return await answer(s, name, args);
            } finally {
              s.events.push(`end:${name}`);
            }
          })();
          const aborted = signal
            ? new Promise<Reply>((resolve) => {
                const reply: Reply = { data: null, error: { message: "AbortError" }, status: 0 };
                if (signal!.aborted) resolve(reply);
                else signal!.addEventListener("abort", () => resolve(reply));
              })
            : null;
          return (aborted ? Promise.race([run, aborted]) : run).then(onfulfilled, onrejected);
        },
        abortSignal(next: AbortSignal) {
          signal = next;
          return builder;
        },
      };
      return builder;
    },
  };
}

const count = (s: Server, name: string) => s.calls.filter((call) => call === name).length;

function orchestratorGateway(s: Server, timeoutMs: number): OrchestratorGateway {
  return {
    ...orchestratorRpcGateways(fakeApi(s), timeoutMs),
    async ingestPerformances() {
      throw new Error("not_expected");
    },
  };
}

const run = (g: OrchestratorGateway, ambiguousGraceMs: number) =>
  orchestrateFantasySeason(g, {
    now,
    dataSource: "sofascore",
    ambiguousGraceMs,
    workerLease: { holder: "github:42", deferToDatabase: false },
  });

describe("GitHub orchestrator: a write that timed out is ambiguous (SEC-01)", () => {
  test("a slow write exceeds the timeout: no second gameweek, the lease stays, the output says so", async () => {
    // The audit's timing: a 10 ms timeout and a slow write.
    const s = server({ sequences: [1, 2], slow: { [ADVANCE]: { ms: 120, times: 1 } } });
    const summary = await run(orchestratorGateway(s, 10), 20);

    // The write did not answer within the grace: the pass is red and names it.
    expect(summary.verdict).toBe("failed");
    expect(summary.workers).toHaveLength(1);
    expect(summary.workers[0]).toMatchObject({
      sequence: 1,
      outcome: "failed",
      code: "fantasy_worker_rpc_timeout",
    });
    expect(summary.ambiguousWrite).toEqual({
      rpc: ADVANCE,
      leaseExtended: true,
      settled: false,
      leaseReleased: false,
    });
    // The second gameweek was never started and is reported as not run.
    expect(count(s, STATE)).toBe(1);
    expect(summary.deferredGameweeks).toEqual([id(102)]);
    // The lease was pushed out a full lease and not released, while the write was
    // still running on the server.
    expect(s.lease?.extendedSeconds).toEqual([420]);
    expect(s.lease?.released).toBe(false);
    expect(s.events).not.toContain(`end:${ADVANCE}`);
    expect(count(s, LEASE_RELEASE)).toBe(0);
    // No further write: no prize catch-up, no second calendar sync.
    expect(count(s, PRIZES)).toBe(0);
    expect(count(s, SYNC)).toBe(1);
    expect(summary.prizes).toEqual({ skipped: "write_in_doubt" });
    // The reads still ran, so the evidence and the alert hold.
    expect(count(s, WATCH)).toBe(1);
    expect(renderHealthSummary(summary)).toContain("Write in doubt");
    expect(renderHealthSummary(summary)).toContain("Do not start another worker until it expires");
    expect(renderHealthSummary(summary)).toContain(ADVANCE);

    // The original write finally ends; the lease is still never released.
    await wait(200);
    expect(s.events).toContain(`end:${ADVANCE}`);
    expect(s.lease?.released).toBe(false);
    expect(count(s, LEASE_RELEASE)).toBe(0);
  });

  test("the lease is released only after the original request has really answered", async () => {
    const s = server({ sequences: [1, 2], slow: { [ADVANCE]: { ms: 60, times: 1 } } });
    const summary = await run(orchestratorGateway(s, 10), 2_000);
    expect(summary.ambiguousWrite).toEqual({
      rpc: ADVANCE,
      leaseExtended: true,
      settled: true,
      leaseReleased: true,
    });
    // Ordering on the server: the write ended before the lease was released.
    expect(s.events.indexOf(`end:${ADVANCE}`)).toBeGreaterThan(-1);
    expect(s.events.indexOf(`end:${ADVANCE}`)).toBeLessThan(
      s.events.indexOf(`start:${LEASE_RELEASE}`),
    );
    expect(s.lease?.released).toBe(true);
    // The row no longer tells the operator to wait once the lease is released.
    expect(renderHealthSummary(summary)).toContain("Write in doubt");
    expect(renderHealthSummary(summary)).not.toContain("Do not start another worker");
    // Still stopped: no second gameweek, no further write, still red.
    expect(count(s, STATE)).toBe(1);
    expect(count(s, PRIZES)).toBe(0);
    expect(summary.verdict).toBe("failed");
  });

  test("a write that fails with no reply from the database is as unsettled as a timeout", async () => {
    for (const reply of [
      () => ({ data: null, error: { message: "fetch failed" }, status: 0 }),
      () => ({ data: null, error: { message: "bad gateway" }, status: 502 }),
    ]) {
      const s = server({ sequences: [1, 2], reply: { [ADVANCE]: reply } });
      const summary = await run(orchestratorGateway(s, 1_000), 20);
      expect(summary.workers[0]).toMatchObject({ code: "fantasy_worker_rpc_unconfirmed" });
      expect(summary.ambiguousWrite).toMatchObject({
        rpc: ADVANCE,
        leaseExtended: true,
        settled: false,
        leaseReleased: false,
      });
      expect(count(s, STATE)).toBe(1);
      expect(count(s, LEASE_RELEASE)).toBe(0);
      expect(s.lease?.released).toBe(false);
    }
  });

  test("a write the database answered with an error is a settled failure: the other gameweek still runs", async () => {
    const s = server({
      sequences: [1, 2],
      reply: {
        [ADVANCE]: () => ({
          data: null,
          error: { message: "stale_update", code: "P0001" },
          status: 400,
        }),
      },
    });
    const summary = await run(orchestratorGateway(s, 1_000), 20);
    expect(summary.workers).toHaveLength(2);
    expect(summary.workers.every((worker) => worker.code === "stale_update")).toBe(true);
    expect(summary.ambiguousWrite).toBeUndefined();
    expect(count(s, LEASE_RELEASE)).toBe(1);
    expect(count(s, PRIZES)).toBe(1);
    expect(count(s, SYNC)).toBe(2);
  });

  test("a read that timed out stays an ordinary failure: the next gameweek runs, the lease is freed", async () => {
    const s = server({ sequences: [1, 2], slow: { [STATE]: { ms: 120, times: 1 } } });
    const summary = await run(orchestratorGateway(s, 10), 20);
    expect(summary.workers).toHaveLength(2);
    expect(summary.workers[0]).toMatchObject({
      sequence: 1,
      outcome: "failed",
      code: "fantasy_worker_rpc_timeout",
    });
    expect(summary.workers[1]).toMatchObject({ sequence: 2, outcome: "waiting" });
    expect(summary.verdict).toBe("failed");
    expect(summary.ambiguousWrite).toBeUndefined();
    expect(summary).not.toHaveProperty("ambiguousWrite");
    expect(s.lease?.released).toBe(true);
    expect(s.lease?.extendedSeconds).toEqual([]);
    expect(count(s, PRIZES)).toBe(1);
    expect(count(s, SYNC)).toBe(2);
    await wait(150);
  });

  test("a call outside the lifecycle (the deadline watch) keeps its old behaviour at the timeout", async () => {
    const s = server({ slow: { [WATCH]: { ms: 120, times: 1 } } });
    const summary = await run(orchestratorGateway(s, 10), 20);
    // Waiting, named by the watch error; never an ambiguous write.
    expect(summary.verdict).toBe("waiting");
    expect(summary.deadlineWatch).toMatchObject({ error: "fantasy_orchestrator_rpc_failed" });
    expect(summary).not.toHaveProperty("ambiguousWrite");
    expect(s.lease?.released).toBe(true);
    await wait(150);
  });

  test("a clean pass is unchanged", async () => {
    const s = server({ sequences: [1, 2] });
    const summary = await run(orchestratorGateway(s, 1_000), 20);
    expect(summary.verdict).toBe("waiting");
    expect(summary.workers.map((worker) => worker.outcome)).toEqual(["waiting", "waiting"]);
    expect(summary).not.toHaveProperty("ambiguousWrite");
    expect(summary.deferredGameweeks).toEqual([]);
    expect(count(s, LEASE_RELEASE)).toBe(1);
    expect(s.lease?.released).toBe(true);
    expect(s.lease?.extendedSeconds).toEqual([]);
    expect(count(s, PRIZES)).toBe(1);
    expect(count(s, SYNC)).toBe(2);
    expect(summary.prizes).toMatchObject({ evaluatedCount: 0 });
    expect(renderHealthSummary(summary)).not.toContain("Write in doubt");
  });

  test("a gateway with no lifecycle path (as every earlier caller) runs the lifecycle on rpc", async () => {
    const s = server({ sequences: [1, 2] });
    const plain: OrchestratorGateway = {
      rpc: orchestratorRpcGateways(fakeApi(s), 1_000).rpc,
      async ingestPerformances() {
        throw new Error("not_expected");
      },
    };
    const summary = await run(plain, 20);
    expect(summary.workers).toHaveLength(2);
    expect(count(s, LEASE_RELEASE)).toBe(1);
  });

  test("a database without the lease function still stops on an ambiguous write", async () => {
    const s = server({
      sequences: [1, 2],
      noLeaseFunction: true,
      slow: { [ADVANCE]: { ms: 120, times: 1 } },
    });
    const summary = await run(orchestratorGateway(s, 10), 20);
    expect(summary.ambiguousWrite).toEqual({
      rpc: ADVANCE,
      leaseExtended: false,
      settled: false,
      leaseReleased: false,
    });
    expect(count(s, STATE)).toBe(1);
    expect(count(s, PRIZES)).toBe(0);
    await wait(200);
  });
});

describe("manual worker runner: a write that timed out is ambiguous (SEC-01)", () => {
  const config = { gameweekId: id(101), calculationVersion: 1 };

  test("the audit's repro: a 10 ms timeout and a slow write keep the lease and are reported", async () => {
    const s = server({ slow: { [ADVANCE]: { ms: 120, times: 1 } } });
    const result = await runManualWorker(
      lifecycleRpcGateway(fakeApi(s), undefined, 10),
      config,
      "manual:1",
      {
        ambiguousGraceMs: 20,
      },
    );
    expect(result).toEqual({
      outcome: "failed",
      code: "fantasy_worker_rpc_timeout",
      ambiguous: { rpc: ADVANCE, leaseExtended: true, settled: false, leaseReleased: false },
    });
    // The lease was not released while the write was still running...
    expect(s.events).not.toContain(`end:${ADVANCE}`);
    expect(s.lease?.released).toBe(false);
    expect(s.lease?.extendedSeconds).toEqual([420]);
    // ...nor after it ended: it is left to expire.
    await wait(200);
    expect(s.events).toContain(`end:${ADVANCE}`);
    expect(s.lease?.released).toBe(false);
    expect(count(s, LEASE_RELEASE)).toBe(0);
  });

  test("the lease is released only once the original request answered", async () => {
    const s = server({ slow: { [ADVANCE]: { ms: 60, times: 1 } } });
    const result = await runManualWorker(
      lifecycleRpcGateway(fakeApi(s), undefined, 10),
      config,
      "manual:1",
      {
        ambiguousGraceMs: 2_000,
      },
    );
    expect(result).toMatchObject({
      outcome: "failed",
      ambiguous: { settled: true, leaseReleased: true },
    });
    expect(s.events.indexOf(`end:${ADVANCE}`)).toBeLessThan(
      s.events.indexOf(`start:${LEASE_RELEASE}`),
    );
    expect(s.lease?.released).toBe(true);
  });

  test("a write that fails with no reply from the database is unconfirmed", async () => {
    const s = server({
      reply: { [ADVANCE]: () => ({ data: null, error: { message: "bad gateway" }, status: 504 }) },
    });
    const result = await runManualWorker(lifecycleRpcGateway(fakeApi(s)), config, "manual:1", {
      ambiguousGraceMs: 20,
    });
    expect(result).toMatchObject({
      outcome: "failed",
      code: "fantasy_worker_rpc_unconfirmed",
      ambiguous: { leaseExtended: true, settled: false, leaseReleased: false },
    });
    expect(s.lease?.released).toBe(false);
  });

  test("a read that timed out is an ordinary failure and frees the lease", async () => {
    const s = server({ slow: { [STATE]: { ms: 120, times: 1 } } });
    const result = await runManualWorker(
      lifecycleRpcGateway(fakeApi(s), undefined, 10),
      config,
      "manual:1",
    );
    expect(result).toEqual({ outcome: "failed", code: "fantasy_worker_rpc_timeout" });
    expect(s.lease?.released).toBe(true);
    expect(s.lease?.extendedSeconds).toEqual([]);
    await wait(150);
  });

  test("a settled database error is an ordinary failure and frees the lease", async () => {
    const s = server({
      reply: {
        [ADVANCE]: () => ({
          data: null,
          error: { message: "stale_update", code: "P0001" },
          status: 400,
        }),
      },
    });
    const result = await runManualWorker(lifecycleRpcGateway(fakeApi(s)), config, "manual:1");
    expect(result).toEqual({ outcome: "failed", code: "stale_update" });
    expect(s.lease?.released).toBe(true);
  });

  test("a clean pass is unchanged: result returned, lease taken and freed", async () => {
    const s = server();
    const result = await runManualWorker(lifecycleRpcGateway(fakeApi(s)), config, "manual:1");
    expect(result.outcome).toBe("ok");
    expect(s.lease?.released).toBe(true);
    expect(s.calls[0]).toBe("service_fantasy_worker_lease_acquire");
    expect(s.calls.at(-1)).toBe(LEASE_RELEASE);
  });

  test("another holder keeps the lease: refused, and nothing of theirs is touched", async () => {
    const s = server();
    s.lease = { token: id(555), released: false, extendedSeconds: [] };
    const result = await runManualWorker(lifecycleRpcGateway(fakeApi(s)), config, "manual:1");
    expect(result).toEqual({ outcome: "failed", code: "fantasy_worker_lease_held" });
    expect(s.lease.released).toBe(false);
    expect(count(s, STATE)).toBe(0);
  });

  test("a database without the lease function runs unmanaged, as before", async () => {
    const s = server({ noLeaseFunction: true });
    const result = await runManualWorker(lifecycleRpcGateway(fakeApi(s)), config, "manual:1");
    expect(result.outcome).toBe("ok");
    expect(count(s, LEASE_RELEASE)).toBe(0);
  });
});

describe("the shared lease-keeping step", () => {
  test("extends first, waits for the answer, and releases only if it came", async () => {
    for (const outcome of ["answered", "unsettled"] as const) {
      const s = server();
      s.lease = { token: id(990), released: false, extendedSeconds: [] };
      const call = async (name: string, args: Record<string, unknown>) =>
        (await answer(s, name, args)).data;
      const error = ambiguousRpcTimeout(ADVANCE, async () => outcome);
      const held = await holdLeaseForAmbiguousWrite(call, id(990), error, 5);
      expect(held).toEqual({
        rpc: ADVANCE,
        leaseExtended: true,
        settled: outcome === "answered",
        leaseReleased: outcome === "answered",
      });
      expect(s.lease.released).toBe(outcome === "answered");
    }
  });

  test("never throws with a token either: a failing call, and a request that did answer", async () => {
    const calls: string[] = [];
    const error = ambiguousRpcTimeout(ADVANCE, async () => "answered");
    const held = await holdLeaseForAmbiguousWrite(
      async (name) => {
        calls.push(name);
        throw new Error("down");
      },
      id(990),
      error,
      5,
    );
    // The extension and the release both failed; the answer is still reported.
    expect(held).toEqual({
      rpc: ADVANCE,
      leaseExtended: false,
      settled: true,
      leaseReleased: false,
    });
    expect(calls).toEqual([LEASE_EXTEND, LEASE_RELEASE]);
  });

  test("a function grace is read after the extension, not before", async () => {
    let clock = 0;
    const asked: number[] = [];
    await holdLeaseForAmbiguousWrite(
      async () => {
        clock += 8_000;
        return { extended: true };
      },
      id(990),
      ambiguousRpcTimeout(ADVANCE, async (graceMs) => {
        asked.push(graceMs);
        return "unsettled";
      }),
      () => 10_000 - clock,
    );
    expect(asked).toEqual([2_000]);
  });

  test("never throws, and without a token touches no lease", async () => {
    const calls: string[] = [];
    const error = ambiguousRpcTimeout(ADVANCE, async () => {
      throw new Error("boom");
    });
    const held = await holdLeaseForAmbiguousWrite(
      async (name) => {
        calls.push(name);
        throw new Error("down");
      },
      null,
      error,
      5,
    );
    expect(held).toEqual({
      rpc: ADVANCE,
      leaseExtended: false,
      settled: false,
      leaseReleased: false,
    });
    expect(calls).toEqual([]);
  });
});
