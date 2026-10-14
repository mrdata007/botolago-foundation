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
  rpcFailure,
  runFantasyWorkerPass,
  type FantasyWorkerGateway,
  type WorkerPassResult,
} from "./fantasy-lifecycle-worker.ts";

export interface FantasyWorkerRpcClient {
  schema(name: "api"): {
    rpc(
      name: string,
      args: Record<string, unknown>,
    ): PromiseLike<{ data?: unknown; error?: { message?: string; code?: string } | null }>;
  };
}

export interface FantasyWorkerDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: FantasyWorkerRpcClient;
  readonly now?: () => number;
  readonly randomHex?: (bytes: number) => string;
  /** Per-RPC timeout; the pass budget leaves room for one more after it ends. */
  readonly rpcTimeoutMs?: number;
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
  return {
    async rpc(name, args) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        const result = await Promise.race([
          client.schema("api").rpc(name, args),
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error("fantasy_worker_rpc_timeout")), timeoutMs);
          }),
        ]);
        if (result.error) {
          // Never carry SQL details, snapshots or credentials into a log or a row.
          const message = String(result.error.message ?? "");
          throw rpcFailure(
            /^[a-z][a-z0-9_]{2,100}$/.test(message) ? message : "fantasy_worker_rpc_failed",
            result.error.code,
          );
        }
        return result.data;
      } finally {
        if (timer) clearTimeout(timer);
      }
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
    result = await runFantasyWorkerPass(gateway, { holder, now: clock, ...limits });
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
  });
}
