/**
 * Production watchdog: one answer to "is BotolaGO healthy right now?".
 *
 * Run by .github/workflows/ops-watchdog.yml every 30 minutes. It reads the
 * database's own health (`api.service_ops_health`: Fantasy tick and locks,
 * deadline watch, cron jobs, news, live scores, provider refresh, email),
 * loads the public pages and one public API call the way a visitor does, and
 * checks that the season orchestrator has actually run recently -- GitHub
 * started its hourly schedule only every 3.5-5.5 hours on 23-24 Sep 2026.
 *
 * Read-only. Writes `watchdog.json` (sanitised: check names, statuses and
 * one-line reasons) and a table for the run page; exits 1 when any check
 * fails, which makes the workflow's alert step open an `ops-alert` issue.
 */
import { appendFile, writeFile } from "node:fs/promises";

export type CheckStatus = "ok" | "warn" | "fail";
export interface Check {
  name: string;
  status: CheckStatus;
  detail: string;
}

type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const SITE_PAGES = ["/", "/matches", "/news", "/sitemap.xml"] as const;
// Checks `app_private.ops_health_checks()` emits on every call. The deadline
// watch is left out: it only runs while a Fantasy season is planned or active.
export const REQUIRED_DATABASE_CHECKS = [
  "fantasy_lifecycle_tick",
  "fantasy_gameweek_lock",
  "cron_jobs",
  "news_publication",
  "news_import",
  "live_scores",
  "provider_refresh",
  "email_delivery",
  "browser_errors",
] as const;
const SLOW_MS = 8_000;
const ORCHESTRATOR_STALE_HOURS = 8;

async function timed(fetchImpl: Fetch, url: string, init?: RequestInit) {
  const started = performance.now();
  try {
    const response = await fetchImpl(url, { ...init, signal: AbortSignal.timeout(20_000) });
    const body = await response.text();
    return {
      status: response.status,
      ms: Math.round(performance.now() - started),
      body,
      headers: response.headers,
    };
  } catch (error) {
    return {
      status: 0,
      ms: Math.round(performance.now() - started),
      body: "",
      headers: new Headers(),
      error: error instanceof Error ? error.name : "fetch_failed",
    };
  }
}

