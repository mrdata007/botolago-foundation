// SofaScore fixtures for the Edge runtime, SHADOW MODE: parse the live list and
// season lists, and build the exact `api.ingest_football_fixture` calls the
// SportsMonks path would make. Nothing here writes anywhere; the runner only
// reads through the RapidAPI client and reports what it would ingest.
//
// DUPLICATION NOTE: Edge code cannot import from src/, so the status mapping,
// the event parsing and the replacement-collapse rule below are a port of
// src/backend/football/provider/sofascore-schedule.ts (mapSofascoreStatus,
// parseSofascoreEventList, collapseReplacedEvents). Keep the two in step: a
// status the src/ mapping does not know must stay unknown here too, and an
// unknown status is LEFT OUT, never guessed (a guess could reopen a live or
// abandoned match).
//
// Payload shape and freshness follow supabase/functions/_shared/
// sportsmonks-fixtures.ts (persistFixture / normalizeFixture):
//   providerUpdatedAt = the provider's change time (SofaScore
//   `changes.changeTimestamp`, seconds), else the time we observed the page;
//   sourceSequence = that instant in epoch milliseconds, as SportsMonks uses
//   Date.parse(updatedAt), so the two providers' sequences stay comparable.
//
// Dependency-free so it runs under Bun (tests) and Deno (Edge).

import type { RapidApiQuota, RapidApiResult } from "./rapidapi-client.ts";

export const SOFASCORE_PROVIDER_NAME = "sofascore";
/** Botola Pro's SofaScore unique tournament id. */
export const BOTOLA_UNIQUE_TOURNAMENT_ID = 937;
export const SOFASCORE_LIVE_EVENTS_PATH = "tournaments/get-live-events?sport=football";

export type SofascoreFixtureStatus =
  | "scheduled"
  | "not_started"
  | "live_first_half"
  | "half_time"
  | "live_second_half"
  | "extra_time"
  | "penalties"
  | "finished"
  | "postponed"
  | "cancelled"
  | "suspended";
export type SofascoreFixturePeriod =
  | "pre_match"
  | "first_half"
  | "half_time"
  | "second_half"
  | "extra_time"
  | "penalties"
  | "post_match";

export interface SofascoreStatusMapping {
  readonly status: SofascoreFixtureStatus;
  readonly period: SofascoreFixturePeriod;
  readonly unknown: boolean;
}

/** Port of mapSofascoreStatus. For "inprogress" the code picks the phase. */
export function mapSofascoreStatus(type: string, code: number): SofascoreStatusMapping {
  const known = (
    status: SofascoreFixtureStatus,
    period: SofascoreFixturePeriod,
  ): SofascoreStatusMapping => ({ status, period, unknown: false });
  switch (type) {
    case "notstarted":
      return known("not_started", "pre_match");
    case "finished":
      return known("finished", "post_match");
    case "postponed":
      return known("postponed", "pre_match");
    case "canceled":
      return known("cancelled", "pre_match");
    case "inprogress":
      if (code === 6) return known("live_first_half", "first_half");
      if (code === 7) return known("live_second_half", "second_half");
      if (code === 31) return known("half_time", "half_time");
      if (code === 41 || code === 42) return known("extra_time", "extra_time");
      if (code === 50) return known("penalties", "penalties");
      break;
    case "interrupted":
      return known("suspended", "pre_match");
    default:
      break;
  }
  return { status: "scheduled", period: "pre_match", unknown: true };
}

/**
 * Status codes of a match played to its end: 100 ended, 110 after extra time,
 * 120 after penalties (the equivalents of SportsMonks FT / AET / FT_PEN, the
 * only states that set `finalizedAt`). Any other finished code (retired,
 * walkover, awarded) is ingested as finished but never finalized: whether it
 * counts for Fantasy is an operator decision. ASSUMPTION: 100/110/120 are
 * SofaScore's public codes; the 2026-10-10 probe only recorded the type
 * "finished". Confirm against a real finished payload before the switch.
 */
const FINALIZING_CODES: ReadonlySet<number> = new Set([100, 110, 120]);

