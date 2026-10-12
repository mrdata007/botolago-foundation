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
// Match details (events, lineups, team statistics) come after the scores, from
// sofascore-match-details.ts: 3 requests per fixture, at most
// SOFASCORE_DETAILS_PER_TICK (default 4) fixtures per live tick, so at most 12
// more requests. Chosen fixtures: a mapped fixture written as finished this
// tick, then mapped fixtures in play whose score or status was written or whose
// changeTimestamp moved in the last 90 seconds (incidents only: 1 request, plus the
// lineups on the tick that sees the match start; statistics are read at full time), then fixtures finalized in the
// last two hours so post-match corrections are refreshed. The
// season job fetches none. `runSofascoreDetailsBackfill` serves the
// `match_details_backfill` job. Details never hold a score back: they run after
// the scores are written, and a failure is reported in `matchDetails`.
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
  computeLiveMinute,
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
import {
  SOFASCORE_DETAILS_BACKFILL_DEFAULT,
  SOFASCORE_DETAILS_BACKFILL_MAX,
  SOFASCORE_DETAILS_PER_TICK_DEFAULT,
  SOFASCORE_DETAILS_PER_TICK_MAX,
  runSofascoreMatchDetails,
  type SofascoreDetailsSummary,
  type SofascoreDetailsTarget,
} from "./sofascore-match-details.ts";
import { SofascoreFantasyRun, type SofascoreFantasySummary } from "./sofascore-fantasy-auto.ts";
import {
  finishedWrittenThisTick,
  isDailyStandingsHour,
  runStandingsRefresh,
  type StandingsSummary,
  type StandingsTrigger,
} from "./sofascore-standings.ts";
import type { FixtureRpcClient } from "./sportsmonks-fixtures.ts";

export type SofascoreRefreshMode = "sofascore" | "shadow";
export type SofascoreRefreshJob = "fixtures" | "season_fixtures";

export const DEFAULT_SOFASCORE_SEASON_ID = "102220";
/** Pages per direction the daily full-season pull may read (30 or so events each). */
export const SOFASCORE_SEASON_FULL_MAX_PAGES_DEFAULT = 12;
export const SOFASCORE_SEASON_FULL_MAX_PAGES_MAX = 20;
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
/** In play for the details step (a delayed or suspended match has nothing new). */
const DETAILS_LIVE_STATUSES: ReadonlySet<string> = new Set([
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
]);
/**
 * A provider change newer than this counts as "moved since the last tick". The
 * live tick runs every 60 s, so 90 s covers one late tick and no more: a change
 * is fetched once or twice, not for as long as 150 s.
 */
