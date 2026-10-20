import { z } from "zod";
import { FootballError } from "../errors";
import type {
  MatchSide,
  PerformanceIncident,
  PerformanceIncidentKind,
  PerformanceLineupPlayer,
  PerformanceLineups,
  PerformanceMatchSummary,
  PerformancePlayerRef,
  PerformanceStatisticLine,
} from "./performance-contracts";
import type { RapidApiClient } from "./rapidapi-client";

/**
 * Flashscore (FlashLive Sports on RapidAPI). Field names and values were read
 * from real responses in Phase 0. Flashscore has no per-player statistics for
 * Botola (`v1/events/player-stats` returns 404) and no goalkeeper-saves line.
 */

const dataSchema = z.object({
  DATA: z.object({
    EVENT: z.object({
      EVENT_ID: z.string(),
      START_UTIME: z.number().int(),
      STAGE: z.string(),
      ROUND: z.string().optional(),
      HOME_NAME: z.string(),
      AWAY_NAME: z.string(),
      HOME_SCORE_FULL: z.number().int().optional(),
      AWAY_SCORE_FULL: z.number().int().optional(),
    }),
  }),
});

const participantSchema = z.object({
  INCIDENT_TYPE: z.string(),
  PARTICIPANT_NAME: z.string().optional(),
  PARTICIPANT_ID: z.string().optional(),
});
const summarySchema = z.object({
  DATA: z.array(
    z.object({
      ITEMS: z
        .array(
          z.object({
            INCIDENT_TEAM: z.number().int(),
            INCIDENT_TIME: z.string(),
            ADDED_TIME: z.string().optional(),
            INCIDENT_PARTICIPANTS: z.array(participantSchema),
          }),
        )
        .optional(),
    }),
  ),
});

const memberSchema = z.object({
  PLAYER_ID: z.string(),
  PLAYER_FULL_NAME: z.string(),
  PLAYER_NUMBER: z.number().int().optional(),
  PLAYER_POSITION_ID: z.number().int(),
  PLAYER_TYPE: z.number().int(),
});
const lineupsSchema = z.object({
  DATA: z.array(
    z.object({
      FORMATIONS: z.array(
        z.object({ FORMATION_LINE: z.number().int(), MEMBERS: z.array(memberSchema) }),
      ),
    }),
  ),
});