// ---------------------------------------------------------------------------
// Parsing

export interface SofascoreFixtureEvent {
  readonly sofascoreEventId: string;
  /** ISO 8601 UTC. */
  readonly startsAt: string;
  readonly round: number | null;
  readonly status: SofascoreFixtureStatus;
  readonly period: SofascoreFixturePeriod;
  readonly rawStatusType: string;
  readonly rawStatusCode: number;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** Seconds, as sent; null when absent. */
  readonly changeTimestamp: number | null;
  readonly uniqueTournamentId: string;
  readonly seasonId: string;
}

export interface SofascoreUnknownStatusEvent {
  readonly sofascoreEventId: string;
  readonly rawStatusType: string;
  readonly rawStatusCode: number;
}

export interface SofascoreParsedEvents {
  /** Length of the provider's `events` array. */
  readonly polledCount: number;
  /** Events of the wanted tournament that parsed and have a known status. */
  readonly events: readonly SofascoreFixtureEvent[];
  readonly foreignTournamentCount: number;
  readonly malformedCount: number;
  readonly unknownStatus: readonly SofascoreUnknownStatusEvent[];
}

type JsonRecord = Record<string, unknown>;

export class SofascoreFixturePayloadError extends Error {
  constructor() {
    super("invalid_provider_payload");
    this.name = "SofascoreFixturePayloadError";
  }
}

function isRecord(value: unknown): value is JsonRecord {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function positiveInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : null;
}

function nonNegativeInt(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 ? value : null;
}

function teamId(value: unknown): string | null {
  if (!isRecord(value)) return null;
  const id = positiveInt(value.id);
  return id === null ? null : String(id);
}

/** Absent score is null; a present but invalid one is malformed (undefined). */
function currentScore(value: unknown): number | null | undefined {
  if (value === undefined || value === null) return null;
  if (!isRecord(value)) return undefined;
  if (value.current === undefined || value.current === null) return null;
  return nonNegativeInt(value.current) ?? undefined;
}

export interface SofascoreParseOptions {
  /** Events of any other unique tournament are dropped and counted. Default 937. */
  readonly uniqueTournamentId?: number;
}

/**
 * `tournaments/get-live-events`, `get-last-matches` and `get-next-matches`
 * share one event shape. A wrong top-level shape throws; a single bad event is
 * dropped and counted. The tournament is checked first, so a foreign match
 * with an odd shape is only counted as foreign.
 */
export function parseSofascoreEvents(
  payload: unknown,
  options: SofascoreParseOptions = {},
): SofascoreParsedEvents {
  if (!isRecord(payload) || !Array.isArray(payload.events)) {
    throw new SofascoreFixturePayloadError();
  }
  const wanted = options.uniqueTournamentId ?? BOTOLA_UNIQUE_TOURNAMENT_ID;
  const events: SofascoreFixtureEvent[] = [];
  const unknownStatus: SofascoreUnknownStatusEvent[] = [];
  let foreignTournamentCount = 0;
  let malformedCount = 0;
  for (const candidate of payload.events) {
    if (!isRecord(candidate)) {
      malformedCount += 1;
      continue;
    }
    const tournament = isRecord(candidate.tournament) ? candidate.tournament : null;
    const unique =
      tournament && isRecord(tournament.uniqueTournament) ? tournament.uniqueTournament : null;
    const uniqueId = unique ? positiveInt(unique.id) : null;
    if (uniqueId === null) {
      malformedCount += 1;
      continue;
    }
    if (uniqueId !== wanted) {
      foreignTournamentCount += 1;
      continue;
    }
    const id = positiveInt(candidate.id);
    const start = nonNegativeInt(candidate.startTimestamp);
    const status = isRecord(candidate.status) ? candidate.status : null;
    const statusType = status && typeof status.type === "string" ? status.type : null;
    const statusCode = status && typeof status.code === "number" ? status.code : null;
    const season = isRecord(candidate.season) ? positiveInt(candidate.season.id) : null;
    const home = teamId(candidate.homeTeam);
    const away = teamId(candidate.awayTeam);
    const homeScore = currentScore(candidate.homeScore);
    const awayScore = currentScore(candidate.awayScore);
    if (
      id === null ||
      start === null ||
      statusType === null ||
      statusCode === null ||
      !Number.isInteger(statusCode) ||
      season === null ||
      home === null ||
      away === null ||
      homeScore === undefined ||
      awayScore === undefined ||
      (homeScore === null) !== (awayScore === null)
    ) {
      malformedCount += 1;
      continue;
    }
    const mapped = mapSofascoreStatus(statusType, statusCode);
    if (mapped.unknown) {
      unknownStatus.push({
        sofascoreEventId: String(id),
        rawStatusType: statusType,
        rawStatusCode: statusCode,
      });
      continue;
    }
    const round = isRecord(candidate.roundInfo) ? positiveInt(candidate.roundInfo.round) : null;
    const changes = isRecord(candidate.changes)
      ? nonNegativeInt(candidate.changes.changeTimestamp)
      : null;
    events.push({
      sofascoreEventId: String(id),
      startsAt: new Date(start * 1000).toISOString(),
      round,
      status: mapped.status,
      period: mapped.period,
      rawStatusType: statusType,
      rawStatusCode: statusCode,
      homeTeamId: home,
      awayTeamId: away,
      homeScore,
      awayScore,
      changeTimestamp: changes,
      uniqueTournamentId: String(uniqueId),
      seasonId: String(season),
    });
  }
  return {
    polledCount: payload.events.length,
    events,
    foreignTournamentCount,
    malformedCount,
    unknownStatus,
  };
}

