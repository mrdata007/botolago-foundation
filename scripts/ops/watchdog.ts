/**
 * Production watchdog: one answer to "is BotolaGO healthy right now?".
 *
 * Run by .github/workflows/ops-watchdog.yml every 30 minutes and after every
 * season orchestrator run. It reads the database's own health
 * (`api.service_ops_health`: every check the database names, reported as it
 * states it; a report that is partial, malformed or at odds with its own
 * verdict fails), loads the public pages and one public API call the way a
 * visitor does -- the sitemap must also contain entries, not only answer 200
 * -- checks that the season orchestrator has actually run recently and that
 * its last run was not red (GitHub started its hourly schedule only every
 * 3.5-5.5 hours on 23-24 Sep 2026, and did not start this watchdog's own
 * schedule at all in its first hours on main), and ages every Fantasy
 * gameweek whose window has ended without final points, from the database,
 * whether or not the orchestrator runs.
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
// So are the checks migrations 20260926003050 and 20260926003400 add
// (news_sitemap, fantasy_gameweek_clubs, fantasy_fixture_coverage,
// fantasy_scoring) until production has them: they are reported whenever the
// database names them, and join this list once every database the watchdog
// reads does.
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

/** The database's checks, reported one by one, and the report itself held to account. */
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
  let payload: unknown;
  try {
    payload = JSON.parse(result.body);
  } catch {
    return [
      { name: "database_health", status: "fail", detail: "health RPC answered 200 without JSON" },
    ];
  }
  const report = (typeof payload === "object" && payload !== null ? payload : {}) as {
    status?: unknown;
    checks?: unknown;
  };
  if (!Array.isArray(report.checks) || report.checks.length === 0) {
    return [{ name: "database_health", status: "fail", detail: "health RPC returned no checks" }];
  }
  // Every check the database names is reported, whatever it is called: new
  // ones (fixture coverage, scoring, sitemap freshness, ...) page as soon as
  // their migration lands, with no change here. A malformed entry fails the
  // report (below) without hiding the other checks.
  const checks: Check[] = [];
  let unnamed = 0;
  let unrecognised = 0;
  const withoutDetail: string[] = [];
  for (const entry of report.checks) {
    const fields = (typeof entry === "object" && entry !== null ? entry : {}) as Record<
      string,
      unknown
    >;
    const { name, status, detail } = fields;
    // No name of ours: nothing the entry says can be trusted, not even for
    // the alert's text, so it is only counted.
    if (typeof name !== "string" || !/^[a-z][a-z0-9_]{1,60}$/.test(name)) {
      unnamed += 1;
      continue;
    }
    if (typeof detail !== "string") withoutDetail.push(name);
    const stated = typeof detail === "string" ? detail.slice(0, 200) : "(no detail)";
    if (isCheckStatus(status)) {
      checks.push({ name, status, detail: stated });
      continue;
    }
    // A status this script does not know fails under the check's own name
    // rather than being dropped: it may well mean something worse than fail.
    unrecognised += 1;
    checks.push({
      name,
      status: "fail",
      detail: `unrecognised status ${
        typeof status === "string" && /^[a-z_]{1,20}$/.test(status) ? `"${status}"` : "(unreadable)"
      }: ${stated}`.slice(0, 200),
    });
  }
  // The report as a whole: malformed entries, a required check missing, no
  // verdict, or a verdict that disagrees with the checks means the report
  // itself is broken. Keep what it said and fail on top, once, naming why.
  // The verdict is compared only with a complete list whose every entry was
  // named and stated a status this script knows; any other report already
  // fails here, and a comparison with it would only add noise.
  const problems: string[] = [];
  if (unnamed > 0) {
    problems.push(`returned ${unnamed} entr${unnamed === 1 ? "y" : "ies"} without a check name`);
  }
  if (withoutDetail.length > 0) {
    problems.push(`returned ${withoutDetail.join(", ")} without a detail`);
  }
  const missing = REQUIRED_DATABASE_CHECKS.filter(
    (name) => !checks.some((check) => check.name === name),
  );
  if (missing.length > 0) problems.push(`omitted required check(s): ${missing.join(", ")}`);
  if (!isCheckStatus(report.status)) problems.push("returned no overall status");
  else if (
    unnamed === 0 &&
    unrecognised === 0 &&
    missing.length === 0 &&
    overall(checks) !== report.status
  ) {
    problems.push(`status ${report.status} disagrees with its checks (${overall(checks)})`);
  }
  if (problems.length > 0) {
    checks.push({
      name: "database_health",
      status: "fail",
      detail: `health RPC ${problems.join("; ")}`,
    });
  }
  return checks;
}

