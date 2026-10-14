// Botola Pro table from SofaScore (`tournaments/get-standings`), written into
// app.standings through api.service_apply_sofascore_standings so the match
// screens (api.football_standings) keep reading the table they always read.
//
// Unknown is not zero. A figure SofaScore leaves out (or sends as anything but
// a whole number >= 0) is `null` here, and a row with any null is never sent:
// the club's stored row stays as it was. The database function checks the same
// thing again.
//
// When it runs (sofascore-live-refresh.ts):
//   * after a live tick that wrote a fixture as finished: ONE request per tick,
//     whatever the number of matches that finished together;
//   * in the daily pass of the season job.
//
// Dependency-free apart from sibling shared modules (Bun tests, Deno runtime).

import { RapidApiError } from "./rapidapi-client.ts";
import type { SofascoreIngestCall, SofascoreShadowClient } from "./sofascore-fixtures.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

export type StandingsTrigger = "after_match" | "daily";

export interface ParsedStandingRow {
  readonly teamExternalId: string;
  /** Null when SofaScore did not give a usable value. Never 0 by default. */
  readonly rank: number | null;
  readonly played: number | null;
  readonly won: number | null;
  readonly drawn: number | null;
  readonly lost: number | null;
  readonly goalsFor: number | null;
  readonly goalsAgainst: number | null;
  readonly points: number | null;
}

export interface ParsedStandings {
  readonly rows: readonly ParsedStandingRow[];
  /** ISO time SofaScore says the table was last updated; null when absent. */
  readonly updatedAt: string | null;
  /** Rows that could not even be identified (no team id). */
  readonly malformedRows: number;
}