export interface CollapsedFixtureEvents {
  readonly events: readonly SofascoreFixtureEvent[];
  readonly supersededIds: readonly string[];
}

/**
 * Port of collapseReplacedEvents. A replayed postponed match gets a NEW event
 * id and the old one stays "postponed" in the same round. Per (season, round,
 * home, away): when a non-postponed event exists every postponed one is
 * superseded; otherwise only the latest postponed one is kept. Events with no
 * round are never collapsed. Input order is preserved.
 */
export function collapseReplacedEvents(
  events: readonly SofascoreFixtureEvent[],
): CollapsedFixtureEvents {
  const groups = new Map<string, SofascoreFixtureEvent[]>();
  for (const event of events) {
    if (event.round === null) continue;
    const key = [event.seasonId, event.round, event.homeTeamId, event.awayTeamId].join("|");
    const group = groups.get(key);
    if (group) group.push(event);
    else groups.set(key, [event]);
  }
  const superseded = new Set<string>();
  for (const group of groups.values()) {
    const postponed = group.filter((event) => event.status === "postponed");
    if (postponed.length === 0) continue;
    if (postponed.length < group.length) {
      for (const event of postponed) superseded.add(event.sofascoreEventId);
      continue;
    }
    const latest = postponed.reduce((best, event) => {
      const later =
        event.startsAt > best.startsAt ||
        (event.startsAt === best.startsAt &&
          BigInt(event.sofascoreEventId) > BigInt(best.sofascoreEventId));
      return later ? event : best;
    });
    for (const event of postponed) {
      if (event !== latest) superseded.add(event.sofascoreEventId);
    }
  }
  return {
    events: events.filter((event) => !superseded.has(event.sofascoreEventId)),
    supersededIds: events
      .filter((event) => superseded.has(event.sofascoreEventId))
      .map((event) => event.sofascoreEventId),
  };
}

// ---------------------------------------------------------------------------
// Ingest payloads

export type SofascoreEntityType = "competition" | "season" | "round" | "team" | "fixture";

/**
 * Resolves a SofaScore id to the internal UUID, or null when there is no
 * active mapping. Backed by a map preloaded from
 * app_private.football_provider_mappings (provider_name = 'sofascore'); the
 * shadow runner never queries the database itself.
 */
export interface SofascoreMappingLookup {
  resolve(entityType: SofascoreEntityType, externalId: string): string | null;
}

/**
 * SofaScore has no round id, only a round number. The external id the lookup
 * is asked for is `<seasonId>:<round>`. ASSUMPTION for the ID bridge (P3) to
 * confirm: round mappings are registered under this key.
 */
