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
// Dependency-free apart from that handler, so it runs under Bun (tests) and
// Deno (the Edge Function).

import { handleSportsMonksFixtureRequest, type FixtureRpcClient } from "./sportsmonks-fixtures.ts";

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
    FOOTBALL_SPORTSMONKS_FIXTURE_TO: isoDay(now, 1),
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

  // The fixture handler insists on a one-off trigger secret of its own; it
  // never leaves this process.
  const trigger = (dependencies.randomHex ?? defaultRandomHex)(32);
  const now = (dependencies.now ?? (() => new Date()))();
  const inner = new Request("https://localhost/football-live-refresh", {
    method: "POST",
    headers: { "content-type": "application/json", "x-botolago-ingestion-key": trigger },
    body: JSON.stringify({ job: "fixtures", pageSize: 50, maxPages: 3 }),
  });
  return handleSportsMonksFixtureRequest(inner, {
    environment: liveRefreshEnvironment(dependencies.environment, now, trigger),
    client: dependencies.client,
    fetch: dependencies.fetch,
    now: dependencies.now,
  });
}
