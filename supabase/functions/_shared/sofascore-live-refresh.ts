// SofaScore path of the football-live-refresh Edge Function.
//
// football-live-refresh.ts hands over here when api.football_data_source() is
// `sofascore` (writes through api.ingest_football_fixture, exactly as the
// SportsMonks path does) or `shadow` (computes the same writes and logs them as
// one JSON line, writes nothing at all). In both modes SportsMonks is never
// called from this path.
//
// Requests per tick (RapidAPI quota is the scarce resource):
//   live job    1  tournaments/get-live-events?sport=football
//               +1 tournaments/get-last-matches (page 0) only when a mapped
//                  fixture that production shows in play, or that kicked off
//                  within the last 3 hours without the feed saying so, is
//                  missing from the live list: the final whistle (the match
//                  leaves the live list) is caught there.
//   season job  2  get-next-matches + get-last-matches (page 0): kickoff moves,
//                  postponements and results catch-up.
//
// All provider reads happen before the first write, so a quota refusal
// (`provider_rate_limited`) or any provider failure returns an error with
// nothing written.
//
// NOT IN SCOPE here: match details (events, lineups, team statistics). The
// SportsMonks path fetches them after the scores (runMatchDetailsRefresh);
// this path does not, and the `match_details_backfill` job answers `skipped`.
// A later change ports them. Until then the match page shows no new details
// for matches read from SofaScore.
//
// Unmapped events are logged and never ingested: api.ingest_football_fixture
// creates a fixture when it finds no mapping. Events with a status the status
// mapping does not know are left out (see sofascore-fixtures.ts).
//
// Dependency-free apart from sibling shared modules, so it runs under Bun
// (tests) and Deno (the Edge Function).

import { RapidApiError, type RapidApiQuota } from "./rapidapi-client.ts";
import {
  BOTOLA_UNIQUE_TOURNAMENT_ID,
  SOFASCORE_LIVE_EVENTS_PATH,
  SOFASCORE_PROVIDER_NAME,
  buildFixtureIngestPlan,
  collapseReplacedEvents,
  parseSofascoreEvents,
  type SofascoreFixtureEvent,
  type SofascoreIngestCall,
  type SofascoreParsedEvents,
  type SofascoreShadowClient,
} from "./sofascore-fixtures.ts";
import {
  buildSofascoreMappingLookup,
  type FootballProviderMappingRow,
} from "./sofascore-mapping-lookup.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

export type SofascoreRefreshMode = "sofascore" | "shadow";
export type SofascoreRefreshJob = "fixtures" | "season_fixtures";

export const DEFAULT_SOFASCORE_SEASON_ID = "102220";
export const SOFASCORE_SEASON_REFRESH_DAYS_AHEAD = 42;
/** A not-yet-started fixture this recent is expected to be in play. */
const RECENT_KICKOFF_MS = 3 * 60 * 60 * 1000;
/** Statuses production keeps while a match is on (as the live refresh cadence). */
const IN_PLAY_STATUSES: ReadonlySet<string> = new Set([
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
  "suspended",
  "delayed",
]);
/** A status production does not leave without a correction (the freshness trigger). */
const FINAL_STATUSES: ReadonlySet<string> = new Set(["finished", "cancelled", "abandoned"]);

export interface SofascoreRefreshDependencies {
  readonly mode: SofascoreRefreshMode;
  readonly job: SofascoreRefreshJob;
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  readonly log?: (line: string) => void;
}

export interface SofascoreRefreshOutcome {
  readonly status: number;
  readonly body: Record<string, unknown>;
}

interface MappedFixtureState {
  readonly externalId: string;
  readonly kickoffAt: string;
  readonly status: string;
  readonly period: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number | string | null;
  readonly finalizedAt: string | null;
}

interface Snapshot {
  readonly mappings: readonly FootballProviderMappingRow[];
  readonly fixtures: readonly MappedFixtureState[];
}

type SkipReason =
  | "unchanged"
  | "stale"
  | "protected_final_state"
  | "no_fixture_state"
  | "unresolved_round";

export interface SofascoreRequestLog {
  readonly path: string;
  readonly quotaRemaining: number | null;
  readonly quotaLimit: number | null;
}

function isoDay(date: Date, offsetDays: number): string {
  return new Date(date.getTime() + offsetDays * 86_400_000).toISOString().slice(0, 10);
}

