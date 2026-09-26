// Refreshes the current season's fixtures for yesterday, today and tomorrow.
//
// Woken every 15 minutes by pg_cron (app_private.football_live_refresh_tick),
// and only while a match is on or about to start, so results reach the app —
// and the results email — within minutes of the final whistle instead of at
// the next GitHub orchestrator run. It runs the very same SportsMonks fixture
// handler the orchestrator and the recovery script use
// (handleSportsMonksFixtureRequest): same validation, same
// api.ingest_football_fixture writes, same freshness guard, which already
// rejects a stale write if both ever overlap.
//
// `{"job":"season_fixtures"}` reads the weeks ahead instead
// (SEASON_REFRESH_DAYS_AHEAD), leaves a match whose round or club is not
// catalogued yet for the orchestrator (`skipUncatalogued`), and stops after
// the scores: pg_cron calls it
// hourly (app_private.football_season_refresh_tick), so a kickoff moved or a
// match postponed at the provider reaches the app, and the Fantasy calendar
// sync after it, within the hour. Until 2026-09-26 only the GitHub
// orchestrator read beyond tomorrow, and GitHub started its hourly schedule
// three to six hours apart.
//
// After the scores, the same call fetches the details of the matches that are
// on or just over — events, team statistics, lineups — for the match page
// (runMatchDetailsRefresh). That step only reports: a score is never held
// back by it. `{"job":"match_details_backfill"}` runs the details step alone,
// for finished matches that have none, as a one-off.
//
// Dependency-free apart from those handlers, so it runs under Bun (tests) and
// Deno (the Edge Function).

import { handleSportsMonksFixtureRequest, type FixtureRpcClient } from "./sportsmonks-fixtures.ts";
import { runMatchDetailsRefresh } from "./sportsmonks-match-details.ts";

type FetchLike = (input: string | URL | Request, init?: RequestInit) => Promise<Response>;

export type LiveRefreshRpcClient = FixtureRpcClient;

export interface LiveRefreshDependencies {
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly client: LiveRefreshRpcClient;
  readonly fetch?: FetchLike;
  readonly now?: () => Date;
  readonly randomHex?: (bytes: number) => string;
}

// Botola Pro and the 2026/27 season at SportsMonks, as in
// scripts/backend/current-season-recovery.ts. Override with the secrets
// FOOTBALL_LIVE_LEAGUE_ID / FOOTBALL_LIVE_SEASON_ID when the season changes.
export const DEFAULT_LEAGUE_ID = "860";
export const DEFAULT_SEASON_ID = "28647";
const MAX_REQUEST_BYTES = 4096;
/**
 * How far ahead the hourly season refresh reads: six weeks, the next five or
 * six rounds, where kickoffs get confirmed and moved. At one round a week (two
 * in a busy week) that is 50 to 100 fixtures, inside the three pages of 50 the
 * call asks for and the shared handler's 100-day window.
 */
export const SEASON_REFRESH_DAYS_AHEAD = 42;

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

