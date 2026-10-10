import { z } from "zod";
import { FootballError } from "../errors";
import type { FixtureStatus } from "../contracts";
import type { ProviderFixture } from "./contracts";

/**
 * Sofascore season fixture lists and standings (RapidAPI host
 * sofascore.p.rapidapi.com). Field names come from a real probe on 2026-10-10;
 * the tests use small synthetic payloads. Parsing only: nothing here calls the
 * API or touches the database.
 */

/** Endpoint paths, relative to the RapidAPI host. Ids must be positive integers. */
function positive(value: number, what: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new FootballError(
      "invalid_provider_payload",
      `A Sofascore ${what} is a positive number.`,
    );
  }
  return value;
}

function eventListPath(
  endpoint: string,
  tournamentId: number,
  seasonId: number,
  pageIndex: number,
): string {
  if (!Number.isInteger(pageIndex) || pageIndex < 0) {
    throw new FootballError("invalid_provider_payload", "A Sofascore page index is 0 or more.");
  }
  return `tournaments/${endpoint}?tournamentId=${positive(tournamentId, "tournament id")}&seasonId=${positive(seasonId, "season id")}&pageIndex=${pageIndex}`;
}

export function sofascoreLastMatchesPath(
  tournamentId: number,
  seasonId: number,
  pageIndex = 0,
): string {
  return eventListPath("get-last-matches", tournamentId, seasonId, pageIndex);
}

export function sofascoreNextMatchesPath(
  tournamentId: number,
  seasonId: number,
  pageIndex = 0,
): string {
  return eventListPath("get-next-matches", tournamentId, seasonId, pageIndex);
}

export function sofascoreStandingsPath(
  tournamentId: number,
  seasonId: number,
  type: "total" | "home" | "away" = "total",
): string {
  return `tournaments/get-standings?tournamentId=${positive(tournamentId, "tournament id")}&seasonId=${positive(seasonId, "season id")}&type=${type}`;
}

// ---------------------------------------------------------------------------
// Status mapping

export type SofascorePeriod = ProviderFixture["period"];

export interface SofascoreStatusMapping {
  readonly status: FixtureStatus;
  readonly period: SofascorePeriod;
  /** True when the raw status was not recognised; the mapping is a placeholder. */
  readonly unknown: boolean;
}

/**
 * Sofascore `status.type` is the primary key. For "inprogress" the numeric code
 * picks the phase (6 first half, 7 second half, 31 half time, 41/42 extra time,
 * 50 penalties). Only "finished", "postponed" and "notstarted" were seen in the
 * probe; the other types and codes follow Sofascore's public vocabulary and are
 * flagged `unknown` if they do not match, never thrown.
 */
export function mapSofascoreStatus(type: string, code: number): SofascoreStatusMapping {
  const known = (status: FixtureStatus, period: SofascorePeriod): SofascoreStatusMapping => ({
    status,
    period,
    unknown: false,
  });
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
  // Placeholder only: parseSofascoreEventList leaves out every unknown event.
  return { status: "scheduled", period: "pre_match", unknown: true };
}

// ---------------------------------------------------------------------------
// Event lists

const teamSchema = z.object({
  id: z.number().int(),
  name: z.string(),
  shortName: z.string().optional(),
  nameCode: z.string().optional(),
  slug: z.string().optional(),
});

const scoreSchema = z.object({
  current: z.number().int().optional(),
  period1: z.number().int().optional(),
});

const eventSchema = z.object({
  id: z.number().int().positive(),
  startTimestamp: z.number().int().nonnegative(),
  status: z.object({
    code: z.number().int(),
    type: z.string(),
    description: z.string().optional(),
  }),
  roundInfo: z.object({ round: z.number().int().optional() }).optional(),
  tournament: z
    .object({
      id: z.number().int().optional(),
      uniqueTournament: z.object({ id: z.number().int() }),
    })
    .passthrough(),
  season: z.object({ id: z.number().int() }).passthrough(),
  homeTeam: teamSchema,
  awayTeam: teamSchema,
  homeScore: scoreSchema.optional(),
  awayScore: scoreSchema.optional(),
  changes: z.object({ changeTimestamp: z.number().int().optional() }).optional(),
});

const eventListSchema = z.object({
  events: z.array(z.unknown()),
  hasNextPage: z.boolean(),
});

export interface SofascoreTeamRef {
  readonly id: string;
  readonly name: string;
}

