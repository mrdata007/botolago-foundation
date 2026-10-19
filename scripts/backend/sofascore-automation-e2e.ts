/** Actual isolated PostgreSQL/pg_cron/pg_net + real handlers/recorders/scorer.
 * Provider replies are SYNTHETIC. Never reported as fresh live SofaScore data.
 * Refuses remote/production targets before connecting; no service key needed.
 */
import { SQL } from "bun";
import { readFileSync, writeFileSync } from "node:fs";
import assert from "node:assert/strict";
import { handleFootballLiveRefreshRequest } from "../../supabase/functions/_shared/football-live-refresh";
import { handleFantasyWorkerRequest } from "../../supabase/functions/_shared/fantasy-lifecycle-handler";
import type { FixtureRpcClient } from "../../supabase/functions/_shared/sportsmonks-fixtures";
import type { FantasyWorkerRpcClient } from "../../supabase/functions/_shared/fantasy-lifecycle-handler";

const target = new URL(
  process.env.SOFASCORE_E2E_DATABASE_URL ?? "postgres://postgres:postgres@127.0.0.1:55322/postgres",
);
if (
  !["127.0.0.1", "localhost"].includes(target.hostname) ||
  !["55322", "57322"].includes(target.port) ||
  target.pathname !== "/postgres"
)
  throw new Error("isolated_local_database_required");