const statisticsSchema = z.object({
  DATA: z.array(
    z.object({
      STAGE_NAME: z.string(),
      GROUPS: z.array(
        z.object({
          ITEMS: z.array(
            z.object({
              INCIDENT_NAME: z.string(),
              VALUE_HOME: z.string().optional(),
              VALUE_AWAY: z.string().optional(),
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
    const paths = result.error.issues
      .slice(0, 5)
      .map((issue) => issue.path.join("."))
      .join(", ");
    throw new FootballError(
      "invalid_provider_payload",
      `Flashscore ${what} did not match the expected shape (${paths}).`,
    );
  }
  return result.data;
}

export function parseFlashscoreData(raw: unknown): PerformanceMatchSummary {
  const { EVENT: event } = parse(dataSchema, raw, "event data").DATA;
  const round = /(\d+)/.exec(event.ROUND ?? "");
  return {
    provider: "flashscore",
    externalId: event.EVENT_ID,
    kickoffAt: new Date(event.START_UTIME * 1000).toISOString(),
    finished: event.STAGE === "FINISHED",
    homeName: event.HOME_NAME,
    awayName: event.AWAY_NAME,
    homeScore: event.HOME_SCORE_FULL ?? null,
    awayScore: event.AWAY_SCORE_FULL ?? null,
    round: round ? Number(round[1]) : null,
  };
}

/** "12'" is minute 12; "90+4'" is minute 90 with 4 added minutes. */
function parseTime(
  time: string,
  addedTime: string | undefined,
): { minute: number; addedMinutes: number | null } {
  const match = /^(\d{1,3})(?:\+(\d{1,2}))?'?$/.exec(time.trim());
  if (!match) {
    throw new FootballError(
      "invalid_provider_payload",
      "A Flashscore incident time is unreadable.",
    );
  }
  const added = match[2] ?? addedTime;
  return { minute: Number(match[1]), addedMinutes: added ? Number(added) : null };
}

const refOf = (
  participant: z.infer<typeof participantSchema> | undefined,
): PerformancePlayerRef | null =>
  participant?.PARTICIPANT_NAME
    ? { externalId: participant.PARTICIPANT_ID ?? null, name: participant.PARTICIPANT_NAME }
    : null;

/**
 * One entry per incident row. Types seen in Phase 0: GOAL (+ ASSISTANCE),
 * PENALTY_KICK followed by PENALTY_SCORED or PENALTY_MISSED, YELLOW_CARD,
 * SUBSTITUTION_OUT and SUBSTITUTION_IN, NOT_ON_PITCH. A red card, a second
 * yellow and an own goal did not occur in the seven matches, so their labels
 * are unknown: they are returned as `unknown` with the raw type, not guessed.
 * NOT_ON_PITCH is also `unknown`: its meaning is not established.
 */
export function parseFlashscoreSummary(raw: unknown): PerformanceIncident[] {
  const data = parse(summarySchema, raw, "summary");
  const out: PerformanceIncident[] = [];
  for (const stage of data.DATA) {
    for (const item of stage.ITEMS ?? []) {
      if (item.INCIDENT_TEAM !== 1 && item.INCIDENT_TEAM !== 2) {
        throw new FootballError("invalid_provider_payload", "A Flashscore incident has no side.");
      }
      const side: MatchSide = item.INCIDENT_TEAM === 1 ? "home" : "away";
      const { minute, addedMinutes } = parseTime(item.INCIDENT_TIME, item.ADDED_TIME);
      const parts = item.INCIDENT_PARTICIPANTS;
      const of = (type: string) => parts.find((part) => part.INCIDENT_TYPE === type);
      const rawType = parts.map((part) => part.INCIDENT_TYPE).join("+");

      let kind: PerformanceIncidentKind = "unknown";
      let main: z.infer<typeof participantSchema> | undefined = parts[0];
      if (of("PENALTY_SCORED")) {
        kind = "penalty_goal";
        main = of("PENALTY_SCORED");
      } else if (of("PENALTY_MISSED")) {
        kind = "penalty_missed";
        main = of("PENALTY_MISSED");
      } else if (of("GOAL")) {
        kind = "goal";
        main = of("GOAL");
      } else if (of("YELLOW_CARD")) {
        kind = "yellow_card";
        main = of("YELLOW_CARD");
      } else if (of("SUBSTITUTION_OUT") && of("SUBSTITUTION_IN")) {
        kind = "substitution";
        main = undefined;
      }
      out.push({
        provider: "flashscore",
        kind,
        side,
        minute,
        addedMinutes,
        player: refOf(main),
        assist: refOf(of("ASSISTANCE")),
        playerIn: kind === "substitution" ? refOf(of("SUBSTITUTION_IN")) : null,
        playerOut: kind === "substitution" ? refOf(of("SUBSTITUTION_OUT")) : null,
        rawType,
        rawClass: null,
      });
    }
  }
  return out;
}

/**
 * Starters and substitutes, home and away. The side is the formation line
 * (1 home, 2 away: it agrees with the incidents' team number); a starter has
 * `PLAYER_POSITION_ID` 1 and a substitute 2. `PLAYER_TYPE` is 1 for a player, 3
 * for a starting goalkeeper and 2 for a coach (skipped). Flashscore gives no
 * position name: only a goalkeeper marker, `PLAYER_TYPE` 3 or "(G)" after the
 * name, which is removed from the name, along with "(C)" for the captain. Shirt numbers are the matching key across providers, not names.
 */
export function parseFlashscoreLineups(raw: unknown): PerformanceLineups {
  const data = parse(lineupsSchema, raw, "lineups");
  const players: PerformanceLineupPlayer[] = [];
  for (const group of data.DATA) {
    for (const formation of group.FORMATIONS) {
      if (formation.FORMATION_LINE !== 1 && formation.FORMATION_LINE !== 2) continue;
      const side: MatchSide = formation.FORMATION_LINE === 1 ? "home" : "away";
      for (const member of formation.MEMBERS) {
        if (member.PLAYER_TYPE === 2) continue;
        const keeper = member.PLAYER_TYPE === 3 || /\(G\)/.test(member.PLAYER_FULL_NAME);
        players.push({
          provider: "flashscore",
          externalId: member.PLAYER_ID,
          name: member.PLAYER_FULL_NAME.replace(/\s*\((?:C|G)\)/g, "").trim(),
          side,
          shirtNumber: member.PLAYER_NUMBER ?? null,
          position: keeper ? "G" : null,
          starter: member.PLAYER_POSITION_ID === 1,
          stats: null,
        });
      }
    }
  }
  return { provider: "flashscore", players, fullCoverage: false };
}

const asNumber = (value: string | undefined): number | null => {
  if (value === undefined) return null;
  const match = /^-?\d+(?:\.\d+)?/.exec(value.trim());
  return match ? Number(match[0]) : null;
};

/** Team statistic lines (whole match and each half). Values like "55%" read as 55. */
export function parseFlashscoreStatistics(raw: unknown): PerformanceStatisticLine[] {
  const data = parse(statisticsSchema, raw, "statistics");
  return data.DATA.flatMap((stage) =>
    stage.GROUPS.flatMap((group) =>
      group.ITEMS.map((item) => ({
        period: stage.STAGE_NAME,
        key: item.INCIDENT_NAME,
        label: item.INCIDENT_NAME,
        home: asNumber(item.VALUE_HOME),
        away: asNumber(item.VALUE_AWAY),
      })),
    ),
  );
}

export interface FlashscoreMatch {
  readonly summary: PerformanceMatchSummary;
  readonly incidents: readonly PerformanceIncident[];
  readonly lineups: PerformanceLineups;
  readonly statistics: readonly PerformanceStatisticLine[];
}

/** Four requests per match (data, summary, lineups, statistics). */
export class FlashscorePerformanceProvider {
  constructor(private readonly client: RapidApiClient) {}

  usage() {
    return { requests: this.client.requestsSent(), ...this.client.quota() };
  }

  private path(endpoint: string, eventId: string): string {
    if (!/^[A-Za-z0-9]{6,12}$/.test(eventId)) {
      throw new FootballError("invalid_provider_payload", "A Flashscore event id is malformed.");
    }
    return `v1/events/${endpoint}?event_id=${eventId}&locale=en_INT`;
  }

  async getMatchSummary(eventId: string, signal?: AbortSignal) {
    return parseFlashscoreData(await this.client.getJson(this.path("data", eventId), signal));
  }

  async getIncidents(eventId: string, signal?: AbortSignal) {
    return parseFlashscoreSummary(await this.client.getJson(this.path("summary", eventId), signal));
  }

  async getLineups(eventId: string, signal?: AbortSignal) {
    return parseFlashscoreLineups(await this.client.getJson(this.path("lineups", eventId), signal));
  }

  async getStatistics(eventId: string, signal?: AbortSignal) {
    return parseFlashscoreStatistics(
      await this.client.getJson(this.path("statistics", eventId), signal),
    );
  }

  /** One at a time, so the request count and the quota guard stay exact. */
  async getMatch(eventId: string, signal?: AbortSignal): Promise<FlashscoreMatch> {
    const summary = await this.getMatchSummary(eventId, signal);
    const incidents = await this.getIncidents(eventId, signal);
    const lineups = await this.getLineups(eventId, signal);
    const statistics = await this.getStatistics(eventId, signal);
    return { summary, incidents, lineups, statistics };
  }
}
