import { z } from "zod";
import type { CursorPageRequest, RepositoryContext } from "@/backend/contracts/repository";

export const FOOTBALL_LANGUAGES = ["fr", "ar"] as const;
export type FootballLanguage = (typeof FOOTBALL_LANGUAGES)[number];

export const FIXTURE_STATUSES = [
  "scheduled",
  "not_started",
  "live_first_half",
  "half_time",
  "live_second_half",
  "extra_time",
  "penalties",
  "finished",
  "postponed",
  "cancelled",
  "suspended",
  "delayed",
  "abandoned",
] as const;
export type FixtureStatus = (typeof FIXTURE_STATUSES)[number];

export const FOOTBALL_POSITIONS = ["goalkeeper", "defender", "midfielder", "forward"] as const;
export type FootballPosition = (typeof FOOTBALL_POSITIONS)[number];

const nullableText = z.string().nullable();
const nullableUuid = z.string().uuid().nullable();

export const teamSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: z.string().min(1),
  code: nullableText,
  city: nullableText,
  countryCode: nullableText,
  crestUrl: z.string().url().nullable(),
  crestPath: nullableText,
  primaryColor: nullableText,
  secondaryColor: nullableText,
  active: z.boolean(),
});
export type TeamSummaryDto = z.infer<typeof teamSummarySchema>;

export const competitionSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  name: z.string().min(1),
  shortName: nullableText,
  type: z.enum(["league", "cup", "super_cup", "international", "friendly"]),
  countryCode: nullableText,
  logoUrl: z.string().url().nullable(),
  logoPath: nullableText,
  active: z.boolean(),
});
export type CompetitionSummaryDto = z.infer<typeof competitionSummarySchema>;

export const venueSummarySchema = z
  .object({
    id: z.string().uuid(),
    slug: z.string().min(1),
    name: z.string().min(1),
    city: nullableText,
    capacity: z.number().int().nonnegative().nullable(),
    countryCode: nullableText,
  })
  .nullable();

export const matchCardSchema = z.object({
  id: z.string().uuid(),
  competition: competitionSummarySchema,
  seasonId: z.string().uuid(),
  seasonLabel: z.string().min(1),
  roundId: nullableUuid,
  roundName: nullableText,
  roundNumber: z.number().int().positive().nullable(),
  homeTeam: teamSummarySchema,
  awayTeam: teamSummarySchema,
  venue: venueSummarySchema,
  kickoffAt: z.string().datetime({ offset: true }),
  status: z.enum(FIXTURE_STATUSES),
  period: z.enum([
    "pre_match",
    "first_half",
    "half_time",
    "second_half",
    "extra_time",
    "penalties",
    "post_match",
  ]),
  minute: z.number().int().nonnegative().nullable(),
  addedTime: z.number().int().nonnegative().nullable(),
  homeScore: z.number().int().nonnegative().nullable(),
  awayScore: z.number().int().nonnegative().nullable(),
  halfTimeHomeScore: z.number().int().nonnegative().nullable(),
  halfTimeAwayScore: z.number().int().nonnegative().nullable(),
  extraTimeHomeScore: z.number().int().nonnegative().nullable(),
  extraTimeAwayScore: z.number().int().nonnegative().nullable(),
  penaltyHomeScore: z.number().int().nonnegative().nullable(),
  penaltyAwayScore: z.number().int().nonnegative().nullable(),
  winnerTeamId: nullableUuid,
  attendance: z.number().int().nonnegative().nullable(),
  providerUpdatedAt: z.string().datetime({ offset: true }),
  sourceSequence: z.number().int().nonnegative(),
  finalizedAt: z.string().datetime({ offset: true }).nullable(),
  updatedAt: z.string().datetime({ offset: true }),
});
export type MatchCardDto = z.infer<typeof matchCardSchema>;
export type MatchDetailHeaderDto = MatchCardDto;
export type LiveMatchSummaryDto = MatchCardDto;

export const timelineItemSchema = z.object({
  id: z.string().uuid(),
  type: z.enum([
    "goal",
    "own_goal",
    "penalty_goal",
    "missed_penalty",
    "yellow_card",
    "second_yellow",
    "red_card",
    "substitution",
    "var",
    "injury",
    "period_start",
    "period_end",
  ]),
  detail: nullableText,
  teamId: nullableUuid,
  playerId: nullableUuid,
  relatedPlayerId: nullableUuid,
  minute: z.number().int().nonnegative(),
  addedTime: z.number().int().nonnegative(),
  sequence: z.number().int().nonnegative(),
  period: z.string().min(1),
});
export type MatchTimelineItemDto = z.infer<typeof timelineItemSchema>;