const DETAILS_CHANGE_WINDOW_MS = 90_000;
/** Keep refreshing details while post-match incidents and statistics settle. */
const DETAILS_FINAL_WINDOW_MS = 2 * 60 * 60 * 1000;

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
  /** The app fixture id (the snapshot always sends it). */
  readonly id?: string;
  readonly externalId: string;
  readonly kickoffAt: string;
  readonly status: string;
  readonly period: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number | string | null;
  readonly finalizedAt: string | null;
  /** Internal club ids; absent until migration 20261011110000 is applied. */
  readonly homeTeamId?: string;
  readonly awayTeamId?: string;
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
  page = 0,
): string {
  return `tournaments/${endpoint}?tournamentId=${tournamentId}&seasonId=${seasonId}&pageIndex=${page}`;
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

/** 0 is allowed: it switches the details step off without a deploy. */
function boundedInt(value: string | undefined, fallback: number, max: number): number {
  const raw = value?.trim();
  if (!raw) return fallback;
  const parsed = Number(raw);
  return Number.isInteger(parsed) && parsed >= 0 && parsed <= max ? parsed : fallback;
}

/** Internal team id -> SofaScore team id; an id with two SofaScore ids is left out. */
function teamExternalIds(mappings: readonly FootballProviderMappingRow[]): Map<string, string> {
  const found = new Map<string, string | null>();
  for (const row of mappings) {
    if (
      row.provider_name !== SOFASCORE_PROVIDER_NAME ||
      row.entity_type !== "team" ||
      row.active !== true
    ) {
      continue;
    }
    const existing = found.get(row.internal_entity_id);
    found.set(
      row.internal_entity_id,
      existing === undefined || existing === row.external_id ? row.external_id : null,
    );
  }
  const out = new Map<string, string>();
  for (const [internal, external] of found) if (external) out.set(internal, external);
  return out;
}

/**
 * The fixture's clubs as SofaScore ids: from the database's home/away when the
 * snapshot has them (that is the side the page shows), else from the event.
 */
function detailsTeams(
  fixture: MappedFixtureState | undefined,
  teamIds: ReadonlyMap<string, string>,
  event: SofascoreFixtureEvent | undefined,
): SofascoreDetailsTarget["teams"] | null {
  const home = fixture?.homeTeamId ? teamIds.get(fixture.homeTeamId) : undefined;
  const away = fixture?.awayTeamId ? teamIds.get(fixture.awayTeamId) : undefined;
  if (home && away && home !== away) return { home, away };
  if (event && event.homeTeamId !== event.awayTeamId) {
    return { home: event.homeTeamId, away: event.awayTeamId };
  }
  return null;
}

/**
 * Fixtures whose details are worth fetching this tick, in priority order:
 * written as finished first, then in play and changed (written, or the
 * provider's changeTimestamp moved within the last 90 s; incidents only), newest change first,
 * then fixtures finalized within two hours, even if absent from the live feed.
 */
export function selectLiveDetailTargets(
  events: readonly SofascoreFixtureEvent[],
  toWrite: readonly SofascoreIngestCall[],
  snapshot: Snapshot,
  now: Date,
  limit: number,
): SofascoreDetailsTarget[] {
  const written = new Set(toWrite.map((call) => call.p_external_id));
  const stateById = new Map(snapshot.fixtures.map((f) => [f.externalId, f]));
  const teamIds = teamExternalIds(snapshot.mappings);
  const ranked: { target: SofascoreDetailsTarget; rank: number; changed: number }[] = [];
  for (const event of events) {
    const state = stateById.get(event.sofascoreEventId);
    if (!state) continue; // not mapped to a fixture: the RPC would refuse it
    const changed = event.changeTimestamp === null ? -1 : event.changeTimestamp * 1000;
    const isWritten = written.has(event.sofascoreEventId);
    const moved = changed >= 0 && now.getTime() - changed <= DETAILS_CHANGE_WINDOW_MS;
    let rank: number | null = null;
    if (event.status === "finished" && isWritten) rank = 0;
    else if (DETAILS_LIVE_STATUSES.has(event.status) && (isWritten || moved)) rank = 1;
    if (rank === null) continue;
    const teams = detailsTeams(state, teamIds, event);
    if (!teams) continue;
    // A finished match reads all three replies and feeds the Fantasy step with
    // them. A match in play reads the incidents only (1 request): goals, cards and
    // substitutions; statistics wait for full time. The one exception is the tick
    // that sees the match start (stored status not yet in play): it also reads the
    // lineups (2 requests), once, so unknown players reach the staff's matching
    // list before full time, as they did when every tick read all three.
    const fantasyFixtureId = event.status === "finished" ? state.id : undefined;
    const starting = rank === 1 && !DETAILS_LIVE_STATUSES.has(state.status);
    const liveFixtureId = starting ? state.id : undefined;
    ranked.push({
      target: {
        eventId: event.sofascoreEventId,
        teams,
        ...(fantasyFixtureId ? { fantasyFixtureId } : {}),
        ...(liveFixtureId ? { liveFixtureId } : {}),
        ...(rank === 1 ? { incidentsOnly: true } : {}),
        ...(starting ? { withLineups: true } : {}),
      },
      rank,
      changed,
    });
  }
  // Finished matches leave the live list and need no score write on later
  // ticks. Use the snapshot to refresh their details for two hours after
  // finalization, including when the provider no longer lists them as live.
  const selected = new Set(ranked.map((item) => item.target.eventId));
  for (const fixture of snapshot.fixtures) {
    if (fixture.status !== "finished" || !fixture.finalizedAt || selected.has(fixture.externalId)) {
      continue;
    }
    const finalized = Date.parse(fixture.finalizedAt);
    const age = now.getTime() - finalized;
    if (!Number.isFinite(age) || age < 0 || age > DETAILS_FINAL_WINDOW_MS) continue;
    const teams = detailsTeams(fixture, teamIds, undefined);
    if (teams)
      ranked.push({
        target: {
          eventId: fixture.externalId,
          teams,
          ...(fixture.id ? { fantasyFixtureId: fixture.id } : {}),
        },
        rank: 2,
        changed: finalized,
      });
  }
  ranked.sort((a, b) => a.rank - b.rank || b.changed - a.changed);
  return ranked.slice(0, limit).map((item) => item.target);
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
  // A running clock is a change in itself: the minute moves while nothing else does.
  // (The snapshot does not carry the stored minute, so a computed one is always written.)
  const minuteMoves =
    next.minute !== null && (fixture as { minute?: number | null }).minute !== next.minute;
  const sameKickoff = Date.parse(fixture.kickoffAt) === Date.parse(next.kickoffAt);
  const gainsFinalization = next.finalizedAt !== null && fixture.finalizedAt === null;
  if (
    sameKickoff &&
    fixture.status === next.status &&
    fixture.period === next.period &&
    fixture.homeScore === next.homeScore &&
    fixture.awayScore === next.awayScore &&
    !minuteMoves &&
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
  const dailyPass = job === "season_fixtures" && isDailyStandingsHour(now, environment);
  /** `hasNextPage` of the last page read per endpoint (the daily full pull). */
  const seasonHasNextPage = new Map<string, boolean>();
  const fetchList = async (path: string): Promise<SofascoreParsedEvents> => {
    const result = await rapid.getJson(path);
    const quota: RapidApiQuota = result.quota;
    requests.push({ path, quotaRemaining: quota.remaining, quotaLimit: quota.limit });
    const endpoint = /^tournaments\/(get-next-matches|get-last-matches)\?/.exec(path)?.[1];
    if (endpoint) {
      const next = (result.data as { hasNextPage?: unknown } | null)?.hasNextPage;
      seasonHasNextPage.set(endpoint, next === true);
    }
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
      if (dailyPass) {
        // Once a day (the hour SOFASCORE_DAILY_HOUR_UTC, default 03 UTC) the
        // whole season schedule: the hourly pass above reads page 0 of each
        // direction only (about 30 events each way), so a kickoff moved or a
        // postponement far from today is caught here. Pages 1.. until the
        // provider says there is no next page, bounded.
        const maxPages = boundedInt(
          environment.SOFASCORE_SEASON_FULL_MAX_PAGES,
          SOFASCORE_SEASON_FULL_MAX_PAGES_DEFAULT,
          SOFASCORE_SEASON_FULL_MAX_PAGES_MAX,
        );
        for (const endpoint of ["get-next-matches", "get-last-matches"] as const) {
          let more = seasonHasNextPage.get(endpoint) === true;
          for (let page = 1; more && page < maxPages; page += 1) {
            parsedLists.push(
              await fetchList(eventListPath(endpoint, tournamentId, seasonId, page)),
            );
            more = seasonHasNextPage.get(endpoint) === true;
          }
        }
      }
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
  // One entry per fixture in a running period, per tick, no payload: does the feed
  // send time.currentPeriodStartTimestamp, and so is a minute written? Reported in
  // the tick's summary line (`periodStart`), and only when something is in play.
  const periodStart = collapsed.events
    .filter((event) => ["first_half", "second_half", "extra_time"].includes(event.period))
    .map((event) => ({
      eventId: event.sofascoreEventId,
      period: event.period,
      present: event.periodStartTimestamp !== null,
      minute: computeLiveMinute(event, now.getTime()),
    }));
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
    ...(periodStart.length > 0 ? { periodStart } : {}),
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

  // Details (events, lineups, statistics) for the fixtures that just changed:
  // after the scores, capped, and never a reason to fail the scores.
  const liveSnapshot = snapshot;
  // Fantasy observations from the same replies, after the scores and the
  // details. It never throws and never changes what was written above.
  const fantasy = new SofascoreFantasyRun({
    mode,
    client,
    rapid,
    environment,
    now,
    log: (line) => log(line),
  });
  const runFantasy = async (): Promise<SofascoreFantasySummary> => {
    try {
      await fantasy.sweep();
    } catch {
      // Reported through the summary; nothing else depends on it.
    }
    return fantasy.summary();
  };
  const runDetails = async (): Promise<SofascoreDetailsSummary | { status: "skipped" }> => {
    if (job !== "fixtures") return { status: "skipped" };
    const cap = boundedInt(
      environment.SOFASCORE_DETAILS_PER_TICK,
      SOFASCORE_DETAILS_PER_TICK_DEFAULT,
      SOFASCORE_DETAILS_PER_TICK_MAX,
    );
    const targets = selectLiveDetailTargets(collapsed.events, toWrite, liveSnapshot, now, cap);
    return runSofascoreMatchDetails(targets, {
      mode,
      scope: "live",
      client,
      rapid,
      now,
      log: emit,
      onReplies: (target, replies) =>
        target.fantasyFixtureId
          ? fantasy.fromReplies(target.fantasyFixtureId, target.eventId, replies)
          : Promise.resolve(),
      onLiveReplies: (target, replies) =>
        target.liveFixtureId
          ? fantasy.fromLiveReplies(target.liveFixtureId, target.eventId, replies)
          : Promise.resolve(),
    });
  };

  // The Botola table: one request after a tick that wrote a match as finished
  // (however many finished together), and once a day in the season job.
  const runStandings = async (): Promise<StandingsSummary | { status: "skipped" }> => {
    const trigger: StandingsTrigger | null =
      job === "fixtures"
        ? finishedWrittenThisTick(toWrite)
          ? "after_match"
          : null
        : dailyPass
          ? "daily"
          : null;
    if (
      trigger === null ||
      environment.SOFASCORE_STANDINGS_ENABLED?.trim().toLowerCase() === "false"
    ) {
      return { status: "skipped" };
    }
    return runStandingsRefresh({
      mode,
      trigger,
      client,
      rapid,
      tournamentId,
      seasonId,
      now,
      log: emit,
    });
  };

  if (mode === "shadow") {
    emit({ result: "shadow", ...summary, wouldIngest: toWrite, written: 0 });
    const standings = await runStandings();
    const matchDetails = await runDetails();
    const fantasySummary = await runFantasy();
    return {
      status: 200,
      body: {
        status: "shadow",
        mode,
        job,
        wouldIngest: toWrite.length,
        written: 0,
        standings,
        matchDetails,
        fantasy: fantasySummary,
      },
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

  const standings = await runStandings();
  const matchDetails = await runDetails();
  const fantasySummary = await runFantasy();
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
    standings,
    matchDetails,
    fantasy: fantasySummary,
  });
  if (completionFailed) {
    return {
      status: 502,
      body: {
        error: "complete_run_failed",
        mode,
        job,
        written: counts.updated,
        failures,
        matchDetails,
        fantasy: fantasySummary,
      },
    };
  }
  if (counts.rejected > 0) {
    return {
      status: 502,
      body: {
        error: "fixture_item_rejected",
        mode,
        job,
        written: counts.updated,
        failures,
        matchDetails,
        fantasy: fantasySummary,
      },
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
      standings,
      matchDetails,
      fantasy: fantasySummary,
    },
  };
}

export interface SofascoreBackfillDependencies {
  readonly mode: SofascoreRefreshMode;
  readonly client: FixtureRpcClient;
  readonly rapid: SofascoreShadowClient;
  readonly environment: Readonly<Record<string, string | undefined>>;
  readonly now: Date;
  readonly log?: (line: string) => void;
}

/**
 * The `match_details_backfill` job for SofaScore: finished fixtures of the
 * current season, mapped to SofaScore, with no details stored (the same
 * selection the SportsMonks backfill uses: api.service_football_match_details_due
 * with scope `backfill`, which skips a fixture whose details are marked done
 * and one refused twice). At most SOFASCORE_DETAILS_BACKFILL_LIMIT (default 4,
 * max 10) fixtures per run, 3 requests each. Shadow reads and logs, writes
 * nothing.
 */
export async function runSofascoreDetailsBackfill(
  dependencies: SofascoreBackfillDependencies,
): Promise<SofascoreRefreshOutcome> {
  const { mode, client, rapid, environment, now } = dependencies;
  const job = "match_details_backfill";
  const log = dependencies.log ?? ((line: string) => console.log(line));
  const emit = (fields: Record<string, unknown>) =>
    log(JSON.stringify({ event: "football_live_refresh_sofascore", mode, job, ...fields }));
  const seasonId = envId(environment.SOFASCORE_SEASON_ID, DEFAULT_SOFASCORE_SEASON_ID);
  const cap = boundedInt(
    environment.SOFASCORE_DETAILS_BACKFILL_LIMIT,
    SOFASCORE_DETAILS_BACKFILL_DEFAULT,
    SOFASCORE_DETAILS_BACKFILL_MAX,
  );

  if (cap === 0) {
    // Switched off (SOFASCORE_DETAILS_BACKFILL_LIMIT=0): nothing is read.
    emit({ result: "skipped", reason: "disabled" });
    return { status: 200, body: { status: "skipped", reason: "disabled", mode, job } };
  }

  let snapshot: Snapshot | null;
  let due: string[] | null = null;
  try {
    const result = await client.schema("api").rpc("football_sofascore_live_snapshot", {});
    snapshot = result.error ? null : parseSnapshot(result.data);
    if (snapshot) {
      const listed = await client.schema("api").rpc("service_football_match_details_due", {
        p_provider_name: SOFASCORE_PROVIDER_NAME,
        p_season_external_id: seasonId,
        p_scope: "backfill",
        p_limit: cap,
      });
      if (!listed.error && Array.isArray(listed.data) && listed.data.length <= cap) {
        const ids = listed.data.map((item: unknown) =>
          typeof item === "object" && item !== null
            ? (item as { externalId?: unknown }).externalId
            : null,
        );
        if (
          ids.every((id): id is string => typeof id === "string" && /^[1-9][0-9]{0,11}$/.test(id))
        ) {
          due = ids;
        }
      }
    }
  } catch {
    snapshot = null;
  }
  if (!snapshot || due === null) {
    emit({ result: "error", error: "database_unavailable", stage: "due" });
    return { status: 502, body: { error: "database_unavailable", mode, job } };
  }

  const stateById = new Map(snapshot.fixtures.map((f) => [f.externalId, f]));
  const teamIds = teamExternalIds(snapshot.mappings);
  const targets: SofascoreDetailsTarget[] = [];
  const unresolved: string[] = [];
  for (const eventId of due) {
    const state = stateById.get(eventId);
    const teams = detailsTeams(state, teamIds, undefined);
    if (teams) {
      // A finished fixture also feeds the Fantasy step with the same replies.
      const fantasyFixtureId = state?.status === "finished" ? state.id : undefined;
      targets.push({ eventId, teams, ...(fantasyFixtureId ? { fantasyFixtureId } : {}) });
    } else unresolved.push(eventId);
  }
  const fantasy = new SofascoreFantasyRun({
    mode,
    client,
    rapid,
    environment,
    now,
    log: (line) => log(line),
  });
  const matchDetails = await runSofascoreMatchDetails(targets, {
    mode,
    scope: "backfill",
    client,
    rapid,
    now,
    log: emit,
    unresolvedTargets: unresolved,
    onReplies: (target, replies) =>
      target.fantasyFixtureId
        ? fantasy.fromReplies(target.fantasyFixtureId, target.eventId, replies)
        : Promise.resolve(),
  });
  try {
    await fantasy.sweep();
  } catch {
    // Reported through the summary.
  }
  const fantasySummary = fantasy.summary();
  emit({
    result: matchDetails.errors.length > 0 ? "partial" : "ok",
    unresolvedTeams: unresolved,
    matchDetails,
    fantasy: fantasySummary,
  });
  const failed = matchDetails.rateLimited
    ? 429
    : matchDetails.rejected > 0 && matchDetails.stored + matchDetails.wouldStore === 0
      ? 502
      : 200;
  return {
    status: failed,
    body: {
      provider: SOFASCORE_PROVIDER_NAME,
      mode,
      job,
      due: due.length,
      unresolvedTeams: unresolved.length,
      matchDetails,
      fantasy: fantasySummary,
    },
  };
}