export function sofascoreRoundExternalId(seasonId: string, round: number): string {
  return `${seasonId}:${round}`;
}

/** Build a lookup from (type, external id, internal id) rows. */
export function createMapLookup(
  entries: Iterable<readonly [SofascoreEntityType, string, string]>,
): SofascoreMappingLookup {
  const map = new Map<string, string>();
  for (const [type, externalId, id] of entries) map.set(`${type}:${externalId}`, id);
  return { resolve: (type, externalId) => map.get(`${type}:${externalId}`) ?? null };
}

export interface SofascoreFixtureBody {
  readonly competitionId: string;
  readonly seasonId: string;
  readonly roundId: string | null;
  readonly homeTeamId: string;
  readonly awayTeamId: string;
  readonly venueId: null;
  readonly kickoffAt: string;
  readonly status: SofascoreFixtureStatus;
  readonly period: SofascoreFixturePeriod;
  readonly minute: null;
  readonly addedTime: null;
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  readonly providerUpdatedAt: string;
  readonly sourceSequence: number;
  readonly sourceVersion: string;
  readonly finalizedAt: string | null;
}

/** The arguments of one `api.ingest_football_fixture` call. */
export interface SofascoreIngestCall {
  readonly p_provider_name: "sofascore";
  readonly p_external_id: string;
  readonly p_fixture: SofascoreFixtureBody;
}

export type SofascoreMissingMapping =
  | "fixture"
  | "competition"
  | "season"
  | "round"
  | "home_team"
  | "away_team";

export interface SofascoreUnmappedEvent {
  readonly sofascoreEventId: string;
  readonly missing: readonly SofascoreMissingMapping[];
}

export interface SofascoreRejectedEvent {
  readonly sofascoreEventId: string;
  readonly reason: "finished_without_score";
}

export interface SofascoreFixturePlan {
  readonly calls: readonly SofascoreIngestCall[];
  readonly unmapped: readonly SofascoreUnmappedEvent[];
  readonly rejected: readonly SofascoreRejectedEvent[];
}

/**
 * One ingest call per event whose fixture, competition (the unique
 * tournament), season, round (when the event has one) and both teams all
 * resolve. Anything else is reported as unmapped and never ingested; in
 * particular a missing fixture mapping is not a licence to create the fixture,
 * which `api.ingest_football_fixture` would do. A finished match with no score
 * is rejected, as the SportsMonks path rejects it.
 */
export function buildFixtureIngestPlan(
  events: readonly SofascoreFixtureEvent[],
  lookup: SofascoreMappingLookup,
  observedAt: Date,
): SofascoreFixturePlan {
  const calls: SofascoreIngestCall[] = [];
  const unmapped: SofascoreUnmappedEvent[] = [];
  const rejected: SofascoreRejectedEvent[] = [];
  for (const event of events) {
    const fixtureId = lookup.resolve("fixture", event.sofascoreEventId);
    const competitionId = lookup.resolve("competition", event.uniqueTournamentId);
    const seasonId = lookup.resolve("season", event.seasonId);
    const roundId =
      event.round === null
        ? null
        : lookup.resolve("round", sofascoreRoundExternalId(event.seasonId, event.round));
    const homeTeamId = lookup.resolve("team", event.homeTeamId);
    const awayTeamId = lookup.resolve("team", event.awayTeamId);
    const missing: SofascoreMissingMapping[] = [];
    if (fixtureId === null) missing.push("fixture");
    if (competitionId === null) missing.push("competition");
    if (seasonId === null) missing.push("season");
    if (event.round !== null && roundId === null) missing.push("round");
    if (homeTeamId === null) missing.push("home_team");
    if (awayTeamId === null) missing.push("away_team");
    if (
      missing.length > 0 ||
      competitionId === null ||
      seasonId === null ||
      homeTeamId === null ||
      awayTeamId === null
    ) {
      unmapped.push({ sofascoreEventId: event.sofascoreEventId, missing });
      continue;
    }
    if (event.status === "finished" && (event.homeScore === null || event.awayScore === null)) {
      rejected.push({
        sofascoreEventId: event.sofascoreEventId,
        reason: "finished_without_score",
      });
      continue;
    }
    const observedMs = observedAt.getTime();
    const updatedMs = event.changeTimestamp !== null ? event.changeTimestamp * 1000 : observedMs;
    // Never earlier than kickoff, as on the SportsMonks path: a feed that
    // reports a final state before its own kickoff finalizes nothing.
    const finalizedAt =
      event.status === "finished" &&
      FINALIZING_CODES.has(event.rawStatusCode) &&
      observedMs >= Date.parse(event.startsAt)
        ? observedAt.toISOString()
        : null;
    calls.push({
      p_provider_name: SOFASCORE_PROVIDER_NAME,
      p_external_id: event.sofascoreEventId,
      p_fixture: {
        competitionId,
        seasonId,
        roundId,
        homeTeamId,
        awayTeamId,
        venueId: null,
        kickoffAt: event.startsAt,
        status: event.status,
        period: event.period,
        minute: null,
        addedTime: null,
        homeScore: event.homeScore,
        awayScore: event.awayScore,
        providerUpdatedAt: new Date(updatedMs).toISOString(),
        sourceSequence: Math.max(0, updatedMs),
        sourceVersion: `sofascore:${event.sofascoreEventId}:${updatedMs}`,
        finalizedAt,
      },
    });
  }
  return { calls, unmapped, rejected };
}

