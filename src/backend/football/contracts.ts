import { z } from "zod";
import type { CursorPageRequest, RepositoryContext } from "@/backend/contracts/repository";
import { postgresUuidSchema } from "@/backend/contracts/validation";

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

/** `app.squad_role`. */
export const SQUAD_ROLES = ["player", "captain", "vice_captain", "reserve"] as const;
export type SquadRole = (typeof SQUAD_ROLES)[number];

const nullableText = z.string().nullable();
const nullableUuid = postgresUuidSchema.nullable();

export const teamSummarySchema = z.object({
  id: postgresUuidSchema,
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
  id: postgresUuidSchema,
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

export const seasonSummarySchema = z.object({
  id: postgresUuidSchema,
  competition: competitionSummarySchema,
  label: z.string().min(1),
  startsOn: z.string().date(),
  endsOn: z.string().date(),
  status: z.enum(["planned", "active", "completed", "cancelled"]),
  isCurrent: z.boolean(),
  firstMatchDate: z.string().date().nullable(),
  lastMatchDate: z.string().date().nullable(),
});
export type SeasonSummaryDto = z.infer<typeof seasonSummarySchema>;

export const venueSummarySchema = z
  .object({
    id: postgresUuidSchema,
    slug: z.string().min(1),
    name: z.string().min(1),
    city: nullableText,
    capacity: z.number().int().nonnegative().nullable(),
    countryCode: nullableText,
  })
  .nullable();

export const matchCardSchema = z.object({
  id: postgresUuidSchema,
  competition: competitionSummarySchema,
  seasonId: postgresUuidSchema,
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
  id: postgresUuidSchema,
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
  id: postgresUuidSchema,
  slug: z.string().min(1),
  displayName: z.string().min(1),
  slot: z.enum(["starting", "bench"]),
  position: z.enum(FOOTBALL_POSITIONS).nullable(),
  shirtNumber: z.number().int().positive().nullable(),
  order: z.number().int().positive(),
  captain: z.boolean(),
});
/** A lineup player the catalogue does not know, by the provider's name: no page, no slug. */
export const unlistedLineupPlayerSchema = lineupPlayerSchema.omit({ slug: true });
const SLOT_ORDER = { starting: 0, bench: 1 } as const;
export const lineupSchema = z
  .object({
    id: postgresUuidSchema,
    team: teamSummarySchema,
    formation: nullableText,
    confirmed: z.boolean(),
    publishedAt: z.string().datetime({ offset: true }).nullable(),
    players: z.array(lineupPlayerSchema),
    unlistedPlayers: z.array(unlistedLineupPlayerSchema).default([]),
  })
  // One list for the page, in the provider's order, whether the catalogue
  // knows the player or not.
  .transform(({ unlistedPlayers, ...lineup }) => ({
    ...lineup,
    players: [
      ...lineup.players,
      ...unlistedPlayers.map((player) => ({ ...player, slug: null })),
    ].sort((a, b) => SLOT_ORDER[a.slot] - SLOT_ORDER[b.slot] || a.order - b.order),
  }));
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

/**
 * One minute of the provider's pressure index (`api.football_match_pressure`):
 * how hard each club was pushing. Only one club a minute has a positive value;
 * a club with no row that minute is `null`.
 */
export const matchPressurePointSchema = z.object({
  minute: z.number().int().nonnegative(),
  homeValue: z.number().nonnegative().nullable(),
  awayValue: z.number().nonnegative().nullable(),
});
export type MatchPressurePointDto = z.infer<typeof matchPressurePointSchema>;

/** A player the provider lists as out of the match (`api.football_match_absences`). */
export const matchAbsenceSchema = z.object({
  id: postgresUuidSchema,
  teamId: postgresUuidSchema,
  playerId: nullableUuid,
  playerName: z.string().min(1),
  position: z.enum(FOOTBALL_POSITIONS).nullable(),
  category: z.enum(["injury", "suspension"]),
  /** "2026-10-12"; `null` when the provider does not know. */
  expectedReturnOn: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable(),
  gamesMissed: z.number().int().nonnegative().nullable(),
});
export type MatchAbsenceDto = z.infer<typeof matchAbsenceSchema>;

export const standingRowSchema = z.object({
  id: postgresUuidSchema,
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
  id: postgresUuidSchema,
  slug: z.string().min(1),
  fullName: z.string().min(1),
  displayName: z.string().min(1),
  firstName: nullableText,
  lastName: nullableText,
  dateOfBirth: nullableText,
  position: z.enum(FOOTBALL_POSITIONS),
  preferredFoot: z.enum(["left", "right", "both", "unknown"]),
  nationality: z
    .object({ id: postgresUuidSchema, code: z.string().length(2), name: z.string().min(1) })
    .nullable(),
  currentTeam: teamSummarySchema.nullable(),
  shirtNumber: z.number().int().positive().nullable(),
  active: z.boolean(),
});
export type PlayerSummaryDto = z.infer<typeof playerSummarySchema>;

export const availabilitySchema = z.object({
  id: postgresUuidSchema,
  status: z.enum(["available", "injured", "suspended", "doubtful", "unknown"]),
  reason: nullableText,
  startsOn: z.string(),
  expectedReturnOn: nullableText,
  endsOn: nullableText,
  active: z.boolean(),
  providerUpdatedAt: z.string().datetime({ offset: true }),
});
export type AvailabilityStatusDto = z.infer<typeof availabilitySchema>;

/**
 * One row of `api.football_team_squad`: a player's membership of a team. The
 * dates are kept as the API sends them — nothing on screen reads them, and a
 * stricter parse would throw the whole squad away over one odd row.
 */
export const squadMemberSchema = z.object({
  membershipId: postgresUuidSchema,
  playerId: postgresUuidSchema,
  slug: z.string().min(1),
  displayName: z.string().min(1),
  fullName: z.string().min(1),
  position: z.enum(FOOTBALL_POSITIONS),
  shirtNumber: z.number().int().positive().nullable(),
  squadRole: z.enum(SQUAD_ROLES),
  validFrom: z.string(),
  validTo: nullableText,
  active: z.boolean(),
});
export type SquadMemberDto = z.infer<typeof squadMemberSchema>;

export interface MatchPageCursor {
  readonly kickoffAt: string;
  readonly id: string;
}

/**
 * `api.football_team_fixtures`: every fixture the team plays, in every
 * season and competition, NEWEST first, paged backwards from `before`.
 */
export interface TeamFixturesInput {
  readonly teamId: string;
  readonly language: FootballLanguage;
  readonly before?: MatchPageCursor | null;
  /** 1–100; the API's own default is 20. */
  readonly limit?: number;
}

/**
 * `api.football_competition_fixtures`: one competition's fixtures, OLDEST
 * first, paged forwards from `after`.
 */
export interface CompetitionFixturesInput {
  readonly competitionId: string;
  readonly seasonId?: string | null;
  readonly language: FootballLanguage;
  readonly after?: MatchPageCursor | null;
  /** 1–100; the API's own default is 50. */
  readonly limit?: number;
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
  readonly seasonId?: string | null;
}

export interface FootballRepository {
  getSeasons(
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly SeasonSummaryDto[]>;
  getTeams(
    language: FootballLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly TeamSummaryDto[]>;
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
  getPressure(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchPressurePointDto[]>;
  getAbsences(
    id: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchAbsenceDto[]>;
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
  /** Every fixture of one competition season, in kickoff order, whatever its status. */
  getSeasonFixtures(
    competitionId: string,
    seasonId: string,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly MatchCardDto[]>;
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
  getTeamFixtures(
    input: TeamFixturesInput,
    context: RepositoryContext,
  ): Promise<readonly MatchCardDto[]>;
  getCompetitionFixtures(
    input: CompetitionFixturesInput,
    context: RepositoryContext,
  ): Promise<MatchPageDto>;
  /**
   * `seasonId` null: the team's current squad (its active memberships). A
   * season id: the squad as stored for that season.
   */
  getTeamSquad(
    teamId: string,
    seasonId: string | null,
    language: FootballLanguage,
    context: RepositoryContext,
  ): Promise<readonly SquadMemberDto[]>;
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
