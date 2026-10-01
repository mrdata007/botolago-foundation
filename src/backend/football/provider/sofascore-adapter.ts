import { z } from "zod";
import { FootballError } from "../errors";
import type {
  LineupPosition,
  MatchSide,
  PerformanceIncident,
  PerformanceIncidentKind,
  PerformanceLineupPlayer,
  PerformanceLineups,
  PerformanceMatchSummary,
  PerformancePlayerRef,
  PerformancePlayerStats,
  PerformanceStatisticLine,
} from "./performance-contracts";
import type { RapidApiClient } from "./rapidapi-client";

/**
 * Sofascore (Api Dojo on RapidAPI). Field names and values were read from real
 * responses in Phase 0 (docs/audits/2026-10-01-fantasy-providers-phase0.md).
 * Optional fields here are optional in the real data.
 */

const playerRef = z.object({ id: z.number().int(), name: z.string() });

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

const statNumber = z.number().optional();
const lineupPlayerSchema = z.object({
  player: z.object({ id: z.number().int(), name: z.string(), position: z.string().optional() }),
  shirtNumber: z.number().int().optional(),
  position: z.string().optional(),
  substitute: z.boolean().optional(),
  statistics: z
    .object({
      minutesPlayed: statNumber,
      goals: statNumber,
      goalAssist: statNumber,
      ownGoals: statNumber,
      saves: statNumber,
      rating: statNumber,
      totalPass: statNumber,
      penaltyMiss: statNumber,
    })
    .optional(),
});
const lineupsSchema = z.object({
  home: z.object({ players: z.array(lineupPlayerSchema) }),
  away: z.object({ players: z.array(lineupPlayerSchema) }),
});

const incidentSchema = z.object({
  incidentType: z.string(),
  incidentClass: z.string().optional(),
  time: z.number().int().optional(),
  addedTime: z.number().int().optional(),
  isHome: z.boolean().optional(),
  rescinded: z.boolean().optional(),
  player: playerRef.optional(),
  assist1: playerRef.optional(),
  playerIn: playerRef.optional(),
  playerOut: playerRef.optional(),
});
const incidentsSchema = z.object({ incidents: z.array(incidentSchema) });

const statisticsSchema = z.object({
  statistics: z.array(
    z.object({
      period: z.string(),
      groups: z.array(
        z.object({
          statisticsItems: z.array(
            z.object({
              key: z.string(),
              name: z.string(),
              homeValue: z.number().optional(),
              awayValue: z.number().optional(),
            }),
          ),
        }),
      ),
    }),
  ),
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

const ref = (value: { id: number; name: string } | undefined): PerformancePlayerRef | null =>
  value ? { externalId: String(value.id), name: value.name } : null;

const POSITIONS: readonly string[] = ["G", "D", "M", "F"];
const position = (value: string | undefined): LineupPosition | null =>
  value && POSITIONS.includes(value) ? (value as LineupPosition) : null;

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
 * Lineups with per-player statistics. `fullCoverage` is true when any player
 * carries `totalPass`. On a limited match `goalAssist` is 0 for everyone and
 * there is no `saves`, so `assists` is returned as null there (unknown), and
 * `saves` is null whenever the provider did not send it. A goalkeeper with no
 * `saves` value is never read as zero saves.
 */
export function parseSofascoreLineups(raw: unknown): PerformanceLineups {
  const data = parse(lineupsSchema, raw, "lineups");
  const all = [...data.home.players, ...data.away.players];
  const fullCoverage = all.some((entry) => entry.statistics?.totalPass !== undefined);
  const build = (side: MatchSide, entries: typeof data.home.players): PerformanceLineupPlayer[] =>
    entries.map((entry) => {
      const stats = entry.statistics;
      const playerStats: PerformancePlayerStats | null = stats
        ? {
            minutesPlayed: stats.minutesPlayed ?? null,
            goals: stats.goals ?? null,
            assists: fullCoverage ? (stats.goalAssist ?? null) : null,
            ownGoals: stats.ownGoals ?? null,
            saves: fullCoverage ? (stats.saves ?? null) : null,
            rating: stats.rating ?? null,
            penaltyMissed: stats.penaltyMiss ?? null,
          }
        : null;
      return {
        provider: "sofascore",
        externalId: String(entry.player.id),
        name: entry.player.name,
        side,
        shirtNumber: entry.shirtNumber ?? null,
        position: position(entry.position ?? entry.player.position),
        starter: entry.substitute === false,
        stats: playerStats,
      };
    });
  return {
    provider: "sofascore",
    players: [...build("home", data.home.players), ...build("away", data.away.players)],
    fullCoverage,
  };
}

/**
 * Incident type and class pairs seen in Phase 0: goal/regular, goal/penalty,
 * inGamePenalty/missed, card/yellow, card/yellowRed, card/red, substitution/
 * regular, and `period` markers (skipped). Anything else, including an own
 * goal (not seen in any of the ten matches), is `unknown` with its raw labels.
 * Rescinded incidents (VAR) are dropped.
 */
export function parseSofascoreIncidents(raw: unknown): PerformanceIncident[] {
  const { incidents } = parse(incidentsSchema, raw, "incidents");
  const out: PerformanceIncident[] = [];
  for (const incident of incidents) {
    if (incident.incidentType === "period") continue;
    if (incident.rescinded === true) continue;
    const rawType = incident.incidentType;
    const rawClass = incident.incidentClass ?? null;
    let kind: PerformanceIncidentKind = "unknown";
    if (rawType === "goal" && rawClass === "regular") kind = "goal";
    else if (rawType === "goal" && rawClass === "penalty") kind = "penalty_goal";
    else if (rawType === "inGamePenalty" && rawClass === "missed") kind = "penalty_missed";
    else if (rawType === "card" && rawClass === "yellow") kind = "yellow_card";
    else if (rawType === "card" && rawClass === "yellowRed") kind = "second_yellow";
    else if (rawType === "card" && rawClass === "red") kind = "red_card";
    else if (rawType === "substitution" && rawClass === "regular") kind = "substitution";
    if (incident.time === undefined || incident.isHome === undefined) {
      // An incident that cannot be placed must not be guessed at: fail the whole
      // match so it goes to review instead of scoring on partial data.
      throw new FootballError(
        "invalid_provider_payload",
        `Sofascore incident ${rawType} has no minute or side.`,
      );
    }
    out.push({
      provider: "sofascore",
      kind,
      side: incident.isHome ? "home" : "away",
      minute: incident.time,
      addedMinutes: incident.addedTime ?? null,
      player: ref(incident.player),
      assist: ref(incident.assist1),
      playerIn: ref(incident.playerIn),
      playerOut: ref(incident.playerOut),
      rawType,
      rawClass,
    });
  }
  return out;
}

/** Team statistic lines, whole match and per half as the provider sends them. */
export function parseSofascoreStatistics(raw: unknown): PerformanceStatisticLine[] {
  const data = parse(statisticsSchema, raw, "statistics");
  return data.statistics.flatMap((period) =>
    period.groups.flatMap((group) =>
      group.statisticsItems.map((item) => ({
        period: period.period,
        key: item.key,
        label: item.name,
        home: item.homeValue ?? null,
        away: item.awayValue ?? null,
      })),
    ),
  );
}

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
