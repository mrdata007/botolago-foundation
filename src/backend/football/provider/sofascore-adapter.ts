import { z } from "zod";
import { FootballError } from "../errors";
import type {
  PerformanceIncident,
  PerformanceLineups,
  PerformanceMatchSummary,
  PerformanceStatisticLine,
} from "./performance-contracts";
import type { RapidApiClient } from "./rapidapi-client";
import {
  SofascoreParseError,
  parseSofascoreIncidents as parseIncidents,
  parseSofascoreLineups as parseLineups,
  parseSofascoreStatistics as parseStatistics,
} from "../../../../supabase/functions/_shared/sofascore-performance-parse.ts";

/**
 * Sofascore (Api Dojo on RapidAPI). Field names and values were read from real
 * responses in Phase 0 (docs/audits/2026-10-01-fantasy-providers-phase0.md).
 * Optional fields here are optional in the real data.
 */

const detailSchema = z.object({
  event: z.object({
    id: z.number().int(),
    startTimestamp: z.number().int(),
    status: z.object({ type: z.string() }),
    roundInfo: z.object({ round: z.number().int().optional() }).optional(),
    homeTeam: z.object({ name: z.string() }),
    awayTeam: z.object({ name: z.string() }),
    homeScore: z.object({ current: z.number().int().optional() }).optional(),
    awayScore: z.object({ current: z.number().int().optional() }).optional(),
  }),
});

function parse<T>(schema: z.ZodType<T>, value: unknown, what: string): T {
  const result = schema.safeParse(value);
  if (!result.success) {
    // Paths only, never values: the payload is third-party content.
    const paths = result.error.issues
      .slice(0, 5)
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new FootballError(
      "invalid_provider_payload",
      `Sofascore ${what} did not match the expected shape (${paths}).`,
    );
  }
  return result.data;
}

export function parseSofascoreDetail(raw: unknown): PerformanceMatchSummary {
  const { event } = parse(detailSchema, raw, "match detail");
  return {
    provider: "sofascore",
    externalId: String(event.id),
    kickoffAt: new Date(event.startTimestamp * 1000).toISOString(),
    finished: event.status.type === "finished",
    homeName: event.homeTeam.name,
    awayName: event.awayTeam.name,
    homeScore: event.homeScore?.current ?? null,
    awayScore: event.awayScore?.current ?? null,
    round: event.roundInfo?.round ?? null,
  };
}

/**
 * Lineups, incidents and statistics are read by the parsers in
 * supabase/functions/_shared/sofascore-performance-parse.ts, which the Edge
 * Function also uses to build Fantasy observations from the replies it already
 * fetched: one implementation for both. A reply of another shape fails here
 * with a FootballError carrying paths only, never values.
 */
function shared<T>(read: (raw: unknown) => T, raw: unknown, what: string): T {
  try {
    return read(raw);
  } catch (error) {
    if (error instanceof SofascoreParseError) {
      throw new FootballError(
        "invalid_provider_payload",
        `Sofascore ${what} did not match the expected shape (${error.paths.slice(0, 5).join(", ")}).`,
      );
    }
    throw error;
  }
}

export const parseSofascoreLineups = (raw: unknown): PerformanceLineups =>
  shared(parseLineups, raw, "lineups");
export const parseSofascoreIncidents = (raw: unknown): PerformanceIncident[] =>
  shared(parseIncidents, raw, "incidents");
export const parseSofascoreStatistics = (raw: unknown): PerformanceStatisticLine[] =>
  shared(parseStatistics, raw, "statistics");

export interface SofascoreMatch {
  readonly summary: PerformanceMatchSummary;
  readonly lineups: PerformanceLineups;
  readonly incidents: readonly PerformanceIncident[];
  readonly statistics: readonly PerformanceStatisticLine[];
}

/** Four requests per match (detail, lineups, incidents, statistics). */
export class SofascorePerformanceProvider {
  constructor(private readonly client: RapidApiClient) {}

  private path(endpoint: string, matchId: string): string {
    if (!/^\d{1,12}$/.test(matchId)) {
      throw new FootballError("invalid_provider_payload", "A Sofascore match id is a number.");
    }
    return `matches/${endpoint}?matchId=${matchId}`;
  }

  async getMatchSummary(matchId: string, signal?: AbortSignal) {
    return parseSofascoreDetail(await this.client.getJson(this.path("detail", matchId), signal));
  }

  async getLineups(matchId: string, signal?: AbortSignal) {
    return parseSofascoreLineups(
      await this.client.getJson(this.path("get-lineups", matchId), signal),
    );
  }

  async getIncidents(matchId: string, signal?: AbortSignal) {
    return parseSofascoreIncidents(
      await this.client.getJson(this.path("get-incidents", matchId), signal),
    );
  }

  async getStatistics(matchId: string, signal?: AbortSignal) {
    return parseSofascoreStatistics(
      await this.client.getJson(this.path("get-statistics", matchId), signal),
    );
  }

  /** One at a time, so the request count and the quota guard stay exact. */
  async getMatch(matchId: string, signal?: AbortSignal): Promise<SofascoreMatch> {
    const summary = await this.getMatchSummary(matchId, signal);
    const lineups = await this.getLineups(matchId, signal);
    const incidents = await this.getIncidents(matchId, signal);
    const statistics = await this.getStatistics(matchId, signal);
    return { summary, lineups, incidents, statistics };
  }
}
