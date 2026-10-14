// The Edge Function `fantasy-lifecycle-worker`: one bounded pass of the Fantasy
// lifecycle worker (scoring, mode selection, finalization, close/lock, the next
// gameweek's postwork), woken every 10 minutes by pg_cron through pg_net
// (app_private.fantasy_worker_tick, migration 20261013170000) while a gameweek
// has work. docs/backend/FANTASY_WORKER_SCHEDULE.md.
//
// It runs the very TypeScript the GitHub orchestrator runs
// (fantasy-lifecycle-worker.ts) with the service role, and none of the
// provider steps: with SofaScore as the source those were skipped anyway.
//
// Authenticated with the scheduler token (scheduler-token.ts), not a JWT, so it
// is deployed with verify_jwt = false. Gates, checked again here and not only in
// the tick: the database refuses an `edge:` lease while the worker switch is off
// (api.service_fantasy_worker_lease_acquire), so a stray call does nothing.
//
// Dependency-free apart from the worker (and its zod), so it runs under Bun
// (tests) and Deno (the Edge Function).

import { schedulerTokenRefusal } from "./scheduler-token.ts";
import {
  ambiguousRpcTimeout,
  replyShowsStatementOver,
  rpcFailure,
  rpcMayWrite,
  runFantasyWorkerPass,
  unconfirmedWrite,
  type FantasyWorkerGateway,
  type WorkerPassResult,
} from "./fantasy-lifecycle-worker.ts";

export interface FantasyWorkerRpcResult {
  data?: unknown;
  error?: { message?: string; code?: string } | null;
  /** The HTTP status supabase-js reports; 0 when no reply came back (network error, abort). */
  status?: number;
}

/** A request builder as supabase-js returns it: awaitable, and able to take an abort signal. */
export interface FantasyWorkerRpcRequest extends PromiseLike<FantasyWorkerRpcResult> {
  abortSignal?(signal: AbortSignal): PromiseLike<FantasyWorkerRpcResult>;
}

export interface FantasyWorkerRpcClient {
  schema(name: "api"): {
    rpc(name: string, args: Record<string, unknown>): FantasyWorkerRpcRequest;
  };
}

export interface FantasyWorkerDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: FantasyWorkerRpcClient;
  readonly now?: () => number;
  readonly randomHex?: (bytes: number) => string;
  /** Per-RPC timeout; the pass budget leaves room for one more after it ends. */
  readonly rpcTimeoutMs?: number;
  /** How long to wait for a timed-out write to answer before leaving the lease to expire. */
  readonly ambiguousGraceMs?: number;
  /**
   * Run on a database without the lease function instead of refusing. For a
   * deliberate, operator-run caller only: the scheduled Edge function never sets
   * it (index.ts), and the request body has no such switch.
   */
  readonly allowUnmanaged?: boolean;
}

const MAX_REQUEST_BYTES = 4096;
/** The Edge wall-clock limit is 150 s (free) or 400 s (paid); 100 s leaves a 30 s RPC and the log. */
export const DEFAULT_BUDGET_MS = 100_000;
export const DEFAULT_MAX_GAMEWEEKS = 4;
export const DEFAULT_MAX_CALLS_PER_GAMEWEEK = 1500;
const DEFAULT_RPC_TIMEOUT_MS = 30_000;

function json(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    },
  });
}

function defaultRandomHex(bytes: number): string {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (value) => value.toString(16).padStart(2, "0")).join("");
}

function boundedInteger(raw: string | undefined, fallback: number, min: number, max: number) {
  if (raw === undefined || !/^\d{1,7}$/.test(raw.trim())) return fallback;
  return Math.min(max, Math.max(min, Number(raw.trim())));
}

/** The knobs the secrets can turn, clamped. */
export function workerLimits(environment: Readonly<Record<string, string | undefined>>) {
  return {
    budgetMs: boundedInteger(
      environment.FANTASY_WORKER_BUDGET_MS,
      DEFAULT_BUDGET_MS,
      10_000,
      120_000,
    ),
    maxGameweeks: boundedInteger(
      environment.FANTASY_WORKER_MAX_GAMEWEEKS,
      DEFAULT_MAX_GAMEWEEKS,
      1,
      8,
    ),
    maxCallsPerGameweek: boundedInteger(
      environment.FANTASY_WORKER_MAX_CALLS,
      DEFAULT_MAX_CALLS_PER_GAMEWEEK,
      50,
      5000,
    ),
  };
}

