import { createClient } from "@supabase/supabase-js";
import { z } from "zod";
import {
  acquireWorkerLease,
  releaseWorkerLease,
  leasedGateway,
  runFantasyLifecycle,
  rpcFailure,
  type FantasyWorkerGateway,
} from "../../supabase/functions/_shared/fantasy-lifecycle-worker.ts";

// The worker itself is in supabase/functions/_shared/fantasy-lifecycle-worker.ts,
// shared with the Edge Function `fantasy-lifecycle-worker`. Everything the
// scripts and tests imported from this file is still exported from here; this
// file keeps the manual command line (trustedWorkerEnvironment and main).
export * from "../../supabase/functions/_shared/fantasy-lifecycle-worker.ts";

const uuid = z.string().uuid();
const positive = z.coerce.number().int().positive();

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

if (import.meta.main) {
  try {
    const config = trustedWorkerEnvironment(process.env);
    const api = createClient(config.url, config.key, {
      auth: { persistSession: false, autoRefreshToken: false },
      db: { schema: "api" },
    });
    const gateway: FantasyWorkerGateway = {
      async rpc(name, args) {
        const { data, error } = await api.rpc(name, args).abortSignal(AbortSignal.timeout(60000));
        if (error) {
          // Never serialize SQL details, input snapshots or credentials to logs.
          const code = /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
            ? error.message
            : "fantasy_worker_rpc_failed";
          throw rpcFailure(code, error.code);
        }
        return data;
      },
    };
    // One writer at a time: the Edge Function and the orchestrator take the same
    // lease. A database without the lease function runs unmanaged, as before.
    const lease = await acquireWorkerLease(
      (name, args) => gateway.rpc(name, args),
      `manual:${process.env.GITHUB_RUN_ID ?? "local"}`,
    );
    if (lease.kind === "held") throw new Error("fantasy_worker_lease_held");
    if (lease.kind === "disabled") throw new Error("fantasy_worker_lease_unavailable");
    try {
      const worker =
        lease.kind === "acquired" ? leasedGateway(gateway, { token: lease.token }) : gateway;
      process.stdout.write(`${JSON.stringify(await runFantasyLifecycle(worker, config))}\n`);
    } finally {
      if (lease.kind === "acquired")
        await releaseWorkerLease((name, args) => gateway.rpc(name, args), lease.token);
    }
  } catch (error) {
    const code =
      error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
        ? error.message
        : "fantasy_worker_failed";
    process.stderr.write(`${JSON.stringify({ outcome: "failed", code })}\n`);
    process.exitCode = 1;
  }
}
