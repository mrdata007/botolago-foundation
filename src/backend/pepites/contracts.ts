import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";

/**
 * Pépites DTOs, as `api.pepites_*` return them
 * (supabase/migrations/20260926120000_pepites_api.sql). Every read answers
 * `{ available: false }` while Pépites is not open to the caller (mode off, or
 * staff mode for a non-staff reader); otherwise `available: true`, `preview`
 * (staff mode) and the data. Localised text comes in both languages and the
 * page picks one.
 */

const localized = z.object({ fr: z.string(), ar: z.string() });

export const pepitesTeamSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().nullable().optional(),
  name: localized,
  shortName: localized,
});

export const pepitesPhotoSchema = z.object({
  assetId: z.string().uuid(),
  storagePath: z.string(),
  credit: z.string().nullable().optional(),
  copyrightOwner: z.string().nullable().optional(),
  scope: z.string().optional(),
});

export const positionGroupSchema = z.enum(["GK", "DEF", "MID", "FWD"]);

export const pepitesPlayerCardSchema = z.object({
  id: z.string().uuid(),
  slug: z.string().nullable().optional(),
  name: z.string(),
  fullName: z.string().nullable().optional(),
  positionGroup: positionGroupSchema.nullable(),
  detailedPosition: z.string().nullable().optional(),
  age: z.number().int().nullable(),
  team: pepitesTeamSchema.nullable(),
  score: z.number().nullable(),
  rank: z.number().int().nullable(),
  rankInPosition: z.number().int().nullable().optional(),
  photo: pepitesPhotoSchema.nullable(),
});

export const movementSchema = z
  .object({
    kind: z.enum(["up", "down", "same", "new"]),
    by: z.number().int().optional(),
  })
  .nullable();

export const editionEntrySchema = z.object({
  rank: z.number().int(),
  computedRank: z.number().int(),
  score: z.number(),
  reasonFr: z.string().nullable(),
  reasonAr: z.string().nullable(),
  movement: movementSchema,
  player: pepitesPlayerCardSchema,
});

export const editionSchema = z.object({
  id: z.string().uuid(),
  seasonId: z.string().uuid(),
  seasonLabel: z.string(),
  week: z.number().int(),
  round: z.number().int(),
  status: z.enum(["published", "superseded", "withdrawn"]),
  publishedAt: z.string().nullable(),
  withdrawnAt: z.string().nullable(),
  withdrawnReason: z.string().nullable(),
  correctsEditionId: z.string().uuid().nullable(),
  correctedBy: z.string().uuid().nullable(),
  correctedByWeek: z.number().int().nullable(),
  previousEditionId: z.string().uuid().nullable(),
  methodology: z.string(),
  entries: z.array(editionEntrySchema),
});

const closed = z.object({ available: z.literal(false) });
const openBase = { available: z.literal(true), preview: z.boolean() };

export const versionStateSchema = z.enum(["current", "countdown", "delayed"]);

export const versionResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    version: z.string().nullable(),
    source: z.enum(["edition", "previous_season"]).nullable(),
    editionId: z.string().uuid().nullable().optional(),
    runId: z.string().uuid().nullable().optional(),
    seasonId: z.string().uuid().nullable().optional(),
    week: z.number().int().nullable().optional(),
    state: versionStateSchema,
    nextRevealAt: z.string().nullable(),
  }),
]);

export const previousSeasonSchema = z.object({
  runId: z.string().uuid(),
  seasonId: z.string().uuid(),
  seasonLabel: z.string(),
  methodology: z.string(),
  asOfRound: z.number().int(),
  entries: z.array(
    z.object({
      rank: z.number().int(),
      score: z.number().nullable(),
      player: pepitesPlayerCardSchema,
    }),
  ),
});

export const homeResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    version: z.string().optional(),
    source: z.enum(["edition", "previous_season"]).optional(),
    edition: editionSchema.nullable().optional(),
    previousSeason: previousSeasonSchema.nullable().optional(),
  }),
]);

export const rankingRowSchema = pepitesPlayerCardSchema.extend({
  minutes: z.number().int(),
  apps: z.number().int(),
  starts: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  ratingAvg: z.number().nullable(),
  formAvg: z.number().nullable(),
  ga90: z.number().nullable(),
  /** Minutes in the second half of the run's rounds; null under two rounds. */
  secondHalfMinutes: z.number().int().nullable().optional(),
  flags: z.array(z.string()),
  movement: movementSchema,
});