function isCheckStatus(value: unknown): value is CheckStatus {
  return value === "ok" || value === "warn" || value === "fail";
}

/**
 * A sitemap that answers 200 must also be one: a `urlset` or a sitemap index
 * with at least one `<loc>`. `null` when the body is neither.
 */
export function sitemapEntries(
  body: string,
): { kind: "urlset" | "sitemapindex"; entries: number } | null {
  const kind = /<urlset[\s>]/.test(body)
    ? "urlset"
    : /<sitemapindex[\s>]/.test(body)
      ? "sitemapindex"
      : null;
  return kind ? { kind, entries: (body.match(/<loc>/g) ?? []).length } : null;
}

function pageCheck(path: string, result: { status: number; ms: number; body: string }): Check {
  const name = `page_${path === "/" ? "home" : path.replace(/[^a-z]/g, "")}`;
  const answered = `${path} answered ${result.status || "nothing"} in ${result.ms} ms`;
  if (result.status !== 200) return { name, status: "fail", detail: answered };
  if (path === "/sitemap.xml") {
    const sitemap = sitemapEntries(result.body);
    if (!sitemap || sitemap.entries === 0)
      return { name, status: "fail", detail: `${answered} without a sitemap entry in the body` };
    return {
      name,
      status: result.ms > SLOW_MS ? "warn" : "ok",
      detail: `${answered} (${sitemap.entries} ${sitemap.kind === "urlset" ? "URLs" : "sitemaps"})`,
    };
  }
  return { name, status: result.ms > SLOW_MS ? "warn" : "ok", detail: answered };
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
    checks.push(pageCheck(path, await timed(fetchImpl, `${siteUrl}${path}`)));
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

type WorkflowRun = { created_at: string; status: string; conclusion: string | null };

/**
 * A workflow's latest runs on main, newest first. Instead: `unavailable`
 * with the status GitHub answered, or `invalid` when it answered 200 with
 * something that is not a list of runs -- which must not read as "no run
 * found" or as a healthy history.
 */
async function workflowRuns(
  fetchImpl: Fetch,
  repository: string,
  token: string,
  workflowFile: string,
  query: string,
): Promise<WorkflowRun[] | { unavailable: number } | { invalid: true }> {
  const result = await timed(
    fetchImpl,
    `https://api.github.com/repos/${repository}/actions/workflows/${workflowFile}/runs?${query}&branch=main`,
    {
      headers: {
        Accept: "application/vnd.github+json",
        Authorization: `Bearer ${token}`,
        "X-GitHub-Api-Version": "2022-11-28",
      },
    },
  );
  if (result.status !== 200) return { unavailable: result.status };
  let runs: unknown;
  try {
    runs = (JSON.parse(result.body) as { workflow_runs?: unknown } | null)?.workflow_runs;
  } catch {
    return { invalid: true };
  }
  return Array.isArray(runs) && runs.every((run) => typeof run === "object" && run !== null)
    ? (runs as WorkflowRun[])
    : { invalid: true };
}

/**
 * How far past the watchdog's `now` a run's creation may lie. `now` is read
 * once, at start-up, and a run GitHub creates while this job is still
 * running (for up to its `timeout-minutes: 10`, .github/workflows/ops-watchdog.yml)
 * is newer than it: the orchestrator's schedule (12 past) falls five minutes
 * after this one's (7 past), and GitHub starts both late.
 */
const RUN_CREATED_AFTER_NOW_MS = 10 * 60_000;

/**
 * Hours since GitHub created the run: 0 for one created since this job
 * started, `null` for a time that cannot be read or lies further ahead than
 * that, which must not make a stopped workflow look fresh.
 */
function runAgeHours(run: WorkflowRun, now: Date): number | null {
  const age = now.getTime() - Date.parse(run.created_at);
  if (!Number.isFinite(age) || age < -RUN_CREATED_AFTER_NOW_MS) return null;
  return Math.max(0, age) / 3_600_000;
}

/** Has the season orchestrator run recently, and did its last run pass? */
export async function orchestratorRecency(
  fetchImpl: Fetch,
  repository: string,
  token: string,
  now: Date,
): Promise<Check> {
  const runs = await workflowRuns(
    fetchImpl,
    repository,
    token,
    "fantasy-season-orchestrator.yml",
    "per_page=5",
  );
  if ("invalid" in runs) {
    return {
      name: "season_orchestrator",
      status: "fail",
      detail: "run history returned invalid data",
    };
  }
  if ("unavailable" in runs) {
    return {
      name: "season_orchestrator",
      status: "warn",
      detail: `run history unavailable (${runs.unavailable || "no answer"})`,
    };
  }
  const latest = runs[0];
  if (!latest) return { name: "season_orchestrator", status: "fail", detail: "no run found" };
  const hours = runAgeHours(latest, now);
  if (hours === null) {
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
  // A red run is the orchestrator saying something is wrong now: statistics
  // missing past the threshold, a gameweek past its window without points, a
  // failed provider refresh or worker. It pages from here too, so the page
  // does not depend on that run's own alert step. A cancelled or skipped run
  // said nothing and only warns.
  const red = ["failure", "timed_out", "startup_failure"].includes(lastDone?.conclusion ?? "");
  return {
    name: "season_orchestrator",
    status: red ? "fail" : lastDone && lastDone.conclusion !== "success" ? "warn" : "ok",
    detail: `last run ${Math.round(hours * 10) / 10} h ago${
      lastDone ? `, last completed: ${lastDone.conclusion}` : ""
    }${red ? " (its run summary names what escalated)" : ""}`,
  };
}

/** Mirrors COVERAGE_ESCALATE_HOURS in scripts/backend/fantasy-season-orchestrator.ts. */
export const POINTS_ESCALATE_HOURS = 6;
const POINTS_PENDING = ["open", "locked", "live", "provisional", "finalizing"];

/**
 * The repository variable FANTASY_COVERAGE_ESCALATE_HOURS, as the orchestrator
 * reads it (1-168); `null` when it is set to something else.
 */
export function pointsEscalateHours(raw: string | undefined): number | null {
  if (raw === undefined || raw === "") return POINTS_ESCALATE_HOURS;
  if (!/^\d{1,3}$/.test(raw) || Number(raw) < 1 || Number(raw) > 168) return null;
  return Number(raw);
}

/**
 * Has every Fantasy gameweek whose window has ended got its final points?
 * Read from the database through the same public contracts the Fantasy pages
 * use (`api.fantasy_hub` for the season, `api.fantasy_gameweeks` for the
 * windows), so it holds whether or not the orchestrator runs: on 2026-09-25
 * GitHub started that job only every three to six hours. A gameweek still
 * open, locked, live, provisional or finalizing more than `escalateHours`
 * after its window ended fails; one inside that allowance warns. The window
 * end is `endsAt` as `api.fantasy_gameweeks` returns it (the stored
 * `app.fantasy_gameweeks.ends_at`), not a fixed offset from the last counted
 * kickoff: production's GW1 ends 28 Sep 00:00 UTC, four hours after its last
 * counted kickoff (27 Sep 20:00 UTC).
 */
export async function fantasyPoints(
  fetchImpl: Fetch,
  supabaseUrl: string,
  secretKey: string,
  now: Date,
  escalateHours: number = POINTS_ESCALATE_HOURS,
): Promise<Check> {
  const call = (name: string, body: unknown) =>
    timed(fetchImpl, `${supabaseUrl}/rest/v1/rpc/${name}`, {
      method: "POST",
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${secretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });
  const unreadable = (what: string, status: number): Check => ({
    name: "fantasy_points",
    status: "fail",
    detail: `${what} unreadable (${status || "no answer"}): no gameweek can be shown to be on time`,
  });
  const hub = await call("fantasy_hub", { p_language: "fr" });
  if (hub.status === 404 && hub.body.includes("fantasy_season_closed"))
    return { name: "fantasy_points", status: "ok", detail: "no Fantasy season is open" };
  let seasonId: unknown;
  try {
    seasonId = (JSON.parse(hub.body) as { season?: { id?: unknown } }).season?.id;
  } catch {
    seasonId = undefined;
  }
  if (hub.status !== 200 || typeof seasonId !== "string" || !/^[0-9a-f-]{36}$/.test(seasonId))
    return unreadable("the Fantasy season", hub.status);
  const windows = await call("fantasy_gameweeks", {
    p_season_id: seasonId,
    p_before_sequence: null,
    p_limit: 100,
  });
  let items: Array<Record<string, unknown>>;
  try {
    const parsed = (JSON.parse(windows.body) as { items?: unknown }).items;
    if (windows.status !== 200 || !Array.isArray(parsed)) throw new Error("unreadable");
    items = parsed as Array<Record<string, unknown>>;
  } catch {
    return unreadable("the gameweek windows", windows.status);
  }
  const ended = items
    .filter((gw) => POINTS_PENDING.includes(String(gw.status)))
    .map((gw) => {
      const end = Date.parse(String(gw.endsAt));
      return {
        sequence: Number(gw.sequence),
        status: String(gw.status),
        hours: Number.isNaN(end) ? null : Math.round(((now.getTime() - end) / 3_600_000) * 10) / 10,
      };
    })
    .filter((gw) => gw.hours === null || gw.hours >= 0)
    .sort((a, b) => a.sequence - b.sequence);
  if (ended.length === 0)
    return {
      name: "fantasy_points",
      status: "ok",
      detail: "every gameweek whose window has ended has final points",
    };
  const overdue = ended.filter((gw) => gw.hours === null || gw.hours >= escalateHours);
  const listed = ended
    .slice(0, 5)
    .map(
      (gw) =>
        `GW${Number.isSafeInteger(gw.sequence) ? gw.sequence : "?"} ${
          /^[a-z]{1,20}$/.test(gw.status) ? gw.status : "?"
        } ${gw.hours === null ? "(window end unreadable)" : `${gw.hours} h after its window`}`,
    )
    .join("; ");
  return {
    name: "fantasy_points",
    status: overdue.length ? "fail" : "warn",
    detail: `${listed}: ${
      overdue.length
        ? `past ${escalateHours} h without final points (docs/backend/FANTASY_SEASON_ORCHESTRATION_RUNBOOK.md)`
        : `points pending, escalates at ${escalateHours} h`
    }`.slice(0, 200),
  };
}

const WATCHDOG_SCHEDULE_WARN_HOURS = 2;

/**
 * Is GitHub starting this watchdog on its own schedule? On 2026-09-25 it had
 * not, once, in the first two and a half hours after the workflow reached
 * main, while it started the hourly orchestrator only every three to six
 * hours. The watchdog also runs after every orchestrator run now, and this
 * row says when its own schedule last fired. A warning, not a failure: the
 * owner cannot repair GitHub's scheduler; the database webhook
 * (docs/operations/ALERTS.md) is the channel that does not depend on it.
 */
export async function watchdogSchedule(
  fetchImpl: Fetch,
  repository: string,
  token: string,
  now: Date,
): Promise<Check> {
  const runs = await workflowRuns(
    fetchImpl,
    repository,
    token,
    "ops-watchdog.yml",
    "event=schedule&per_page=1",
  );
  // Unreadable history warns too: this row never pages (see above).
  if ("invalid" in runs) {
    return {
      name: "watchdog_schedule",
      status: "warn",
      detail: "run history returned invalid data",
    };
  }
  if ("unavailable" in runs) {
    return {
      name: "watchdog_schedule",
      status: "warn",
      detail: `run history unavailable (${runs.unavailable || "no answer"})`,
    };
  }
  const latest = runs[0];
  if (!latest) {
    return {
      name: "watchdog_schedule",
      status: "warn",
      detail:
        "GitHub has never started this watchdog on its schedule; it runs only after the orchestrator and by hand",
    };
  }
  const hours = runAgeHours(latest, now);
  if (hours === null) {
    return {
      name: "watchdog_schedule",
      status: "warn",
      detail: "latest scheduled run has an invalid timestamp",
    };
  }
  return hours > WATCHDOG_SCHEDULE_WARN_HOURS
    ? {
        name: "watchdog_schedule",
        status: "warn",
        detail: `GitHub last started the 30-minute schedule ${Math.round(hours * 10) / 10} h ago`,
      }
    : {
        name: "watchdog_schedule",
        status: "ok",
        detail: `schedule last started ${Math.round(hours * 10) / 10} h ago`,
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
    const escalateHours = pointsEscalateHours(env.FANTASY_COVERAGE_ESCALATE_HOURS);
    if (escalateHours === null)
      checks.push({
        name: "watchdog_config",
        status: "warn",
        detail: `FANTASY_COVERAGE_ESCALATE_HOURS is not 1-168; ${POINTS_ESCALATE_HOURS} h used`,
      });
    checks.push(
      await fantasyPoints(
        fetch,
        supabaseUrl,
        env.SUPABASE_SECRET_KEY,
        now,
        escalateHours ?? POINTS_ESCALATE_HOURS,
      ),
    );
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
    checks.push(await watchdogSchedule(fetch, env.GITHUB_REPOSITORY, env.GITHUB_TOKEN, now));
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
    trigger: env.GITHUB_EVENT_NAME ?? "local",
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