export interface SofascoreScheduleEvent {
  readonly sofascoreEventId: string;
  /** ISO 8601 UTC. */
  readonly startsAt: string;
  readonly round: number | null;
  readonly status: FixtureStatus;
  readonly period: SofascorePeriod;
  /** Raw `status.type` and `status.code`, kept for audit and re-mapping. */
  readonly rawStatusType: string;
  readonly rawStatusCode: number;
  readonly home: SofascoreTeamRef;
  readonly away: SofascoreTeamRef;
  /** Null when the provider sent no score (not played). */
  readonly homeScore: number | null;
  readonly awayScore: number | null;
  /** From period1; null unless both sides are present. */
  readonly halfTimeHome: number | null;
  readonly halfTimeAway: number | null;
  /** Seconds, as sent; null when absent. */
  readonly changeTimestamp: number | null;
  readonly uniqueTournamentId: string;
  readonly seasonId: string;
}

export interface SofascoreEventPage {
  readonly events: readonly SofascoreScheduleEvent[];
  readonly hasNextPage: boolean;
  /** Events dropped because they belong to another unique tournament. */
  readonly foreignTournamentCount: number;
  /** Events dropped because they did not match the expected shape. */
  readonly malformedCount: number;
  /**
   * Events left out because their status was not recognised. They are never
   * passed on under a guessed status: a guess could reopen a live or abandoned
   * match. Kept here so a caller can report them for review.
   */
  readonly unknownStatus: readonly SofascoreUnknownStatusEvent[];
}

export interface SofascoreUnknownStatusEvent {
  readonly sofascoreEventId: string;
  readonly rawStatusType: string;
  readonly rawStatusCode: number;
}

export interface SofascoreEventListOptions {
  /** When set, events of any other unique tournament are dropped and counted. */
  readonly uniqueTournamentId?: number;
}

function topLevelFailure(what: string, error: z.ZodError): FootballError {
  // Paths only, never values: the payload is third-party content.
  const paths = error.issues
    .slice(0, 5)
    .map((issue) => issue.path.join("."))
    .join(", ");
  return new FootballError(
    "invalid_provider_payload",
    `Sofascore ${what} did not match the expected shape (${paths}).`,
  );
}

/**
 * `tournaments/get-last-matches` and `tournaments/get-next-matches`. A wrong
 * top-level shape rejects the page; a single bad event is dropped and counted.
 */
export function parseSofascoreEventList(
  payload: unknown,
  options: SofascoreEventListOptions = {},
): SofascoreEventPage {
  const page = eventListSchema.safeParse(payload);
  if (!page.success) throw topLevelFailure("event list", page.error);

  const events: SofascoreScheduleEvent[] = [];
  let foreignTournamentCount = 0;
  let malformedCount = 0;
  const unknownStatus: SofascoreUnknownStatusEvent[] = [];
  for (const candidate of page.data.events) {
    const parsed = eventSchema.safeParse(candidate);
    if (!parsed.success) {
      malformedCount += 1;
      continue;
    }
    const event = parsed.data;
    if (
      options.uniqueTournamentId !== undefined &&
      event.tournament.uniqueTournament.id !== options.uniqueTournamentId
    ) {
      foreignTournamentCount += 1;
      continue;
    }
    const mapped = mapSofascoreStatus(event.status.type, event.status.code);
    if (mapped.unknown) {
      unknownStatus.push({
        sofascoreEventId: String(event.id),
        rawStatusType: event.status.type,
        rawStatusCode: event.status.code,
      });
      continue;
    }
    const half1Home = event.homeScore?.period1;
    const half1Away = event.awayScore?.period1;
    events.push({
      sofascoreEventId: String(event.id),
      startsAt: new Date(event.startTimestamp * 1000).toISOString(),
      round: event.roundInfo?.round ?? null,
      status: mapped.status,
      period: mapped.period,
      rawStatusType: event.status.type,
      rawStatusCode: event.status.code,
      home: { id: String(event.homeTeam.id), name: event.homeTeam.name },
      away: { id: String(event.awayTeam.id), name: event.awayTeam.name },
      homeScore: event.homeScore?.current ?? null,
      awayScore: event.awayScore?.current ?? null,
      halfTimeHome: half1Home !== undefined && half1Away !== undefined ? half1Home : null,
      halfTimeAway: half1Home !== undefined && half1Away !== undefined ? half1Away : null,
      changeTimestamp: event.changes?.changeTimestamp ?? null,
      uniqueTournamentId: String(event.tournament.uniqueTournament.id),
      seasonId: String(event.season.id),
    });
  }
  return {
    events,
    hasNextPage: page.data.hasNextPage,
    foreignTournamentCount,
    malformedCount,
    unknownStatus,
  };
}