export function standingsPath(tournamentId: string, seasonId: string): string {
  return `tournaments/get-standings?tournamentId=${tournamentId}&seasonId=${seasonId}&type=total`;
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** A whole number >= 0, or null. A missing, null, string or negative value is null. */
export function countOrNull(value: unknown): number | null {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0 ? value : null;
}

function positionOrNull(value: unknown): number | null {
  const count = countOrNull(value);
  return count !== null && count >= 1 ? count : null;
}

/**
 * The overall ("total") table out of the reply. Lenient on purpose: a missing
 * figure becomes null instead of rejecting the table, so the figures that are
 * known are still usable. Returns null when the reply is not a standings reply
 * at all.
 */
export function parseStandingsRows(payload: unknown): ParsedStandings | null {
  if (!isRecord(payload) || !Array.isArray(payload.standings)) return null;
  const tables = payload.standings.filter(isRecord);
  const table = tables.find((candidate) => candidate.type === "total") ?? tables[0];
  if (!table || !Array.isArray(table.rows)) return null;
  const rows: ParsedStandingRow[] = [];
  let malformedRows = 0;
  for (const raw of table.rows) {
    const team = isRecord(raw) && isRecord(raw.team) ? raw.team : null;
    const id = team && countOrNull(team.id);
    if (!isRecord(raw) || !id) {
      malformedRows += 1;
      continue;
    }
    rows.push({
      teamExternalId: String(id),
      rank: positionOrNull(raw.position),
      played: countOrNull(raw.matches),
      won: countOrNull(raw.wins),
      drawn: countOrNull(raw.draws),
      lost: countOrNull(raw.losses),
      goalsFor: countOrNull(raw.scoresFor),
      goalsAgainst: countOrNull(raw.scoresAgainst),
      points: countOrNull(raw.points),
    });
  }
  const stamp = countOrNull(table.updatedAtTimestamp);
  return {
    rows,
    updatedAt: stamp === null ? null : new Date(stamp * 1000).toISOString(),
    malformedRows,
  };
}

const FIGURES = [
  "rank",
  "played",
  "won",
  "drawn",
  "lost",
  "goalsFor",
  "goalsAgainst",
  "points",
] as const;

export function isCompleteStandingRow(row: ParsedStandingRow): boolean {
  return FIGURES.every((key) => row[key] !== null);
}

/** What goes to the database, and which clubs were left out and why. */
export function buildStandingsPayload(parsed: ParsedStandings): {
  readonly rows: readonly ParsedStandingRow[];
  readonly incomplete: readonly string[];
} {
  const rows: ParsedStandingRow[] = [];
  const incomplete: string[] = [];
  const seenTeams = new Set<string>();
  const seenRanks = new Set<number>();
  for (const row of parsed.rows) {
    if (
      !isCompleteStandingRow(row) ||
      seenTeams.has(row.teamExternalId) ||
      seenRanks.has(row.rank as number)
    ) {
      incomplete.push(row.teamExternalId);
      continue;
    }
    seenTeams.add(row.teamExternalId);
    seenRanks.add(row.rank as number);
    rows.push(row);
  }
  return { rows, incomplete };
}

/**
 * True when this tick wrote a fixture as finished. Several matches finishing
 * together are still one `true`: the caller makes one request for the tick.
 */
export function finishedWrittenThisTick(toWrite: readonly SofascoreIngestCall[]): boolean {
  return toWrite.some((call) => call.p_fixture.status === "finished");
}

/** The daily pass of the season job: the hour of day (UTC) it falls in. */
export const STANDINGS_DAILY_HOUR_DEFAULT = 3;

export function isDailyStandingsHour(
  now: Date,
  environment: Readonly<Record<string, string | undefined>>,
): boolean {
  const raw = environment.SOFASCORE_DAILY_HOUR_UTC?.trim();
  const parsed = raw ? Number(raw) : STANDINGS_DAILY_HOUR_DEFAULT;
  const hour =
    Number.isInteger(parsed) && parsed >= 0 && parsed <= 23 ? parsed : STANDINGS_DAILY_HOUR_DEFAULT;
  return now.getUTCHours() === hour;
}

export interface StandingsRefreshDependencies {
  readonly mode: "sofascore" | "shadow";
  readonly trigger: StandingsTrigger;
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly tournamentId: string;
  readonly seasonId: string;
  readonly now: Date;
  readonly log: (fields: Record<string, unknown>) => void;
}

export interface StandingsSummary {
  readonly status: "ok" | "shadow" | "error";
  readonly trigger: StandingsTrigger;
  readonly requests: number;
  readonly error?: string;
  readonly sent?: number;
  readonly incomplete?: readonly string[];
  readonly result?: Record<string, unknown>;
}

/**
 * The time the table is observed at, for the database's STALE_UPDATE guard:
 * SofaScore's own `updatedAtTimestamp` when it gave one, so an older (cached
 * or out-of-order) table fetched later cannot overwrite a newer one. A stamp
 * missing or later than `now` (a clock we cannot trust) falls back to `now`.
 */
export function standingsObservedAt(parsed: ParsedStandings, now: Date): string {
  if (parsed.updatedAt === null) return now.toISOString();
  const provider = Date.parse(parsed.updatedAt);
  if (!Number.isFinite(provider) || provider > now.getTime()) return now.toISOString();
  return new Date(provider).toISOString();
}

/**
 * One standings request and, in `sofascore` mode, one database call. Never
 * throws: standings must not fail the scores or the details around them.
 */
export async function runStandingsRefresh(
  dependencies: StandingsRefreshDependencies,
): Promise<StandingsSummary> {
  const { mode, trigger, client, rapid, now, log } = dependencies;
  let parsed: ParsedStandings | null;
  try {
    const reply = await rapid.getJson(
      standingsPath(dependencies.tournamentId, dependencies.seasonId),
    );
    parsed = parseStandingsRows(reply.data);
  } catch (error) {
    const code = error instanceof RapidApiError ? error.code : "invalid_provider_payload";
    log({ standings: "error", trigger, error: code });
    return { status: "error", trigger, requests: 1, error: code };
  }
  if (!parsed) {
    log({ standings: "error", trigger, error: "invalid_provider_payload" });
    return { status: "error", trigger, requests: 1, error: "invalid_provider_payload" };
  }
  const payload = buildStandingsPayload(parsed);
  if (payload.rows.length === 0) {
    log({ standings: "error", trigger, error: "no_complete_rows" });
    return {
      status: "error",
      trigger,
      requests: 1,
      error: "no_complete_rows",
      incomplete: payload.incomplete,
    };
  }
  if (mode === "shadow") {
    log({
      standings: "shadow",
      trigger,
      rows: payload.rows.length,
      incomplete: payload.incomplete,
    });
    return {
      status: "shadow",
      trigger,
      requests: 1,
      sent: payload.rows.length,
      incomplete: payload.incomplete,
    };
  }
  try {
    const result = await client.schema("api").rpc("service_apply_sofascore_standings", {
      p_season_external_id: dependencies.seasonId,
      p_rows: payload.rows,
      p_observed_at: standingsObservedAt(parsed, now),
    });
    if (result.error) {
      const code = result.error.message === "STALE_UPDATE" ? "stale" : "database_rejected";
      log({ standings: "error", trigger, error: code });
      return { status: "error", trigger, requests: 1, error: code };
    }
    const summary = isRecord(result.data) ? result.data : {};
    log({
      standings: "ok",
      trigger,
      sent: payload.rows.length,
      incomplete: payload.incomplete,
      ...summary,
    });
    return {
      status: "ok",
      trigger,
      requests: 1,
      sent: payload.rows.length,
      incomplete: payload.incomplete,
      result: summary,
    };
  } catch {
    log({ standings: "error", trigger, error: "database_unavailable" });
    return { status: "error", trigger, requests: 1, error: "database_unavailable" };
  }
}