function envId(value: string | undefined, fallback: string): string {
  const candidate = value?.trim() || fallback;
  return /^[1-9][0-9]{0,9}$/.test(candidate) ? candidate : fallback;
}

function eventListPath(
  endpoint: "get-last-matches" | "get-next-matches",
  tournamentId: string,
  seasonId: string,
): string {
  return `tournaments/${endpoint}?tournamentId=${tournamentId}&seasonId=${seasonId}&pageIndex=0`;
}

function parseSnapshot(data: unknown): Snapshot | null {
  if (typeof data !== "object" || data === null) return null;
  const record = data as { mappings?: unknown; fixtures?: unknown };
  if (!Array.isArray(record.mappings) || !Array.isArray(record.fixtures)) return null;
  return {
    mappings: record.mappings as FootballProviderMappingRow[],
    fixtures: record.fixtures as MappedFixtureState[],
  };
}

/** Mapped fixtures production shows in play that the live list did not return. */
function needsFallback(
  fixtures: readonly MappedFixtureState[],
  liveEventIds: ReadonlySet<string>,
  now: Date,
): MappedFixtureState[] {
  return fixtures.filter((fixture) => {
    if (liveEventIds.has(fixture.externalId) || FINAL_STATUSES.has(fixture.status)) return false;
    if (IN_PLAY_STATUSES.has(fixture.status)) return true;
    if (fixture.status === "postponed") return false;
    const age = now.getTime() - Date.parse(fixture.kickoffAt);
    return Number.isFinite(age) && age >= 0 && age <= RECENT_KICKOFF_MS;
  });
}

/** Same event twice (live list and last matches): keep the more recent change. */
function dedupeEvents(
  lists: readonly (readonly SofascoreFixtureEvent[])[],
): SofascoreFixtureEvent[] {
  const byId = new Map<string, SofascoreFixtureEvent>();
  for (const list of lists) {
    for (const event of list) {
      const existing = byId.get(event.sofascoreEventId);
      if (!existing || (event.changeTimestamp ?? -1) > (existing.changeTimestamp ?? -1)) {
        byId.set(event.sofascoreEventId, event);
      }
    }
  }
  return [...byId.values()];
}

/** Why a call must not be sent, or null when it should be. */
export function skipReason(
  call: SofascoreIngestCall,
  fixture: MappedFixtureState | undefined,
): SkipReason | null {
  if (!fixture) return "no_fixture_state";
  const next = call.p_fixture;
  const dbUpdated = Date.parse(fixture.providerUpdatedAt);
  const nextUpdated = Date.parse(next.providerUpdatedAt);
  const dbSequence = Number(fixture.sourceSequence ?? 0);
  // The database trigger raises STALE_UPDATE for these and would fail the run.
  if (
    Number.isFinite(dbUpdated) &&
    (nextUpdated < dbUpdated || (nextUpdated === dbUpdated && next.sourceSequence < dbSequence))
  ) {
    return "stale";
  }
  // A finished, cancelled or abandoned fixture does not change status without a
  // correction: the trigger raises INVALID_FIXTURE_STATE.
  if (FINAL_STATUSES.has(fixture.status) && next.status !== fixture.status) {
    return "protected_final_state";
  }
  const sameKickoff = Date.parse(fixture.kickoffAt) === Date.parse(next.kickoffAt);
  const gainsFinalization = next.finalizedAt !== null && fixture.finalizedAt === null;
  if (
    sameKickoff &&
    fixture.status === next.status &&
    fixture.period === next.period &&
    fixture.homeScore === next.homeScore &&
    fixture.awayScore === next.awayScore &&
    !gainsFinalization
  ) {
    return "unchanged";
  }
  return null;
}