export const rankingResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    version: z.string().optional(),
    source: z.enum(["edition", "previous_season"]).optional(),
    total: z.number().int().optional(),
    rows: z.array(rankingRowSchema).optional(),
    /** The ranked players' clubs, on the first page only (the club filter). */
    teams: z.array(pepitesTeamSchema).optional(),
  }),
]);

export const playerScoreSchema = z.object({
  eligible: z.boolean(),
  score: z.number().nullable(),
  rank: z.number().int().nullable(),
  rankInPosition: z.number().int().nullable(),
  apps: z.number().int(),
  starts: z.number().int(),
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  saves: z.number().int().nullable(),
  cleanSheets: z.number().int().nullable(),
  ratingAvg: z.number().nullable(),
  ratingCount: z.number().int(),
  formAvg: z.number().nullable(),
  per90: z.record(z.string(), z.number().nullable()),
  percentiles: z.record(z.string(), z.number().nullable()),
  components: z.record(z.string(), z.number().nullable()),
  flags: z.array(z.string()),
});

export const playerResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    version: z.string().optional(),
    source: z.enum(["edition", "previous_season"]).optional(),
    player: pepitesPlayerCardSchema
      .extend({
        preferredFoot: z.string().nullable(),
        heightCm: z.number().nullable(),
        nationality: z.string().nullable(),
        missing: z.array(z.string()),
      })
      .optional(),
    score: playerScoreSchema.nullable().optional(),
    editions: z
      .array(
        z.object({
          editionId: z.string().uuid(),
          week: z.number().int(),
          rank: z.number().int(),
          status: z.string(),
        }),
      )
      .optional(),
  }),
]);

export const playerMatchSchema = z.object({
  fixtureId: z.string().uuid(),
  kickoffAt: z.string(),
  home: z.boolean(),
  opponent: pepitesTeamSchema.nullable(),
  teamScore: z.number().int().nullable(),
  opponentScore: z.number().int().nullable(),
  minutes: z.number().int(),
  started: z.boolean(),
  goals: z.number().int(),
  assists: z.number().int(),
  yellowCards: z.number().int(),
  redCards: z.number().int(),
  rating: z.number().nullable(),
});

export const playerMatchesResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    matches: z.array(playerMatchSchema).optional(),
  }),
]);

/**
 * The run's rounds cut in two halves (1 to `firstTo`, then to `lastRound`):
 * the player's minutes and the club's matches in each.
 */
export const minutesSplitSchema = z.object({
  firstTo: z.number().int(),
  lastRound: z.number().int(),
  firstMinutes: z.number().int(),
  secondMinutes: z.number().int(),
  firstMatches: z.number().int(),
  secondMatches: z.number().int(),
});

export const seasonStatsSchema = z.object({
  apps: z.number().int(),
  starts: z.number().int(),
  minutes: z.number().int(),
  goals: z.number().int(),
  assists: z.number().int(),
  saves: z.number().int().nullable(),
  cleanSheets: z.number().int().nullable(),
  goalsConceded: z.number().int().nullable(),
  penaltiesSaved: z.number().int().nullable(),
  penaltiesMissed: z.number().int(),
  yellowCards: z.number().int(),
  redCards: z.number().int(),
  ownGoals: z.number().int(),
});

export const playerStatsResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    version: z.string().optional(),
    source: z.enum(["edition", "previous_season"]).optional(),
    stats: seasonStatsSchema.optional(),
    split: minutesSplitSchema.nullable().optional(),
    /** The same player in the open Fantasy game; null when the game does not list them. */
    fantasyPlayerId: z.string().uuid().nullable().optional(),
  }),
]);

/** `following` is null for a reader who cannot follow (signed out, a guest). */
export const followStateSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    found: z.boolean(),
    followers: z.number().int().optional(),
    following: z.boolean().nullable().optional(),
  }),
]);

export const editionResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({ ...openBase, found: z.boolean(), edition: editionSchema.optional() }),
]);

export const methodologyResponseSchema = z.discriminatedUnion("available", [
  closed,
  z.object({
    ...openBase,
    methodology: z.object({
      version: z.string(),
      params: z.record(z.string(), z.unknown()),
      descriptionFr: z.string(),
      descriptionAr: z.string(),
    }),
    coverage: z
      .object({
        runId: z.string().uuid(),
        source: z.string().nullable(),
        asOfRound: z.number().int(),
        poolSize: z.number().int(),
        noDateOfBirth: z.number().int(),
        eligible: z.number().int(),
        ranked: z.number().int(),
        ratingCoverage: z.number().nullable(),
        footCoverage: z.number().nullable(),
        heightCoverage: z.number().nullable(),
      })
      .nullable(),
  }),
]);

