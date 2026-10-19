// Staging fault injection: lose one real committed scoring response. The
// production gateway's real 30 s timeout and seven-minute lease stay unchanged.
import { createClient } from "@supabase/supabase-js";
import {
  gatewayFor,
  type FantasyWorkerRpcClient,
} from "../../supabase/functions/_shared/fantasy-lifecycle-handler";
import {
  acquireWorkerLease,
  holdLeaseForAmbiguousWrite,
  isAmbiguousRpcTimeout,
  leasedGateway,
  releaseWorkerLease,
  rpcMayWrite,
  runFantasyLifecycle,
} from "../../supabase/functions/_shared/fantasy-lifecycle-worker";

const prefix = "f9700000-0000-4000-8000-";
const targetRpc = "service_persist_fantasy_scoring_results";
const report = (kind: string, data: Record<string, unknown>) =>
  console.log(JSON.stringify({ kind, ...data }));

export function loseOneScoringReply(
  realFetch: typeof fetch,
  observed: (started: number) => void,
): typeof fetch {
  let dropped = false;
  return async (input, init) => {
    const path = new URL(
      typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    ).pathname;
    const started = performance.now();
    const response = await realFetch(input, init);
    if (!dropped && path === `/rest/v1/rpc/${targetRpc}` && response.ok) {
      dropped = true;
      // Consume the real reply outside the worker. It is intentionally never
      // returned to the worker: response loss can occur after a DB commit.
      await response.arrayBuffer();
      observed(started);
      return new Promise<Response>((_resolve, reject) => {
        const abort = () => reject(new DOMException("Injected response loss", "AbortError"));
        if (init?.signal?.aborted) abort();
        else init?.signal?.addEventListener("abort", abort, { once: true });
      });
    }
    return response;
  };
}

async function main() {
  const url = "https://srdrflfrfpwixsllveid.supabase.co";
  if (process.env.STAGING_DRILL_URL !== url || !process.env.STAGING_DRILL_SERVICE_KEY)
    throw new Error("staging_loss_target_refused");
  const options = {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  };
  const realClient = createClient(url, process.env.STAGING_DRILL_SERVICE_KEY, options);
  let faultAt: number | null = null;
  const faultClient = createClient(url, process.env.STAGING_DRILL_SERVICE_KEY, {
    ...options,
    global: {
      fetch: loseOneScoringReply(fetch, (started) => {
        faultAt = started;
      }),
    },
  });
  const raw = gatewayFor(realClient as unknown as FantasyWorkerRpcClient, 30_000);
  const fault = gatewayFor(faultClient as unknown as FantasyWorkerRpcClient, 30_000);
  let dataCalls = 0;
  const scope = (gateway: typeof raw) => ({
    async rpc(name: string, args: Record<string, unknown>) {
      if (name === "service_evaluate_fantasy_prizes")
        throw new Error("staging_loss_global_prizes_refused");
      for (const [key, value] of Object.entries(args)) {
        if (
          (key.includes("gameweek") || key === "p_season_id") &&
          typeof value === "string" &&
          !value.startsWith(prefix)
        )
          throw new Error("staging_loss_scope_refused");
      }
      if (rpcMayWrite(name)) dataCalls++;
      return gateway.rpc(name, args);
    },
  });
  let token: string | null = null;
  let mayRelease = false;
  let releaseUnconfirmed = false;
  try {
    const lease = await acquireWorkerLease(raw.rpc, "manual:staging-response-loss", 420);
    if (lease.kind !== "acquired") throw new Error("staging_loss_lease_unavailable");
    token = lease.token;
    mayRelease = true;
    try {
      await runFantasyLifecycle(leasedGateway(scope(fault), { token, ttlSeconds: 420 }), {
        gameweekId: `${prefix}000000000021`,
        calculationVersion: 1,
        maxBatches: 300,
      });
      throw new Error("staging_loss_fault_not_observed");
    } catch (error) {
      if (!isAmbiguousRpcTimeout(error)) throw error;
      const elapsed = faultAt === null ? 0 : performance.now() - faultAt;
      // Do not release an unresolved write, including when later assertions fail.
      mayRelease = false;
      const held = await holdLeaseForAmbiguousWrite(raw.rpc, token, error, 10_000);
      report("response_loss_boundary", {
        elapsedMs: elapsed,
        realReplyConsumed: faultAt !== null,
        ...held,
      });
      if (error.rpc !== targetRpc || faultAt === null || elapsed < 29_500)
        throw new Error("staging_loss_wrong_boundary");
      if (!held.leaseExtended || held.settled || held.leaseReleased)
        throw new Error("staging_loss_lease_not_retained");
    }
    const stoppedAt = dataCalls;
    const contender = await acquireWorkerLease(
      raw.rpc,
      "manual:staging-response-loss-contender",
      420,
    );
    if (contender.kind !== "held" || !contender.expiresAt)
      throw new Error("staging_loss_competing_lease_not_excluded");
    const expiry = Date.parse(contender.expiresAt);
    if (!Number.isFinite(expiry) || expiry < Date.now() || expiry > Date.now() + 425_000)
      throw new Error("staging_loss_lease_clock_invalid");
    report("response_loss_exclusion", {
      competingLeaseDenied: true,
      expiresAt: contender.expiresAt,
    });
    while (Date.now() < expiry + 1000) {
      await new Promise((resolve) =>
        setTimeout(resolve, Math.min(30_000, expiry + 1000 - Date.now())),
      );
      report("response_loss_waiting", {
        secondsUntilExpiry: Math.max(0, Math.ceil((expiry - Date.now()) / 1000)),
      });
    }
    if (dataCalls !== stoppedAt) throw new Error("staging_loss_later_write_started");
    const recovery = await acquireWorkerLease(
      raw.rpc,
      "manual:staging-response-loss-recovery",
      420,
    );
    if (recovery.kind !== "acquired") throw new Error("staging_loss_recovery_lease_unavailable");
    token = recovery.token;
    mayRelease = true;
    const result = await runFantasyLifecycle(
      leasedGateway(scope(raw), { token, ttlSeconds: 420 }),
      {
        gameweekId: `${prefix}000000000021`,
        calculationVersion: 1,
        maxBatches: 300,
      },
    );
    if (!["finalized", "already_finalized", "already_advanced"].includes(result.outcome))
      throw new Error("staging_loss_recovery_incomplete");
    report("response_loss_recovery", { outcome: result.outcome, noLaterWriteBeforeExpiry: true });
  } catch (error) {
    if (isAmbiguousRpcTimeout(error) && mayRelease) {
      mayRelease = false;
      await holdLeaseForAmbiguousWrite(raw.rpc, token, error, 10_000);
    }
    throw error;
  } finally {
    if (token && mayRelease && !(await releaseWorkerLease(raw.rpc, token)))
      releaseUnconfirmed = true;
  }
  if (releaseUnconfirmed) throw new Error("staging_loss_release_unconfirmed");
}

if (import.meta.main) {
  main().catch((error: unknown) => {
    const message = error instanceof Error ? error.message : "";
    report("response_loss_error", {
      error: /^staging_loss_[a-z_]+$/.test(message) ? message : "staging_loss_failed",
    });
    process.exitCode = 1;
  });
}