export async function runSofascoreRefresh(
  dependencies: SofascoreRefreshDependencies,
): Promise<SofascoreRefreshOutcome> {
  const { mode, job, client, rapid, environment, now } = dependencies;
  const log = dependencies.log ?? ((line: string) => console.log(line));
  const requests: SofascoreRequestLog[] = [];
  const emit = (fields: Record<string, unknown>) =>
    log(JSON.stringify({ event: "football_live_refresh_sofascore", mode, job, ...fields }));

  // 1. Mappings and current fixture state (one read, no provider call yet).
  let snapshot: Snapshot | null;
  try {
    const result = await client.schema("api").rpc("football_sofascore_live_snapshot", {});
    snapshot = result.error ? null : parseSnapshot(result.data);
  } catch {
    snapshot = null;
  }
  if (!snapshot) {
    emit({ result: "error", error: "database_unavailable", stage: "snapshot" });
    return { status: 502, body: { error: "database_unavailable", mode, job } };
  }
  const mapping = buildSofascoreMappingLookup(snapshot.mappings);
  const tournamentId = envId(
    environment.SOFASCORE_TOURNAMENT_ID,
    String(BOTOLA_UNIQUE_TOURNAMENT_ID),
  );
  const seasonId = envId(environment.SOFASCORE_SEASON_ID, DEFAULT_SOFASCORE_SEASON_ID);
  const parseOptions = { uniqueTournamentId: Number(tournamentId) };

  // 2. Provider reads. Any failure stops here, before anything is written.
  const fetchList = async (path: string): Promise<SofascoreParsedEvents> => {
    const result = await rapid.getJson(path);
    const quota: RapidApiQuota = result.quota;
    requests.push({ path, quotaRemaining: quota.remaining, quotaLimit: quota.limit });
    return parseSofascoreEvents(result.data, parseOptions);
  };
  const parsedLists: SofascoreParsedEvents[] = [];
  try {
    if (job === "fixtures") {
      const live = await fetchList(SOFASCORE_LIVE_EVENTS_PATH);
      parsedLists.push(live);
      const liveIds = new Set(live.events.map((event) => event.sofascoreEventId));
      const missing = needsFallback(snapshot.fixtures, liveIds, now);
      if (missing.length > 0) {
        parsedLists.push(
          await fetchList(eventListPath("get-last-matches", tournamentId, seasonId)),
        );
      }
    } else {
      parsedLists.push(await fetchList(eventListPath("get-next-matches", tournamentId, seasonId)));
      parsedLists.push(await fetchList(eventListPath("get-last-matches", tournamentId, seasonId)));
    }
  } catch (error) {
    const code = error instanceof RapidApiError ? error.code : "invalid_provider_payload";
    const status = code === "provider_rate_limited" ? 429 : 502;
    emit({ result: "error", error: code, requests, written: 0 });
    return { status, body: { error: code, mode, job, requests: requests.length, written: 0 } };
  }

  // 3. Plan: parse, collapse replacements, resolve ids, drop what cannot change.
  const events = dedupeEvents(parsedLists.map((list) => list.events));
  const collapsed = collapseReplacedEvents(events);
  const plan = buildFixtureIngestPlan(collapsed.events, mapping.lookup, now);
  const stateByExternalId = new Map(snapshot.fixtures.map((f) => [f.externalId, f]));
  const toWrite: SofascoreIngestCall[] = [];
  const skipped: Record<SkipReason, string[]> = {
    unchanged: [],
    stale: [],
    protected_final_state: [],
    no_fixture_state: [],
    unresolved_round: [],
  };
  for (const call of plan.calls) {
    // Ingestion replaces round_id: never detach a fixture from its gameweek
    // when the provider omitted the round. Leave it for a complete payload.
    const reason =
      call.p_fixture.roundId === null
        ? "unresolved_round"
        : skipReason(call, stateByExternalId.get(call.p_external_id));
    if (reason) skipped[reason].push(call.p_external_id);
    else toWrite.push(call);
  }
  const unknownStatus = parsedLists.flatMap((list) => list.unknownStatus);
  const summary = {
    requests,
    polledEvents: parsedLists.reduce((total, list) => total + list.polledCount, 0),
    botolaEvents: collapsed.events.length,
    supersededEventIds: collapsed.supersededIds,
    unmapped: plan.unmapped,
    unknownStatus,
    rejected: plan.rejected,
    mappingConflicts: mapping.conflicts,
    skipped: {
      unchanged: skipped.unchanged.length,
      stale: skipped.stale,
      protectedFinalState: skipped.protected_final_state,
      noFixtureState: skipped.no_fixture_state,
      unresolvedRound: skipped.unresolved_round,
    },
  };

  if (mode === "shadow") {
    emit({ result: "shadow", ...summary, wouldIngest: toWrite, written: 0 });
    return {
      status: 200,
      body: { status: "shadow", mode, job, wouldIngest: toWrite.length, written: 0 },
    };
  }

  // 4. Write, through the same RPC and with the same error classes as the
  // SportsMonks path. The run is recorded as a `fixtures` run (provider
  // sofascore) because app_private.ops_health_checks reads the freshness of
  // fixture refreshes from football_ingestion_runs, whichever provider wrote.
  const counts = { fetched: plan.calls.length + plan.unmapped.length, updated: 0, rejected: 0 };
  const rpc = (name: string, args: Record<string, unknown>) => client.schema("api").rpc(name, args);
  let runId: string | null = null;
  try {
    const begun = await rpc("begin_football_ingestion", {
      p_provider_name: SOFASCORE_PROVIDER_NAME,
      p_job_type: "fixtures",
      p_target_scope: {
        source: SOFASCORE_PROVIDER_NAME,
        job,
        from: isoDay(now, -1),
        to: isoDay(now, job === "season_fixtures" ? SOFASCORE_SEASON_REFRESH_DAYS_AHEAD : 1),
      },
      p_checkpoint: {},
    });
    if (begun.error || typeof begun.data !== "string") throw new Error("begin");
    runId = begun.data;
  } catch {
    emit({ result: "error", error: "database_unavailable", stage: "begin_run", ...summary });
    return { status: 502, body: { error: "database_unavailable", mode, job, written: 0 } };
  }

  const failures: { externalId: string; code: string }[] = [];
  for (const call of toWrite) {
    try {
      const result = await rpc("ingest_football_fixture", { ...call });
      if (result.error) {
        const code =
          result.error.code === "P0002" || result.error.message === "MAPPING_NOT_FOUND"
            ? "mapping_not_found"
            : "database_unavailable";
        failures.push({ externalId: call.p_external_id, code });
        counts.rejected += 1;
      } else if (typeof result.data !== "string" || !/^[0-9a-f-]{36}$/i.test(result.data)) {
        failures.push({ externalId: call.p_external_id, code: "database_unavailable" });
        counts.rejected += 1;
      } else {
        counts.updated += 1;
      }
    } catch {
      failures.push({ externalId: call.p_external_id, code: "database_unavailable" });
      counts.rejected += 1;
    }
  }

  const finalStatus =
    counts.rejected === 0 ? "succeeded" : counts.updated > 0 ? "partial" : "failed";
  const errorCode = counts.rejected === 0 ? null : "fixture_item_rejected";
  let completionFailed = false;
  try {
    const completion = await rpc("complete_football_ingestion", {
      p_run_id: runId,
      p_status: finalStatus,
      p_checkpoint: { source: SOFASCORE_PROVIDER_NAME, job },
      p_records_fetched: counts.fetched,
      p_records_validated: toWrite.length + skipped.unchanged.length,
      p_records_inserted: 0,
      p_records_updated: counts.updated,
      p_records_skipped: Math.max(0, counts.fetched - counts.updated - counts.rejected),
      p_records_rejected: counts.rejected,
      p_retry_count: 0,
      p_error_code: errorCode,
      p_error_summary: errorCode
        ? "A SofaScore fixture update was rejected by the database."
        : null,
    });
    if (completion.error) completionFailed = true;
  } catch {
    completionFailed = true;
  }
  if (completionFailed) {
    // The scores are written; a missing run summary is reported, not retried.
    failures.push({ externalId: "run", code: "complete_run_failed" });
  }

  emit({
    result: completionFailed
      ? counts.updated > 0
        ? "partial"
        : "error"
      : counts.rejected === 0
        ? "ok"
        : "partial",
    ...summary,
    written: counts.updated,
    failures,
  });
  if (completionFailed) {
    return {
      status: 502,
      body: { error: "complete_run_failed", mode, job, written: counts.updated, failures },
    };
  }
  if (counts.rejected > 0) {
    return {
      status: 502,
      body: { error: "fixture_item_rejected", mode, job, written: counts.updated, failures },
    };
  }
  return {
    status: 200,
    body: {
      provider: SOFASCORE_PROVIDER_NAME,
      mode,
      job,
      requests: requests.length,
      written: counts.updated,
      unchanged: skipped.unchanged.length,
      unmapped: plan.unmapped.length,
      unknownStatus: unknownStatus.length,
      // Match details are not read from SofaScore yet (see the header).
      matchDetails: { status: "skipped", reason: "not_implemented_for_sofascore" },
    },
  };
}