export const weeklyEmailSchema = z.object({
  enabled: z.boolean(),
  changedAt: z.string().nullable(),
  emailReachable: z.boolean(),
  blockers: z.array(
    z.enum(["guest_account", "email_unconfirmed", "notifications_off", "email_off"]),
  ),
});

export type PepitesTeam = z.infer<typeof pepitesTeamSchema>;
export type PepitesPlayerCard = z.infer<typeof pepitesPlayerCardSchema>;
export type PositionGroup = z.infer<typeof positionGroupSchema>;
export type Movement = z.infer<typeof movementSchema>;
export type EditionEntry = z.infer<typeof editionEntrySchema>;
export type PepitesEdition = z.infer<typeof editionSchema>;
export type VersionResponse = z.infer<typeof versionResponseSchema>;
export type HomeResponse = z.infer<typeof homeResponseSchema>;
export type PreviousSeason = z.infer<typeof previousSeasonSchema>;
export type RankingRow = z.infer<typeof rankingRowSchema>;
export type RankingResponse = z.infer<typeof rankingResponseSchema>;
export type PlayerResponse = z.infer<typeof playerResponseSchema>;
export type PlayerMatch = z.infer<typeof playerMatchSchema>;
export type PlayerMatchesResponse = z.infer<typeof playerMatchesResponseSchema>;
export type EditionResponse = z.infer<typeof editionResponseSchema>;
export type MethodologyResponse = z.infer<typeof methodologyResponseSchema>;
export type MinutesSplit = z.infer<typeof minutesSplitSchema>;
export type SeasonStats = z.infer<typeof seasonStatsSchema>;
export type PlayerStatsResponse = z.infer<typeof playerStatsResponseSchema>;
export type FollowState = z.infer<typeof followStateSchema>;
export type WeeklyEmailDto = z.infer<typeof weeklyEmailSchema>;

export const RANKING_SORTS = [
  "score",
  "minutes",
  "goals",
  "assists",
  "rating",
  "form",
  "ga90",
] as const;
export type RankingSort = (typeof RANKING_SORTS)[number];

export interface RankingQuery {
  readonly version: string | null;
  readonly position: PositionGroup | null;
  readonly maxAge: number | null;
  readonly teamId: string | null;
  readonly sort: RankingSort;
  readonly limit: number;
  readonly offset: number;
  /** Players with at least these minutes; null for no floor. */
  readonly minMinutes?: number | null;
  /** Only the players the reader follows. */
  readonly followed?: boolean;
}

/** An account follows at most this many players (the database says so too). */
export const PEPITES_FOLLOW_LIMIT = 100;

/** What a data-error report may point at on a player page. */
export const REPORTABLE_FIELDS = [
  "name",
  "date_of_birth",
  "nationality",
  "preferred_foot",
  "height_cm",
  "detailed_position",
  "club",
  "photo",
  "stats",
] as const;
export type ReportableField = (typeof REPORTABLE_FIELDS)[number];

export interface PepitesRepository {
  version(context: RepositoryContext): Promise<VersionResponse>;
  home(version: string | null, context: RepositoryContext): Promise<HomeResponse>;
  ranking(query: RankingQuery, context: RepositoryContext): Promise<RankingResponse>;
  player(
    version: string | null,
    playerId: string,
    context: RepositoryContext,
  ): Promise<PlayerResponse>;
  playerMatches(
    playerId: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<PlayerMatchesResponse>;
  playerStats(
    version: string | null,
    playerId: string,
    context: RepositoryContext,
  ): Promise<PlayerStatsResponse>;
  followState(playerId: string, context: RepositoryContext): Promise<FollowState>;
  setFollow(playerId: string, follow: boolean, context: RepositoryContext): Promise<FollowState>;
  edition(
    seasonId: string | null,
    week: number,
    context: RepositoryContext,
  ): Promise<EditionResponse>;
  methodology(context: RepositoryContext): Promise<MethodologyResponse>;
  myWeeklyEmail(context: RepositoryContext): Promise<WeeklyEmailDto>;
  setMyWeeklyEmail(enabled: boolean, context: RepositoryContext): Promise<WeeklyEmailDto>;
  reportDataIssue(
    playerId: string,
    field: ReportableField,
    message: string,
    context: RepositoryContext,
  ): Promise<void>;
}
