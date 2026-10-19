// Operator-run drill using the production lifecycle implementation and real
// staging PostgREST RPCs. This is not a measurement of the Edge CPU limit.
import { createClient } from "@supabase/supabase-js";
import {
  gatewayFor,
  type FantasyWorkerRpcClient,
} from "../../supabase/functions/_shared/fantasy-lifecycle-handler";
import {
  acquireWorkerLease,
  leasedGateway,
  releaseWorkerLease,
  runFantasyLifecycle,
  isAmbiguousRpcTimeout,
  holdLeaseForAmbiguousWrite,
} from "../../supabase/functions/_shared/fantasy-lifecycle-worker";

const ref = "srdrflfrfpwixsllveid";
const fixture = process.env.STAGING_DRILL_FIXTURE ?? "operator";
if (!["operator", "edge-runtime", "phone-qa"].includes(fixture))
  throw new Error("staging_drill_fixture_refused");
const namespace =
  fixture === "phone-qa" ? "f9600000" : fixture === "edge-runtime" ? "f9510000" : "f9500000";
const gameweekId = `${namespace}-0000-4000-8000-000000000021`;
const url = process.env.STAGING_DRILL_URL;
if (url !== `https://${ref}.supabase.co` || !process.env.STAGING_DRILL_SERVICE_KEY)
  throw new Error("staging_drill_target_refused");
const client = createClient(url, process.env.STAGING_DRILL_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
});
const real = gatewayFor(client as unknown as FantasyWorkerRpcClient, 30_000);
const metrics: Record<string, { calls: number; totalMs: number; maxMs: number }> = {};
const scoped = {
  async rpc(name: string, args: Record<string, unknown>) {
    // Prize catch-up is global; refuse it to preserve the existing QA seasons.
    // The worker reports this as follow-on attention, never as prize proof.
    if (name === "service_evaluate_fantasy_prizes")
      throw new Error("staging_drill_unscoped_prizes_skipped");
    for (const [key, value] of Object.entries(args)) {
      if (
        (key.includes("gameweek") || key === "p_season_id") &&
        typeof value === "string" &&
        !value.startsWith(`${namespace}-0000-4000-8000-`)
      )
        throw new Error("staging_drill_scope_refused");
    }
    const began = performance.now();
    try {
      return await real.rpc(name, args);
    } finally {
      const elapsed = performance.now() - began;
      const metric = (metrics[name] ??= { calls: 0, totalMs: 0, maxMs: 0 });
      metric.calls++;
      metric.totalMs += elapsed;
      metric.maxMs = Math.max(metric.maxMs, elapsed);
    }
  },
};
const start = performance.now();
let token: string | null = null;
let release = true;
let leaseLeftToExpire = false;
try {
  const lease = await acquireWorkerLease(scoped.rpc, "manual:staging-rating-drill-5000", 420);
  if (lease.kind !== "acquired") throw new Error("staging_drill_lease_unavailable");
  token = lease.token;
  const gateway = leasedGateway(scoped, {
    token,
    ttlSeconds: 420,
    deadlineAt: Date.now() + 20 * 60_000,
  });
  const result = await runFantasyLifecycle(gateway, {
    gameweekId,
    calculationVersion: 1,
    maxBatches: 1500,
  });
  console.log(
    JSON.stringify({
      kind: "scoring_drill",
      result,
      elapsedMs: performance.now() - start,
      metrics,
    }),
  );
  if (!["finalized", "already_finalized", "already_advanced"].includes(result.outcome))
    process.exitCode = 1;
} catch (error) {
  if (isAmbiguousRpcTimeout(error)) {
    const ambiguous = await holdLeaseForAmbiguousWrite(real.rpc, token, error, () => 10_000);
    // The shared helper either released after a real database reply or left
    // an extended lease. Never release it a second time in this adapter.
    release = false;
    leaseLeftToExpire = !ambiguous.leaseReleased;
  }
  const code =
    error instanceof Error && /^[a-z][a-z0-9_]{2,100}$/.test(error.message)
      ? error.message
      : "staging_drill_failed";
  console.log(
    JSON.stringify({
      kind: "scoring_drill",
      error: code,
      elapsedMs: performance.now() - start,
      metrics,
      leaseLeftToExpire,
    }),
  );
  process.exitCode = 1;
} finally {
  if (token && release && !(await releaseWorkerLease(real.rpc, token))) {
    console.log(JSON.stringify({ error: "staging_drill_lease_release_unconfirmed" }));
    process.exitCode = 1;
  }
}