function gatewayFor(client: FantasyWorkerRpcClient, timeoutMs: number): FantasyWorkerGateway {
  type Answer =
    | { kind: "answered"; result: FantasyWorkerRpcResult }
    | { kind: "threw"; error: unknown };
  return {
    async rpc(name, args) {
      const controller = new AbortController();
      const builder = client.schema("api").rpc(name, args);
      // Handed to the client where it can take one. It only frees the client's
      // side: the database statement may carry on, so it is never proof of a stop.
      const request =
        typeof builder.abortSignal === "function"
          ? builder.abortSignal(controller.signal)
          : builder;
      // Always becomes a value, so a request we stopped waiting for can never
      // reject unobserved.
      const answer: Promise<Answer> = Promise.resolve(request).then(
        (result): Answer => ({ kind: "answered", result }),
        (error): Answer => ({ kind: "threw", error }),
      );
      let timer: ReturnType<typeof setTimeout> | undefined;
      const timeout = new Promise<"timeout">((resolve) => {
        timer = setTimeout(() => resolve("timeout"), timeoutMs);
      });
      const first = await Promise.race([answer, timeout]);
      if (timer) clearTimeout(timer);
      if (first === "timeout") {
        if (!rpcMayWrite(name)) {
          controller.abort();
          throw new Error("fantasy_worker_rpc_timeout");
        }
        // A write that may still be running: not a settled failure. The pass
        // keeps its lease and stops (fantasy-lifecycle-worker.ts).
        throw ambiguousRpcTimeout(name, async (graceMs) => {
          let grace: ReturnType<typeof setTimeout> | undefined;
          const waited = new Promise<"grace">((resolve) => {
            grace = setTimeout(() => resolve("grace"), Math.max(0, graceMs));
          });
          const winner = await Promise.race([answer, waited]);
          if (grace) clearTimeout(grace);
          // Only a reply from the database shows the statement is over. A failure
          // on the client's side (status 0: network, abort) or a gateway 5xx with no
          // database error code shows nothing (replyShowsStatementOver).
          if (
            winner !== "grace" &&
            winner.kind === "answered" &&
            replyShowsStatementOver(winner.result)
          )
            return "answered";
          controller.abort();
          return "unsettled";
        });
      }
      // A write that failed before the timer without a conclusive reply (an
      // exception, status 0, a bare gateway 5xx) is no more settled than a timeout.
      const unconfirmed = unconfirmedWrite(name, first.kind === "threw" ? null : first.result);
      if (unconfirmed) {
        controller.abort();
        throw unconfirmed;
      }
      if (first.kind === "threw") throw first.error;
      const result = first.result;
      if (result.error) {
        // Never carry SQL details, snapshots or credentials into a log or a row.
        const message = String(result.error.message ?? "");
        throw rpcFailure(
          /^[a-z][a-z0-9_]{2,100}$/.test(message) ? message : "fantasy_worker_rpc_failed",
          result.error.code,
        );
      }
      return result.data;
    },
  };
}

/** The row api.service_fantasy_worker_record_run stores. */
export function runRecord(holder: string, result: WorkerPassResult) {
  return {
    holder,
    outcome: result.outcome,
    startedAt: result.startedAt,
    durationMs: result.durationMs,
    gameweekId: result.gameweekId,
    gameweekSequence: result.gameweekSequence,
    workerCode: result.workerCode,
    calls: result.calls,
    detail: {
      gameweeks: result.gameweeks,
      skipped: result.skipped,
      deferred: result.deferred,
      ...(result.heldBy ? { heldBy: result.heldBy } : {}),
      ...(result.prizes ? { prizes: result.prizes } : {}),
      ...(result.prizeAttention ? { prizeAttention: result.prizeAttention } : {}),
      // A write that timed out and may still be running: which one, whether it
      // answered afterwards, and whether the lease was freed or left to expire.
      ...(result.ambiguous ? { ambiguous: result.ambiguous } : {}),
      ...(result.missingFunction ? { missingFunction: result.missingFunction } : {}),
    },
  };
}