const sql = new SQL(target.toString(), { max: 5 });
const uid = (n: number) => `cb000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
let rated = false,
  providerCalls = 0;
const handlerResults: Record<string, unknown>[] = [];
const argumentTypes = new Map<string, { name: string; type: string }[]>();
const rpcClient = {
  schema: () => ({
    rpc: async (name: string, args: Record<string, unknown>) => {
      if (
        !/^[a-z][a-z0-9_]+$/.test(name) ||
        Object.keys(args).some((k) => !/^p_[a-z0-9_]+$/.test(k))
      )
        throw new Error("invalid_test_rpc_name");
      try {
        let types = argumentTypes.get(name);
        if (!types) {
          types = await sql.unsafe(
            `select p.proargnames[i+1] as name,format_type(p.proargtypes[i],null) as type from pg_proc p join pg_namespace n on n.oid=p.pronamespace cross join generate_series(0,p.pronargs-1)i where n.nspname='api' and p.proname=$1`,
            [name],
          );
          argumentTypes.set(name, types!);
        }
        const entries = Object.keys(args).map((k) => ({
          name: k,
          type: types!.find((t) => t.name === k)?.type,
        }));
        if (entries.some((e) => !e.type)) throw new Error("test_rpc_argument_unknown");
        return await sql.begin(async (tx) => {
          await tx.unsafe("set local role service_role");
          await tx.unsafe(
            "select set_config('request.jwt.claims','{\"role\":\"service_role\"}',true)",
          );
          const argExpr = entries.map((e) => `${e.name}=>args.${e.name}`).join(",");
          const from = entries.length
            ? ` from jsonb_to_record($1::jsonb) as args(${entries.map((e) => `${e.name} ${e.type}`).join(",")})`
            : "";
          const rows = await tx.unsafe(
            `select api.${name}(${argExpr}) as data${from}`,
            entries.length ? [JSON.stringify(args)] : [],
          );
          return { data: rows[0]?.data, error: null, status: 200 };
        });
      } catch (error) {
        const e = error as { code?: string; message?: string };
        return {
          data: null,
          error: { code: e.code ?? "test_error", message: e.message ?? "test_rpc_failed" },
          status: 400,
        };
      }
    },
  }),
};
const provider = async (input: string | URL | Request) => {
  const path = new URL(typeof input === "string" ? input : input instanceof URL ? input : input.url)
    .pathname;
  providerCalls++;
  const home = { id: 11, name: "Synthetic home" },
    away = { id: 22, name: "Synthetic away" };
  let data: unknown;
  if (path.endsWith("/detail"))
    data = {
      event: {
        id: 123,
        startTimestamp: Math.floor(Date.now() / 1000) - 14400,
        status: { type: "finished", code: 100 },
        tournament: { uniqueTournament: { id: 937 } },
        season: { id: 102220 },
        homeTeam: home,
        awayTeam: away,
        homeScore: { current: 0 },
        awayScore: { current: 0 },
      },
    };
  else if (path.endsWith("/get-lineups")) {
    const side = (offset: number) => ({
      players: Array.from({ length: 11 }, (_, i) => ({
        player: {
          id: offset + i,
          name: `Synthetic ${offset + i}`,
          position: i === 0 ? "G" : i <= 4 ? "D" : i <= 8 ? "M" : "F",
        },
        teamId: 99999,
        shirtNumber: i + 1,
        substitute: false,
        statistics: {
          minutesPlayed: 90,
          goals: 0,
          goalAssist: 0,
          ownGoals: 0,
          saves: 0,
          totalPass: 30,
          ...(rated ? { rating: 7.2 } : {}),
        },
      })),
    });
    data = { confirmed: true, home: side(23), away: side(34) };
  } else if (path.endsWith("/get-incidents")) data = { incidents: [] };
  else if (path.endsWith("/get-statistics")) data = { statistics: [] };
  else throw new Error("unexpected_synthetic_provider_request");
  return new Response(JSON.stringify(data), {
    headers: {
      "content-type": "application/json",
      "x-ratelimit-requests-remaining": "5000",
      "x-ratelimit-requests-limit": "10000",
    },
  });
};
let server: ReturnType<typeof Bun.serve> | undefined;
let ownsDatabase = false;
const report: Record<string, unknown> = {
  evidenceKind: "isolated_scheduled_e2e_with_synthetic_provider",
  freshAuthenticatedPull: false,
  startedAt: new Date().toISOString(),
};
async function waitFor(check: () => Promise<boolean>, label: string, timeout = 50_000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    if (await check()) return;
    await Bun.sleep(500);
  }
  throw new Error(`scheduled_e2e_timeout:${label}`);
}
async function main() {
  // Database guard: a real local Supabase schema, no other sessions/writers, no
  // pre-existing business data. The test never resets or alters a shared DB.
  assert.equal(
    (await sql.unsafe("select count(*)::int as n from app.fixtures"))[0]!.n,
    0,
    "isolated empty database required",
  );
  const schedules = await sql.unsafe("select jobname,active from cron.job order by jobname");
  assert.equal(
    (
      await sql.unsafe("select count(*)::int as n from cron.job_run_details where status='running'")
    )[0]!.n,
    0,
    "an existing scheduled writer is still running",
  );
  ownsDatabase = true;
  await sql.unsafe("update cron.job set active=false");
  report.baseline = {
    fixtureCount: 0,
    schedulesInspected: schedules.length,
    otherScheduledRuns: 0,
  };
  await sql.unsafe(
    readFileSync(new URL("./sofascore-automation-e2e-seed.sql", import.meta.url), "utf8"),
  );
  const schedulerToken = (await sql.unsafe("select app_private.scheduler_token() as token"))[0]!
    .token as string;
  // Test-owned Vault value stays in process, never logs or artifacts.
  const environment = {
    BOTOLAGO_SCHEDULER_TOKEN: schedulerToken,
    RAPIDAPI_KEY: "synthetic-provider-test-key",
    FANTASY_WORKER_BUDGET_MS: "10000",
  };
  server = Bun.serve({
    hostname: "0.0.0.0",
    port: 57890,
    fetch: async (request) => {
      let response: Response;
      if (new URL(request.url).pathname.endsWith("fantasy-lifecycle-worker"))
        response = await handleFantasyWorkerRequest(request, {
          environment,
          client: rpcClient as unknown as FantasyWorkerRpcClient,
        });
      else
        response = await handleFootballLiveRefreshRequest(request, {
          environment,
          client: rpcClient as FixtureRpcClient,
          fetch: provider,
        });
      const data = await response.clone().json();
      handlerResults.push({
        path: new URL(request.url).pathname,
        status: response.status,
        body: data,
      });
      return response;
    },
  });
  const callback = process.env.SOFASCORE_E2E_CALLBACK_HOST ?? "172.17.0.1";
  if (!/^(172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3}|host\.docker\.internal)$/.test(callback))
    throw new Error("isolated_docker_callback_required");
  await sql.unsafe(
    "update app_private.notification_email_settings set football_live_refresh_enabled=true,functions_base_url=$1 where id",
    [`http://${callback}:57890/functions/v1`],
  );
  await sql.unsafe(
    "update app_private.football_season_refresh_heartbeat set last_invoked_at=statement_timestamp(),last_outcome='invoked' where id",
  );
  // An actual pg_cron interval executes the unchanged scheduler entry points.
  await sql.unsafe(
    "select cron.alter_job(jobid,schedule:='5 seconds',active:=true) from cron.job where jobname in ('football-season-refresh','fantasy-worker-tick')",
  );
  await waitFor(
    async () =>
      Number(
        (
          await sql.unsafe(
            "select count(*)::int as n from app_private.fantasy_fixture_observations where fixture_id=$1",
            [uid(3002)],
          )
        )[0]!.n,
      ) === 1,
    "first scheduled observation",
  );
  await sql.unsafe("update app_private.fantasy_worker_dispatch set last_invoked_at=null where id");
  await waitFor(
    async () => handlerResults.some((r) => JSON.stringify(r).includes("fantasy_ratings_pending")),
    "scoring waits for actual ratings",
  );
  assert.equal(
    (
      await sql.unsafe(
        "select count(*)::int as n from app.fantasy_team_gameweek_results where gameweek_id=$1",
        [uid(25)],
      )
    )[0]!.n,
    0,
  );
  const firstCalls = providerCalls;
  await Bun.sleep(6000);
  assert.equal(providerCalls, firstCalls, "not-due fixtures must not consume quota");
  // Simulate the next due time in this isolated test instead of waiting six
  // hours. Neither the production cadence nor the hold deadline is changed.
  rated = true;
  await sql.unsafe(
    "update app_private.sofascore_collection_queue set next_attempt_at=statement_timestamp()-interval '1 second' where fixture_id=$1",
    [uid(3002)],
  );
  await waitFor(
    async () =>
      Number(
        (
          await sql.unsafe(
            "select count(*)::int as n from app_private.fantasy_fixture_observations where fixture_id=$1",
            [uid(3002)],
          )
        )[0]!.n,
      ) === 2,
    "late ratings ingested on scheduled retry",
  );
  await sql.unsafe("update app_private.fantasy_worker_dispatch set last_invoked_at=null where id");
  await waitFor(
    async () =>
      Number(
        (
          await sql.unsafe(
            "select count(*)::int as n from app.fantasy_team_gameweek_results where gameweek_id=$1",
            [uid(25)],
          )
        )[0]!.n,
      ) === 1,
    "existing scheduled worker persists score",
  );
  const score = (
    await sql.unsafe(
      "select provisional_score as score,calculation_version as version from app.fantasy_team_gameweek_results where gameweek_id=$1",
      [uid(25)],
    )
  )[0]!;
  assert.equal(Number(score.score), 84, "eleven ratings rounded to seven, plus captain bonus");
  // Replay an unchanged provider response through another scheduled pull.
  await sql.unsafe(
    "update app_private.sofascore_collection_queue set next_attempt_at=statement_timestamp()-interval '1 second' where fixture_id=$1",
    [uid(3002)],
  );
  await waitFor(async () => providerCalls >= firstCalls + 8, "scheduled duplicate pull");
  await Bun.sleep(1500);
  assert.equal(
    (
      await sql.unsafe(
        "select count(*)::int as n from app_private.fantasy_fixture_observations where fixture_id=$1",
        [uid(3002)],
      )
    )[0]!.n,
    2,
    "unchanged data cannot duplicate observations",
  );
  const scoringRuns = handlerResults.filter((r) =>
    String(r.path).endsWith("fantasy-lifecycle-worker"),
  ).length;
  await sql.unsafe("update app_private.fantasy_worker_dispatch set last_invoked_at=null where id");
  await waitFor(
    async () =>
      handlerResults.filter((r) => String(r.path).endsWith("fantasy-lifecycle-worker")).length >
      scoringRuns,
    "scheduled worker rechecks unchanged input",
  );
  const versions = await sql.unsafe(
    "select distinct calculation_version from app.fantasy_team_gameweek_results where gameweek_id=$1",
    [uid(25)],
  );
  assert.equal(versions.length, 1, "no repeated scoring version");
  assert.equal(
    versions[0]!.calculation_version,
    score.version,
    "unchanged input retains its scoring version",
  );
  const runs = await sql.unsafe(
    "select jobname,count(*)::int as runs from cron.job_run_details d join cron.job j using(jobid) where j.jobname in ('football-season-refresh','fantasy-worker-tick') group by jobname",
  );
  assert.equal(runs.length, 2, "both real cron jobs executed");
  const monitor = (
    await sql.unsafe("select app_private.sofascore_collection_health() as health")
  )[0]!.health;
  Object.assign(report, {
    completedAt: new Date().toISOString(),
    providerCalls,
    observationCount: 2,
    score: Number(score.score),
    scoringVersion: score.version,
    cronRuns: runs,
    monitor,
    handlerRuns: handlerResults.length,
    passed: true,
  });
}
try {
  await main();
} catch (error) {
  report.passed = false;
  report.error = error instanceof Error ? error.message : "e2e_failed";
  report.handlerResults = handlerResults;
  throw error;
} finally {
  if (ownsDatabase) await sql.unsafe("update cron.job set active=false").catch(() => {});
  server?.stop(true);
  await sql.close();
  const out = process.env.SOFASCORE_E2E_REPORT ?? "/tmp/sofascore-automation-e2e.json";
  writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
  console.log(
    JSON.stringify({
      evidenceKind: report.evidenceKind,
      passed: report.passed,
      providerCalls: report.providerCalls,
      report: out,
    }),
  );
}
