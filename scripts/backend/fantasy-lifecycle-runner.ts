import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  gatewayFor,
  type FantasyWorkerRpcClient,
  type FantasyWorkerRpcResult,
} from "../../supabase/functions/_shared/fantasy-lifecycle-handler.ts";
import {
  AMBIGUOUS_GRACE_MS,
  acquireWorkerLease,
  holdLeaseForAmbiguousWrite,
  isAmbiguousRpcTimeout,
  leasedGateway,
  releaseWorkerLease,
  runFantasyLifecycle,
  type AmbiguousWrite,
  type FantasyWorkerGateway,
} from "../../supabase/functions/_shared/fantasy-lifecycle-worker.ts";

// The worker itself is in supabase/functions/_shared/fantasy-lifecycle-worker.ts,
// shared with the Edge Function `fantasy-lifecycle-worker`. Everything the
// scripts and tests imported from this file is still exported from here; this
// file keeps the manual command line (trustedWorkerEnvironment and main).
export * from "../../supabase/functions/_shared/fantasy-lifecycle-worker.ts";

const uuid = z.string().uuid();
const positive = z.coerce.number().int().positive();

/** How long each RPC of the GitHub callers may take before the client stops waiting. */
export const SCRIPT_RPC_TIMEOUT_MS = 60_000;

/** The slice of a supabase-js client (schema `api`) the GitHub callers use. */
export interface RpcApiClient {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): PromiseLike<FantasyWorkerRpcResult> & {
    abortSignal(signal: AbortSignal): PromiseLike<FantasyWorkerRpcResult>;
  };
}

/**
 * The gateway the GitHub callers run the lifecycle on: the Edge function's own
 * rule (fantasy-lifecycle-handler.ts, SEC-01), so a write that timed out or failed
 * without a conclusive reply is ambiguous and not a settled failure, and a read or
 * a lease/log call that timed out is an ordinary failure. Built from a function so
 * a test can hand it a fake client.
 */
export function lifecycleRpcGateway(
  api: RpcApiClient,
  fallbackCode = "fantasy_worker_rpc_failed",
  timeoutMs = SCRIPT_RPC_TIMEOUT_MS,
): FantasyWorkerGateway {
  const client: FantasyWorkerRpcClient = {
    schema: () => ({ rpc: (name, args) => api.rpc(name, args) }),
  };
  return gatewayFor(client, timeoutMs, fallbackCode);
}

export function trustedWorkerEnvironment(env: Record<string, string | undefined>) {
  if (env.FANTASY_MANUAL_WORKER_ENABLED !== "true") throw new Error("fantasy_worker_disabled");
  if (
    env.SUPABASE_PRODUCTION_PROJECT_REF !== "tkewgajrljbwgwedqsxn" ||
    env.SUPABASE_PRODUCTION_URL?.replace(/\/$/, "") !==
      "https://tkewgajrljbwgwedqsxn.supabase.co" ||
    env.GITHUB_REPOSITORY !== "mrdata007/botolago-foundation" ||
    env.GITHUB_REF !== "refs/heads/main" ||
    env.GITHUB_EVENT_NAME !== "workflow_dispatch" ||
    env.GITHUB_ACTOR !== "mrdata007" ||
    env.GITHUB_RUN_ATTEMPT !== "1" ||
    !/^[0-9a-f]{40}$/.test(env.EXPECTED_COMMIT ?? "") ||
    env.EXPECTED_COMMIT !== env.GITHUB_SHA ||
    env.CONFIRMATION !== "RUN_FANTASY_MANUAL_WORKER"
  )
    throw new Error("fantasy_worker_environment_mismatch");
  if (!env.SUPABASE_SECRET_KEY) throw new Error("fantasy_worker_credential_missing");
  return {
    url: env.SUPABASE_PRODUCTION_URL,
    key: env.SUPABASE_SECRET_KEY,
    gameweekId: uuid.parse(env.FANTASY_GAMEWEEK_ID),
    calculationVersion: positive.parse(env.FANTASY_CALCULATION_VERSION),
  };
}

export type ManualWorkerOutcome =
  | { outcome: "ok"; result: unknown }
  | {
      outcome: "failed";
      code: string;
      /** A write timed out and may still be running; the lease was kept (see holdLeaseForAmbiguousWrite). */
      ambiguous?: AmbiguousWrite;
    };

const safeFailureCode = (error: unknown) =>
  error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
    ? error.message
    : "fantasy_worker_failed";

/**
 * One manual pass for one gameweek, under the shared lease. A write that timed
 * out (or failed with no reply from the database) stops the pass and keeps the
 * lease: it is extended, and released only if the original request then answers;
 * otherwise it is left to expire. Never throws.
 */
export async function runManualWorker(
  gateway: FantasyWorkerGateway,
  config: { gameweekId: string; calculationVersion: number },
  holder: string,
  options: { ambiguousGraceMs?: number } = {},
): Promise<ManualWorkerOutcome> {
  const call = (name: string, args: Record<string, unknown>) => gateway.rpc(name, args);
  // One writer at a time: the Edge Function and the orchestrator take the same
  // lease. A database without the lease function runs unmanaged, as before.
  let lease: Awaited<ReturnType<typeof acquireWorkerLease>>;
  try {
    lease = await acquireWorkerLease(call, holder);
  } catch (error) {
    return { outcome: "failed", code: safeFailureCode(error) };
  }
  if (lease.kind === "held") return { outcome: "failed", code: "fantasy_worker_lease_held" };
  if (lease.kind === "disabled")
    return { outcome: "failed", code: "fantasy_worker_lease_unavailable" };
  const token = lease.kind === "acquired" ? lease.token : null;
  let result: unknown;
  let failure: { error: unknown } | null = null;
  try {
    const worker = token ? leasedGateway(gateway, { token }) : gateway;
    result = await runFantasyLifecycle(worker, config);
  } catch (error) {
    failure = { error };
  }
  let ambiguous: AmbiguousWrite | undefined;
  if (failure && isAmbiguousRpcTimeout(failure.error))
    ambiguous = await holdLeaseForAmbiguousWrite(
      call,
      token,
      failure.error,
      options.ambiguousGraceMs ?? AMBIGUOUS_GRACE_MS,
    );
  else if (token) await releaseWorkerLease(call, token);
  return failure
    ? {
        outcome: "failed",
        code: safeFailureCode(failure.error),
        ...(ambiguous ? { ambiguous } : {}),
      }
    : { outcome: "ok", result };
}

if (import.meta.main) {
  try {
    const config = trustedWorkerEnvironment(process.env);
    const api = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "api" },
    });
    // Error text never reaches a log: only a safe code (lifecycleRpcGateway).
    const done = await runManualWorker(
      lifecycleRpcGateway(api),
      config,
      `manual:${process.env.GITHUB_RUN_ID ?? "local"}`,
    );
    if (done.outcome === "ok") process.stdout.write(`${JSON.stringify(done.result)}\n`);
    else {
      process.stderr.write(
        `${JSON.stringify({ outcome: "failed", code: done.code, ...(done.ambiguous ? { ambiguous: done.ambiguous } : {}) })}\n`,
      );
      process.exitCode = 1;
    }
  } catch (error) {
    process.stderr.write(
      `${JSON.stringify({ outcome: "failed", code: safeFailureCode(error) })}\n`,
    );
    process.exitCode = 1;
  }
}