export async function handleFantasyWorkerRequest(
  request: Request,
  dependencies: FantasyWorkerDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  // Checked in-process, before any database call (scheduler-token.ts).
  const refusal = schedulerTokenRefusal(request, dependencies.environment);
  if (refusal) return refusal;

  const text = await request.text();
  if (text.length > MAX_REQUEST_BYTES) return json(413, { error: "request_too_large" });
  if (text.trim() !== "") {
    let body: unknown;
    try {
      body = JSON.parse(text);
    } catch {
      return json(400, { error: "invalid_request" });
    }
    const job = (body as { job?: unknown } | null)?.job;
    if (typeof body !== "object" || body === null || (job !== undefined && job !== "lifecycle")) {
      return json(400, { error: "invalid_request" });
    }
  }

  const clock = dependencies.now ?? Date.now;
  const holder = `edge:${(dependencies.randomHex ?? defaultRandomHex)(6)}`;
  const gateway = gatewayFor(
    dependencies.client,
    dependencies.rpcTimeoutMs ?? DEFAULT_RPC_TIMEOUT_MS,
  );
  const limits = workerLimits(dependencies.environment);

  let result: WorkerPassResult;
  try {
    result = await runFantasyWorkerPass(gateway, {
      holder,
      now: clock,
      ...limits,
      ...(dependencies.ambiguousGraceMs !== undefined
        ? { ambiguousGraceMs: dependencies.ambiguousGraceMs }
        : {}),
      ...(dependencies.allowUnmanaged ? { allowUnmanaged: true } : {}),
    });
  } catch (error) {
    // The lease or the work list could not be read at all (database unreachable).
    const code =
      error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
        ? error.message
        : "fantasy_worker_failed";
    console.log(JSON.stringify({ event: "fantasy_lifecycle_worker", outcome: "failed", code }));
    return json(500, { status: "failed", code });
  }

  // A pass that did not run because the switch is off leaves no row: the tick
  // does not call while it is off, so this is a stray call.
  let recorded = false;
  if (result.outcome !== "disabled") {
    try {
      await gateway.rpc("service_fantasy_worker_record_run", {
        p_run: runRecord(holder, result),
      });
      recorded = true;
    } catch {
      recorded = false;
    }
  }
  console.log(
    JSON.stringify({
      event: "fantasy_lifecycle_worker",
      outcome: result.outcome,
      workerCode: result.workerCode,
      gameweek: result.gameweekSequence,
      calls: result.calls,
      durationMs: result.durationMs,
      recorded,
      ...(result.ambiguous ? { ambiguous: true, rpc: result.ambiguous.rpc } : {}),
      ...(result.missingFunction ? { missingFunction: result.missingFunction } : {}),
      ...(result.prizeAttention ? { prizeAttention: result.prizeAttention } : {}),
    }),
  );
  return json(result.outcome === "failed" ? 500 : 200, {
    status: result.outcome,
    workerCode: result.workerCode,
    gameweek: result.gameweekSequence,
    gameweeks: result.gameweeks,
    deferred: result.deferred,
    calls: result.calls,
    durationMs: result.durationMs,
    recorded,
    // The same status-only summary the run record stores; never a winner or an id.
    ...(result.prizes ? { prizes: result.prizes } : {}),
    // A prize problem: non-blocking, and not a reason to call the pass anything but ok.
    ...(result.prizeAttention ? { prizeAttention: result.prizeAttention } : {}),
    // A write that timed out and may still be running: the pass stopped, and the
    // lease was kept unless the original request had answered.
    ...(result.ambiguous
      ? {
          ambiguous: true,
          rpc: result.ambiguous.rpc,
          leaseExtended: result.ambiguous.leaseExtended,
          settled: result.ambiguous.settled,
          leaseReleased: result.ambiguous.leaseReleased,
        }
      : {}),
    ...(result.missingFunction ? { missingFunction: result.missingFunction } : {}),
  });
}