function isoDay(date: Date, offsetDays: number): string {
  return new Date(date.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function positiveId(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  return /^[1-9][0-9]{0,9}$/.test(candidate) ? candidate : fallback;
}

/** The window and settings handed to the shared fixture handler. */
export function liveRefreshEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
  now: Date,
  trigger: string,
  daysAhead = 1,
): Record<string, string | undefined> {
  return {
    ...environment,
    FOOTBALL_PROVIDER: "sportsmonks",
    FOOTBALL_PROVIDER_BASE_URL: "https://api.sportmonks.com/v3/football",
    FOOTBALL_SPORTSMONKS_LEAGUE_ID: positiveId(
      environment.FOOTBALL_LIVE_LEAGUE_ID,
      DEFAULT_LEAGUE_ID,
    ),
    FOOTBALL_SPORTSMONKS_SEASON_ID: positiveId(
      environment.FOOTBALL_LIVE_SEASON_ID,
      DEFAULT_SEASON_ID,
    ),
    FOOTBALL_SPORTSMONKS_FIXTURE_FROM: isoDay(now, -1),
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: isoDay(now, daysAhead),
    FOOTBALL_PROVIDER_TIMEOUT_MS: "15000",
    FOOTBALL_PROVIDER_MAX_RETRIES: "2",
    FOOTBALL_INGESTION_TRIGGER_SECRET: trigger,
  };
}

export async function handleFootballLiveRefreshRequest(
  request: Request,
  dependencies: LiveRefreshDependencies,
): Promise<Response> {
  if (request.method !== "POST") return json(405, { error: "method_not_allowed" });
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > MAX_REQUEST_BYTES) {
    return json(413, { error: "request_too_large" });
  }
  const token = request.headers.get("x-botolago-scheduler-token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return json(401, { error: "unauthorized" });
  try {
    const verified = await dependencies.client
      .schema("api")
      .rpc("service_verify_scheduler_token", { p_token: token });
    if (verified.error || verified.data !== true) return json(401, { error: "unauthorized" });
  } catch {
    return json(503, { error: "database_unavailable" });
  }

  const job = await requestedJob(request);
  if (job === null) return json(400, { error: "invalid_request" });

  // The fixture handler insists on a one-off trigger secret of its own; it
  // never leaves this process.
  const trigger = (dependencies.randomHex ?? defaultRandomHex)(32);
  const now = (dependencies.now ?? (() => new Date()))();
  const environment = liveRefreshEnvironment(
    dependencies.environment,
    now,
    trigger,
    job === "season_fixtures" ? SEASON_REFRESH_DAYS_AHEAD : 1,
  );
  const details = (scope: "live" | "backfill") =>
    runMatchDetailsRefresh(scope, {
      environment,
      client: dependencies.client,
      fetch: dependencies.fetch,
      now: dependencies.now,
    });

  if (job === "match_details_backfill") {
    const outcome = await details("backfill");
    return json("error" in outcome ? 502 : 200, {
      provider: "sportsmonks",
      jobs: { matchDetails: outcome },
    });
  }

  const inner = new Request("https://localhost/football-live-refresh", {
    method: "POST",
    headers: { "content-type": "application/json", "x-botolago-ingestion-key": trigger },
    body: JSON.stringify({
      job: "fixtures",
      pageSize: 50,
      maxPages: 3,
      // Six weeks ahead reaches rounds SportsMonks has just published and the
      // orchestrator's catalog has not registered yet: those matches wait for
      // it, the rest of the season still refreshes.
      ...(job === "season_fixtures" ? { skipUncatalogued: true } : {}),
    }),
  });
  const scores = await handleSportsMonksFixtureRequest(inner, {
    environment,
    client: dependencies.client,
    fetch: dependencies.fetch,
    now: dependencies.now,
  });
  const body = (await scores.json()) as Record<string, unknown>;
  // The season refresh is about kickoffs and postponements: the matches on
  // now are the live refresh's, details included.
  if (job === "season_fixtures") return json(scores.status, body);
  // With the provider or the configuration failing, the details would fail
  // the same way, and only add minutes to a call pg_net stops waiting for
  // after 60 seconds. A single rejected fixture does not stop them.
  if (scores.status !== 200 && !DETAILS_AFTER_ERRORS.has(String(body.error))) {
    return json(scores.status, body);
  }
  const outcome = await details("live");
  return json(scores.status, { ...body, matchDetails: outcome });
}

/** Fixture-job failures that leave the provider and the database usable. */
const DETAILS_AFTER_ERRORS: ReadonlySet<string> = new Set([
  "fixture_item_rejected",
  "page_budget_exhausted",
]);

/**
 * `{"job":"fixtures"}` (the live tick's, and the default), `{"job":"season_fixtures"}`
 * (the hourly season tick's) or `{"job":"match_details_backfill"}`.
 */
async function requestedJob(
  request: Request,
): Promise<"fixtures" | "season_fixtures" | "match_details_backfill" | null> {
  const source = await request.text();
  if (source.length > MAX_REQUEST_BYTES) return null;
  if (!source.trim()) return "fixtures";
  try {
    const body = JSON.parse(source) as unknown;
    const job =
      typeof body === "object" && body !== null && !Array.isArray(body)
        ? (body as { job?: unknown }).job
        : undefined;
    if (job === undefined || job === "fixtures") return "fixtures";
    if (job === "season_fixtures") return "season_fixtures";
    if (job === "match_details_backfill") return "match_details_backfill";
    return null;
  } catch {
    return null;
  }
}