// ---------------------------------------------------------------------------
// Shadow runner

export interface SofascoreShadowClient {
  getJson(pathAndQuery: string): Promise<RapidApiResult>;
}

export interface SofascoreLiveShadowDependencies {
  readonly client: SofascoreShadowClient;
  readonly lookup: SofascoreMappingLookup;
  readonly now?: () => Date;
  readonly uniqueTournamentId?: number;
}

export interface SofascoreLiveShadowReport {
  readonly mode: "shadow";
  readonly observedAt: string;
  /** Events in the provider's live list (every football match in play). */
  readonly polledEvents: number;
  /** Events of the wanted tournament with a known status, after collapsing. */
  readonly botolaEvents: number;
  readonly foreignTournamentEvents: number;
  readonly malformedEvents: number;
  readonly unknownStatus: readonly SofascoreUnknownStatusEvent[];
  readonly supersededEventIds: readonly string[];
  /** What a writer would send. This runner sends none of it anywhere. */
  readonly wouldIngest: readonly SofascoreIngestCall[];
  readonly unmapped: readonly SofascoreUnmappedEvent[];
  readonly rejected: readonly SofascoreRejectedEvent[];
  readonly quota: RapidApiQuota;
  readonly requestsSent: number;
}

/**
 * One request for the whole live list, filtered to Botola. Writes nothing: no
 * database, no storage. A provider failure (RapidApiError, including the quota
 * guard) propagates to the caller. Not wired to any cron or Edge Function yet.
 */
export async function runSofascoreLiveShadow(
  dependencies: SofascoreLiveShadowDependencies,
): Promise<SofascoreLiveShadowReport> {
  const observedAt = (dependencies.now ?? (() => new Date()))();
  const result = await dependencies.client.getJson(SOFASCORE_LIVE_EVENTS_PATH);
  const parsed = parseSofascoreEvents(result.data, {
    uniqueTournamentId: dependencies.uniqueTournamentId,
  });
  const collapsed = collapseReplacedEvents(parsed.events);
  const plan = buildFixtureIngestPlan(collapsed.events, dependencies.lookup, observedAt);
  return {
    mode: "shadow",
    observedAt: observedAt.toISOString(),
    polledEvents: parsed.polledCount,
    botolaEvents: collapsed.events.length,
    foreignTournamentEvents: parsed.foreignTournamentCount,
    malformedEvents: parsed.malformedCount,
    unknownStatus: parsed.unknownStatus,
    supersededEventIds: collapsed.supersededIds,
    wouldIngest: plan.calls,
    unmapped: plan.unmapped,
    rejected: plan.rejected,
    quota: result.quota,
    requestsSent: result.requestsSent,
  };
}