export const lineupPlayerSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  displayName: z.string().min(1),
  slot: z.enum(["starting", "bench"]),
  position: z.enum(FOOTBALL_POSITIONS).nullable(),
  shirtNumber: z.number().int().positive().nullable(),
  order: z.number().int().positive(),
  captain: z.boolean(),
});
export const lineupSchema = z.object({
  id: z.string().uuid(),
  team: teamSummarySchema,
  formation: nullableText,
  confirmed: z.boolean(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  players: z.array(lineupPlayerSchema),
});
export type MatchLineupDto = z.infer<typeof lineupSchema>;

export const matchStatisticSchema = z.object({
  code: z.string().min(1),
  label: z.string().min(1),
  valueType: z.enum(["integer", "decimal", "percentage", "duration"]),
  unit: nullableText,
  homeValue: z.number().nonnegative().nullable(),
  homeDisplayValue: nullableText,
  awayValue: z.number().nonnegative().nullable(),
  awayDisplayValue: nullableText,
});
export type MatchStatisticComparisonDto = z.infer<typeof matchStatisticSchema>;

export const standingRowSchema = z.object({
  id: z.string().uuid(),
  rank: z.number().int().positive(),
  team: teamSummarySchema,
  played: z.number().int().nonnegative(),
  won: z.number().int().nonnegative(),
  drawn: z.number().int().nonnegative(),
  lost: z.number().int().nonnegative(),
  goalsFor: z.number().int().nonnegative(),
  goalsAgainst: z.number().int().nonnegative(),
  goalDifference: z.number().int(),
  points: z.number().int().nonnegative(),
  form: nullableText,
  qualificationCode: nullableText,
  providerUpdatedAt: z.string().datetime({ offset: true }),
});
export type StandingRowDto = z.infer<typeof standingRowSchema>;

export const playerSummarySchema = z.object({
  id: z.string().uuid(),
  slug: z.string().min(1),
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  firstName: nullableText,
  lastName: nullableText,
  dateOfBirth: nullableText,
  position: z.enum(FOOTBALL_POSITIONS),
  preferredFoot: z.enum(["left", "right", "both", "unknown"]),
  nationality: z
    .object({ id: z.string().uuid(), code: z.string().length(2), name: z.string().min(1) })
    .nullable(),
  currentTeam: teamSummarySchema.nullable(),
  shirtNumber: z.number().int().positive().nullable(),
  active: z.boolean(),
});
export type PlayerSummaryDto = z.infer<typeof playerSummarySchema>;

export const availabilitySchema = z.object({
  id: z.string().uuid(),
  status: z.enum(["available", "injured", "suspended", "doubtful", "unknown"]),
  reason: nullableText,
  startsOn: z.string(),
  expectedReturnOn: nullableText,
  endsOn: nullableText,
  active: z.boolean(),
  providerUpdatedAt: z.string().datetime({ offset: true }),
});
export type AvailabilityStatusDto = z.infer<typeof availabilitySchema>;

export interface MatchPageCursor {
  readonly kickoffAt: string;
  readonly id: string;
}

export interface MatchPageDto {
  readonly items: readonly MatchCardDto[];
  readonly nextCursor: MatchPageCursor | null;
}

export interface MatchesByDateInput extends CursorPageRequest {
  readonly date: string;
  readonly language: FootballLanguage;
  readonly timezone?: string;
  readonly statuses?: readonly FixtureStatus[];
  readonly competitionId?: string | null;
}

export interface FootballRepository {
  getHomeMatches(
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly MatchCardDto[]>;
  getLiveMatches(
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly LiveMatchSummaryDto[]>;
  getMatchesByDate(input: MatchesByDateInput, context: RepositoryContext): Promise<MatchPageDto>;
  getMatchDetail(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<MatchDetailHeaderDto>;
  getTimeline(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchTimelineItemDto[]>;
  getLineups(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchLineupDto[]>;
  getStatistics(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchStatisticComparisonDto[]>;
  getHeadToHead(
    id: string,
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly MatchCardDto[]>;
  getStandings(
    seasonId: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly StandingRowDto[]>;
  getCompetition(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<CompetitionSummaryDto>;
  getTeam(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<TeamSummaryDto>;
  getPlayer(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<PlayerSummaryDto>;
  getAvailability(
    id: string,
    context: RepositoryContext,
  ): Promise<readonly AvailabilityStatusDto[]>;
}