export interface CollapsedEvents {
  readonly events: readonly SofascoreScheduleEvent[];
  /** Ids of postponed events replaced by a later event for the same pairing. */
  readonly supersededIds: readonly string[];
}

/**
 * A replayed postponed match gets a NEW Sofascore event id and the old one stays
 * "postponed" in the same round. Per (season, round, home, away): when a
 * non-postponed event exists, every postponed one is superseded; otherwise only
 * the latest postponed one (by start time, then id) is kept. Events with no
 * round are never collapsed. Input order is preserved.
 */
export function collapseReplacedEvents(events: readonly SofascoreScheduleEvent[]): CollapsedEvents {
  const groups = new Map<string, SofascoreScheduleEvent[]>();
  for (const event of events) {
    if (event.round === null) continue;
    const key = [event.seasonId, event.round, event.home.id, event.away.id].join("|");
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
// Standings

const standingRowSchema = z.object({
  id: z.number().int().optional(),
  team: teamSchema,
  position: z.number().int().positive(),
  matches: z.number().int().nonnegative(),
  wins: z.number().int().nonnegative(),
  draws: z.number().int().nonnegative(),
  losses: z.number().int().nonnegative(),
  scoresFor: z.number().int().nonnegative(),
  scoresAgainst: z.number().int().nonnegative(),
  points: z.number().int(),
  scoreDiffFormatted: z.string().optional(),
  promotion: z.object({ id: z.number().int().optional(), text: z.string() }).optional(),
});

const standingsSchema = z.object({
  standings: z.array(
    z.object({
      id: z.number().int().optional(),
      type: z.string().optional(),
      name: z.string().optional(),
      tournament: z
        .object({ uniqueTournament: z.object({ id: z.number().int() }).optional() })
        .passthrough()
        .optional(),
      rows: z.array(standingRowSchema),
      updatedAtTimestamp: z.number().int().optional(),
    }),
  ),
});

export interface SofascoreStandingRow {
  readonly teamId: string;
  readonly teamName: string;
  readonly position: number;
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
  readonly points: number;
  /** Provider's text, for example "+3"; null when absent. */
  readonly goalDifferenceText: string | null;
  readonly promotionText: string | null;
}

export interface SofascoreStandingsTable {
  readonly name: string | null;
  readonly type: string | null;
  readonly uniqueTournamentId: string | null;
  /** ISO 8601 UTC; null when absent. */
  readonly updatedAt: string | null;
  readonly rows: readonly SofascoreStandingRow[];
}

/**
 * `tournaments/get-standings`. Strict: a partial table is misleading, so any
 * shape problem, or a repeated team or position inside one table, rejects the
 * payload.
 */
export function parseSofascoreStandings(payload: unknown): SofascoreStandingsTable[] {
  const parsed = standingsSchema.safeParse(payload);
  if (!parsed.success) throw topLevelFailure("standings", parsed.error);
  return parsed.data.standings.map((table) => {
    const teams = new Set(table.rows.map((row) => row.team.id));
    const positions = new Set(table.rows.map((row) => row.position));
    if (teams.size !== table.rows.length || positions.size !== table.rows.length) {
      throw new FootballError(
        "invalid_provider_payload",
        "Sofascore standings repeat a team or a position.",
      );
    }
    const uniqueTournamentId = table.tournament?.uniqueTournament?.id;
    return {
      name: table.name ?? null,
      type: table.type ?? null,
      uniqueTournamentId: uniqueTournamentId !== undefined ? String(uniqueTournamentId) : null,
      updatedAt:
        table.updatedAtTimestamp !== undefined
          ? new Date(table.updatedAtTimestamp * 1000).toISOString()
          : null,
      rows: table.rows.map((row) => ({
        teamId: String(row.team.id),
        teamName: row.team.name,
        position: row.position,
        played: row.matches,
        won: row.wins,
        drawn: row.draws,
        lost: row.losses,
        goalsFor: row.scoresFor,
        goalsAgainst: row.scoresAgainst,
        points: row.points,
        goalDifferenceText: row.scoreDiffFormatted ?? null,
        promotionText: row.promotion?.text ?? null,
      })),
    };
  });
}