/** The database's checks, reported one by one. */
export async function databaseHealth(
  fetchImpl: Fetch,
  supabaseUrl: string,
  secretKey: string,
): Promise<Check[]> {
  const result = await timed(fetchImpl, `${supabaseUrl}/rest/v1/rpc/service_ops_health`, {
    method: "POST",
    headers: {
      apikey: secretKey,
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  if (result.status === 404 && result.body.includes("PGRST202")) {
    return [
      {
        name: "database_health",
        status: "warn",
        detail: "api.service_ops_health is not installed yet (migration 20260924200200)",
      },
    ];
  }
  if (result.status !== 200) {
    return [
      {
        name: "database_health",
        status: "fail",
        detail: `health RPC answered ${result.status || "nothing"} after ${result.ms} ms`,
      },
    ];
  }
  // A broken health endpoint must not silently become an empty green report.
  let payload: { status?: unknown; checks?: unknown } | null;
  try {
    payload = JSON.parse(result.body);
  } catch {
    return [
      { name: "database_health", status: "fail", detail: "health RPC returned invalid JSON" },
    ];
  }
  const checks = payload?.checks;
  if (
    !["ok", "warn", "fail"].includes(payload?.status as string) ||
    !Array.isArray(checks) ||
    checks.length === 0 ||
    checks.some(
      (check) =>
        !check ||
        typeof check.name !== "string" ||
        !/^[a-z][a-z0-9_]{1,60}$/.test(check.name) ||
        !["ok", "warn", "fail"].includes(check.status) ||
        typeof check.detail !== "string",
    )
  ) {
    return [
      {
        name: "database_health",
        status: "fail",
        detail: "health RPC returned missing or invalid checks",
      },
    ];
  }
  const reported: Check[] = checks.map((check) => ({
    name: check.name,
    status: check.status,
    detail: String(check.detail ?? "").slice(0, 200),
  }));
  // A partial list, or one that disagrees with the database's own verdict,
  // means the report itself is broken: keep what it said and fail on top.
  const missing = REQUIRED_DATABASE_CHECKS.filter(
    (name) => !reported.some((check) => check.name === name),
  );
  if (missing.length > 0) {
    reported.push({
      name: "database_health",
      status: "fail",
      detail: `health RPC omitted required check(s): ${missing.join(", ")}`,
    });
  } else if (overall(reported) !== payload?.status) {
    reported.push({
      name: "database_health",
      status: "fail",
      detail: `health RPC status ${payload?.status} disagrees with its checks (${overall(reported)})`,
    });
  }
  return reported;
}

/** The public site and one public API call, as a visitor meets them. */
export async function publicSurface(
  fetchImpl: Fetch,
  siteUrl: string,
  supabaseUrl: string,
  publishableKey: string | undefined,
): Promise<Check[]> {
  const checks: Check[] = [];
  for (const path of SITE_PAGES) {
    const result = await timed(fetchImpl, `${siteUrl}${path}`);
    checks.push({
      name: `page_${path === "/" ? "home" : path.replace(/[^a-z]/g, "")}`,
      status: result.status !== 200 ? "fail" : result.ms > SLOW_MS ? "warn" : "ok",
      detail: `${path} answered ${result.status || "nothing"} in ${result.ms} ms`,
    });
  }
  if (publishableKey) {
    const result = await timed(fetchImpl, `${supabaseUrl}/rest/v1/rpc/news_feed`, {
      method: "POST",
      headers: {
        apikey: publishableKey,
        Authorization: `Bearer ${publishableKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ p_language: "fr", p_limit: 1 }),
    });
    checks.push({
      name: "public_api",
      status: result.status !== 200 ? "fail" : result.ms > SLOW_MS ? "warn" : "ok",
      detail: `news_feed answered ${result.status || "nothing"} in ${result.ms} ms`,
    });
  }
  return checks;
}

/** Has the season orchestrator run recently, and did its last run pass? */
export async function orchestratorRecency(
  fetchImpl: Fetch,
  repository: string,
  token: string,
  now: Date,
): Promise<Check> {
  const result = await timed(
    fetchImpl,
    `https://api.github.com/repos/${repository}/actions/workflows/fantasy-season-orchestrator.yml/runs?per_page=5&branch=main`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (result.status !== 200) {
    return {
      name: "season_orchestrator",
      status: "warn",
      detail: `run history unavailable (${result.status || "no answer"})`,
    };
  }
  let runs: Array<{ created_at: string; status: string; conclusion: string | null }>;
  try {
    const payload = JSON.parse(result.body);
    if (!Array.isArray(payload?.workflow_runs)) throw new Error("invalid_run_history");
    runs = payload.workflow_runs;
  } catch {
    return {
      name: "season_orchestrator",
      status: "fail",
      detail: "run history returned invalid data",
    };
  }
  const latest = runs[0];
  if (!latest) return { name: "season_orchestrator", status: "fail", detail: "no run found" };
  const hours = (now.getTime() - Date.parse(latest.created_at)) / 3_600_000;
  if (!Number.isFinite(hours) || hours < 0) {
    return {
      name: "season_orchestrator",
      status: "fail",
      detail: "latest run has an invalid timestamp",
    };
  }
  if (hours > ORCHESTRATOR_STALE_HOURS) {
    return {
      name: "season_orchestrator",
      status: "fail",
      detail: `no run for ${Math.round(hours)} h (scheduled hourly)`,
    };
  }
  const lastDone = runs.find((run) => run.status === "completed");
  return {
    name: "season_orchestrator",
    status: lastDone && lastDone.conclusion !== "success" ? "warn" : "ok",
    detail: `last run ${Math.round(hours * 10) / 10} h ago${
      lastDone ? `, last completed: ${lastDone.conclusion}` : ""
    }`,
  };
}

const RELEASE_WARN_HOURS = 24;
const RELEASE_FAIL_HOURS = 72;

/**
 * Is the live site running what `main` holds? A merge is not a deployment:
 * Lovable publishes by hand, and on 2026-09-24 the live login page still had
 * an open redirect that `main` had fixed days before, with nothing to show
 * it. The site names its commit in `x-botolago-release`; GitHub says how far
 * `main` is ahead of it and since when. Warns after 24 h of unpublished
 * changes, fails (and so alerts) after 72 h.
 */
export async function releaseDrift(
  fetchImpl: Fetch,
  siteUrl: string,
  repository: string,
  token: string,
  now: Date,
): Promise<Check> {
  const site = await timed(fetchImpl, `${siteUrl}/`);
  const release = site.headers.get("x-botolago-release") ?? "";
  if (!/^[0-9a-f]{7,40}$/.test(release)) {
    return {
      name: "release_drift",
      status: "warn",
      detail: `the live site does not report its release (${release || "no header"}): published before the release header, or built without git`,
    };
  }
  const short = release.slice(0, 7);
  const compare = await timed(
    fetchImpl,
    `https://api.github.com/repos/${repository}/compare/${release}...main`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (compare.status === 404) {
    return {
      name: "release_drift",
      status: "warn",
      detail: `live release ${short} is not a commit on GitHub (published from an unsynced edit?)`,
    };
  }
  if (compare.status !== 200) {
    return {
      name: "release_drift",
      status: "warn",
      detail: `comparison with main unavailable (${compare.status || "no answer"})`,
    };
  }
  // `compare/<release>...main`: `status` is main relative to the live release.
  // Only "identical" means the live site runs main. "behind" and "diverged"
  // mean the live site runs commits main does not have (published from
  // outside main), which `ahead_by: 0` alone does not reveal.
  let parsed: unknown;
  try {
    parsed = JSON.parse(compare.body);
  } catch {
    parsed = null;
  }
  const diff = (parsed ?? {}) as {
    status?: string;
    ahead_by?: number;
    behind_by?: number;
    commits?: Array<{ commit?: { committer?: { date?: string } } }>;
  };
  if (diff.status === "identical") {
    return { name: "release_drift", status: "ok", detail: `live site runs main (${short})` };
  }
  if (diff.status !== "ahead" && diff.status !== "behind" && diff.status !== "diverged") {
    return {
      name: "release_drift",
      status: "warn",
      detail: `comparison of the live release (${short}) with main is unreadable (status ${diff.status ?? "missing"})`,
    };
  }
  const ahead = diff.ahead_by ?? 0;
  const liveOnly = diff.behind_by ?? 0;
  const oldest = Date.parse(diff.commits?.[0]?.commit?.committer?.date ?? "");
  const hours = ahead === 0 || Number.isNaN(oldest) ? 0 : (now.getTime() - oldest) / 3_600_000;
  const lag: CheckStatus =
    hours >= RELEASE_FAIL_HOURS ? "fail" : hours >= RELEASE_WARN_HOURS ? "warn" : "ok";
  if (liveOnly > 0) {
    return {
      name: "release_drift",
      status: lag === "fail" ? "fail" : "warn",
      detail: `the live site (${short}) runs ${liveOnly} commit(s) that main does not have${
        ahead > 0 ? `, and main is ${ahead} commit(s) ahead of it` : ""
      }: publish main from Lovable (docs/operations/DEPLOYMENT.md)`,
    };
  }
  return {
    name: "release_drift",
    status: lag,
    detail: `main is ${ahead} commit(s) ahead of the live site (${short}); oldest unpublished change ${Math.round(hours)} h old: publish from Lovable (docs/operations/DEPLOYMENT.md)`,
  };
}

export function overall(checks: Check[]): CheckStatus {
  return checks.length === 0 || checks.some((c) => c.status === "fail")
    ? "fail"
    : checks.some((c) => c.status === "warn")
      ? "warn"
      : "ok";
}

export function renderTable(checks: Check[], status: CheckStatus, now: Date): string {
  return [
    `## Production watchdog: ${status.toUpperCase()} (${now.toISOString().slice(0, 16)}Z)`,
    "",
    "| Check | Status | Detail |",
    "| --- | --- | --- |",
    ...checks.map((c) => `| ${c.name} | ${c.status} | ${c.detail.replace(/\|/g, "\\|")} |`),
    "",
  ].join("\n");
}

if (import.meta.main) {
  const now = new Date();
  const env = process.env;
  const supabaseUrl = (env.SUPABASE_PRODUCTION_URL ?? "").replace(/\/$/, "");
  const checks: Check[] = [];
  if (!supabaseUrl || !env.SUPABASE_SECRET_KEY) {
    checks.push({
      name: "watchdog_config",
      status: "fail",
      detail: "production URL or key missing",
    });
  } else {
    checks.push(...(await databaseHealth(fetch, supabaseUrl, env.SUPABASE_SECRET_KEY)));
    checks.push(
      ...(await publicSurface(
        fetch,
        (env.SITE_URL ?? "https://botolago.com").replace(/\/$/, ""),
        supabaseUrl,
        env.SUPABASE_PRODUCTION_PUBLISHABLE_KEY,
      )),
    );
  }
  if (env.GITHUB_TOKEN && env.GITHUB_REPOSITORY) {
    checks.push(await orchestratorRecency(fetch, env.GITHUB_REPOSITORY, env.GITHUB_TOKEN, now));
    checks.push(
      await releaseDrift(
        fetch,
        (env.SITE_URL ?? "https://botolago.com").replace(/\/$/, ""),
        env.GITHUB_REPOSITORY,
        env.GITHUB_TOKEN,
        now,
      ),
    );
  }
  if (env.WATCHDOG_SIMULATE_FAILURE === "true") {
    checks.push({
      name: "simulated_failure",
      status: "fail",
      detail: "manual test of the alert path (workflow_dispatch input)",
    });
  }
  const status = overall(checks);
  const failing = checks.filter((c) => c.status === "fail");
  const evidence = {
    verdict: status === "fail" ? "failed" : status,
    code: failing[0]?.name,
    failingChecks: failing.map((c) => ({ name: c.name, detail: c.detail })),
    checks,
    observedAt: now.toISOString(),
  };
  const serialized = JSON.stringify(evidence, null, 2);
  for (const secret of [env.SUPABASE_SECRET_KEY, env.GITHUB_TOKEN]) {
    if (secret && serialized.includes(secret)) throw new Error("credential_in_evidence");
  }
  await writeFile(env.WATCHDOG_EVIDENCE ?? "watchdog.json", `${serialized}\n`);
  if (env.GITHUB_STEP_SUMMARY)
    await appendFile(env.GITHUB_STEP_SUMMARY, renderTable(checks, status, now));
  console.log(`WATCHDOG_${status.toUpperCase()} ${failing.map((c) => c.name).join(",")}`);
  if (status === "fail") process.exitCode = 1;
}
