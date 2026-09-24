import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { postgresUuidSchema } from "@/backend/contracts/validation";

export { postgresUuidSchema } from "@/backend/contracts/validation";

export const FANTASY_POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export const FANTASY_CHIPS = ["wildcard", "free_hit", "bench_boost", "triple_captain"] as const;
export const FANTASY_GAMEWEEK_STATUSES = [
  "scheduled",
  "open",
  "locked",
  "live",
  "provisional",
  "finalizing",
  "finalized",
  "corrected",
  "cancelled",
] as const;

export type FantasyPosition = (typeof FANTASY_POSITIONS)[number];
export type FantasyChip = (typeof FANTASY_CHIPS)[number];

export const lineupSelectionSchema = z.object({
  fantasy_player_id: postgresUuidSchema,
  slot: z.enum(["starter", "bench"]),
  slot_order: z.number().int().min(1).max(11),
  captain: z.boolean(),
  vice_captain: z.boolean(),
});
export type LineupSelection = z.infer<typeof lineupSelectionSchema>;

export const fantasyPlayerSchema = z.object({
  id: postgresUuidSchema,
  footballPlayerId: postgresUuidSchema,
  footballTeamId: postgresUuidSchema,
  name: z.string().min(1),
  fullName: z.string().min(1),
  position: z.enum(FANTASY_POSITIONS),
  price: z.coerce.number().positive(),
  status: z.enum(["available", "doubtful", "injured", "suspended", "ineligible", "unavailable"]),
  teamName: z.string().min(1),
  teamShortName: z.string().min(1),
  photoAssetId: postgresUuidSchema.nullable(),
  crestAssetId: postgresUuidSchema.nullable(),
  /**
   * DEPRECATED (BG-0071). `app.fantasy_players.selected_by_count` is declared,
   * returned here by `api.fantasy_player_pool`, and written by nothing — all
   * 539 rows are 0 while live squad memberships exist. Ownership now comes
   * from `api.fantasy_player_season_stats`, derived at read time from
   * `app.fantasy_squad_memberships`, and no runtime code reads this field any
   * more.
   *
   * It is `optional()` rather than removed so that the follow-up migration can
   * DROP the column without a second frontend change: `api.fantasy_player_pool`
   * keeps its exact current shape today, and a payload that later arrives
   * without the key still parses. Nothing new should ever read it.
   */
  selectedByCount: z.coerce.number().int().nonnegative().optional(),
});
export type FantasyPlayerDto = z.infer<typeof fantasyPlayerSchema>;

export const fantasyTeamSchema = z.object({
  id: postgresUuidSchema,
  seasonId: postgresUuidSchema,
  currentGameweekId: postgresUuidSchema.nullable(),
  name: z.string().min(1),
  bank: z.coerce.number().nonnegative(),
  teamValue: z.coerce.number().positive(),
  freeTransfers: z.number().int().nonnegative(),
  version: z.coerce.number().int().positive(),
  status: z.enum(["active", "suspended", "archived"]),
  createdAt: z.string(),
  updatedAt: z.string(),
  squad: z.array(
    z.object({
      membershipId: postgresUuidSchema,
      fantasyPlayerId: postgresUuidSchema,
      footballPlayerId: postgresUuidSchema,
      footballTeamId: postgresUuidSchema,
      position: z.enum(FANTASY_POSITIONS),
      price: z.coerce.number().positive(),
      purchasePrice: z.coerce.number().positive(),
      salePrice: z.coerce.number().positive(),
      status: z.string(),
    }),
  ),
  lineup: z.array(
    z.object({
      fantasyPlayerId: postgresUuidSchema,
      slot: z.enum(["starter", "bench"]),
      slotOrder: z.number().int().positive(),
      captain: z.boolean(),
      viceCaptain: z.boolean(),
      multiplier: z.coerce.number().nonnegative(),
    }),
  ),
  chips: z
    .object({
      active: z.enum(FANTASY_CHIPS).nullable(),
      activeCancellable: z.boolean(),
      used: z.array(z.enum(FANTASY_CHIPS)),
    })
    .optional()
    .default({ active: null, activeCancellable: false, used: [] }),
});
export type FantasyTeamDto = z.infer<typeof fantasyTeamSchema>;

export const fantasyHubSchema = z.object({
  season: z.object({ id: postgresUuidSchema, name: z.string(), status: z.string() }),
  gameweek: z
    .object({
      id: postgresUuidSchema,
      sequence: z.number().int().positive(),
      name: z.string(),
      deadlineAt: z.string(),
      status: z.enum(FANTASY_GAMEWEEK_STATUSES),
      pointsState: z.enum(["provisional", "final"]),
    })
    .nullable(),
  /**
   * The gameweek a brand-new team joins right now: the open gameweek before
   * its deadline, otherwise the staged next one. `null` when neither exists;
   * absent from a database that predates 20260924200000.
   */
  enrolmentGameweek: z
    .object({
      id: postgresUuidSchema,
      sequence: z.number().int().positive(),
      name: z.string(),
      deadlineAt: z.string(),
      status: z.enum(FANTASY_GAMEWEEK_STATUSES),
    })
    .nullable()
    .optional(),
  team: fantasyTeamSchema.nullable(),
  rankingAvailable: z.boolean(),
});
export type FantasyHubDto = z.infer<typeof fantasyHubSchema>;

export const playerPoolPageSchema = z.object({
  items: z.array(fantasyPlayerSchema),
  nextCursor: z.object({ price: z.coerce.number(), id: postgresUuidSchema }).nullable(),
});
export type PlayerPoolPageDto = z.infer<typeof playerPoolPageSchema>;

export const fantasyGameweekSchema = z.object({
  id: postgresUuidSchema,
  sequence: z.number().int().positive(),
  name: z.string(),
  deadlineAt: z.string(),
  startsAt: z.string(),
  endsAt: z.string(),
  status: z.enum(FANTASY_GAMEWEEK_STATUSES),
  pointsState: z.enum(["provisional", "final"]),
});
export type FantasyGameweekDto = z.infer<typeof fantasyGameweekSchema>;

export const fantasyGameweekPageSchema = z.object({
  items: z.array(fantasyGameweekSchema),
  nextCursor: z.number().int().positive().nullable(),
});

export const fantasyLeagueSchema = z.object({
  id: postgresUuidSchema,
  name: z.string(),
  visibility: z.enum(["public", "private"]),
  memberCount: z.number().int().nonnegative(),
  inviteCodeHint: z.string().nullable(),
  role: z.enum(["owner", "admin", "member"]).nullable(),
  rank: z.coerce.number().int().positive().nullable(),
  previousRank: z.coerce.number().int().positive().nullable(),
  totalPoints: z.number().int().nullable(),
  leaderName: z.string().nullable(),
});
export type FantasyLeagueDto = z.infer<typeof fantasyLeagueSchema>;

export const fantasyLeaguePageSchema = z.object({ items: z.array(fantasyLeagueSchema) });

export const fantasyLeagueStandingPageSchema = z.object({
  league: z.object({
    id: postgresUuidSchema,
    name: z.string(),
    visibility: z.enum(["public", "private"]),
    memberCount: z.number().int().nonnegative(),
  }),
  items: z.array(
    z.object({
      teamId: postgresUuidSchema,
      teamName: z.string(),
      /**
       * BG-0074 — the profile display name for signed-in callers only; the RPC
       * falls back to the fantasy team name for anonymous callers and for teams
       * with no readable profile, because `app.profiles.display_name` is not a
       * public profile field. Treat it as "a name to show", never as identity.
       */
      managerName: z.string(),
      rank: z.coerce.number().int().positive(),
      previousRank: z.coerce.number().int().positive().nullable(),
      totalPoints: z.number().int(),
      gameweekPoints: z.number().int().nullable(),
      calculatedAt: z.string(),
    }),
  ),
});
export type FantasyLeagueStandingPageDto = z.infer<typeof fantasyLeagueStandingPageSchema>;

/**
 * BG-0073 — one row of the season-wide (league-independent) leaderboard.
 *
 * `managerName` is the profile display name only for signed-in callers; the
 * RPC falls back to the fantasy team name for anonymous callers and for teams
 * with no readable profile, because `app.profiles.display_name` is not a
 * public profile field. Treat it as "a name to show", never as identity.
 */
export const fantasyOverallStandingSchema = z.object({
  teamId: postgresUuidSchema,
  teamName: z.string(),
  managerName: z.string(),
  rank: z.coerce.number().int().positive(),
  previousRank: z.coerce.number().int().positive().nullable(),
  totalPoints: z.number().int(),
  gameweekPoints: z.number().int().nullable(),
  calculatedAt: z.string(),
});
export type FantasyOverallStandingDto = z.infer<typeof fantasyOverallStandingSchema>;

/**
 * Before the first gameweek finalizes there are no ranking rows at all, so the
 * empty page (`items: []`, `total: 0`, `myRank: null`) is the normal answer and
 * not an error — including for anonymous callers, who must get HTTP 200.
 */
export const fantasyOverallStandingPageSchema = z.object({
  seasonId: postgresUuidSchema,
  gameweekId: postgresUuidSchema.nullable(),
  items: z.array(fantasyOverallStandingSchema),
  nextCursor: z
    .object({ rank: z.coerce.number().int().positive(), teamId: postgresUuidSchema })
    .nullable(),
  total: z.coerce.number().int().nonnegative(),
  myRank: fantasyOverallStandingSchema.nullable(),
});
export type FantasyOverallStandingPageDto = z.infer<typeof fantasyOverallStandingPageSchema>;

export interface FantasyOverallStandingsInput {
  readonly seasonId: string;
  readonly gameweekId?: string | null;
  readonly cursor?: { readonly rank: number; readonly teamId: string } | null;
  readonly limit?: number;
}

export const fantasyPointsSchema = z.object({
  teamId: postgresUuidSchema,
  gameweekId: postgresUuidSchema,
  gameweekStatus: z.enum(FANTASY_GAMEWEEK_STATUSES),
  pointsState: z.enum(["provisional", "final"]),
  result: z
    .object({
      startingPoints: z.number().int(),
      benchPoints: z.number().int(),
      captainPoints: z.number().int(),
      transferHit: z.number().int().nonnegative(),
      chipType: z.enum(FANTASY_CHIPS).nullable(),
      provisionalScore: z.number().int(),
      finalScore: z.number().int().nullable(),
      state: z.enum(["provisional", "final"]),
      rank: z.coerce.number().int().positive().nullable(),
      overallRank: z.coerce.number().int().positive().nullable(),
      calculationVersion: z.coerce.number().int().positive(),
      finalizedAt: z.string().nullable(),
    })
    .nullable(),
  players: z.array(
    z.object({
      fantasyPlayerId: postgresUuidSchema,
      slot: z.enum(["starter", "bench"]),
      slotOrder: z.number().int().positive(),
      captain: z.boolean(),
      viceCaptain: z.boolean(),
      multiplier: z.coerce.number().nonnegative(),
      // Before the first calculation of a gameweek the backend returns the
      // lineup with null scoring fields; the points screen still has to
      // render the squad, so these stay nullable rather than failing parse.
      provisionalPoints: z.number().int().nullable(),
      finalPoints: z.number().int().nullable(),
      didPlay: z.boolean().nullable(),
      minutesPlayed: z.number().int().nonnegative().nullable(),
      /**
       * BG-0075 — the per-category lines behind this player's total, live
       * ledger rows only (`superseded_at is null`). `category` is free text in
       * `app.fantasy_player_point_events`, so it stays a string here and the UI
       * falls back to the raw code when a category has no translation yet.
       */
      events: z.array(
        z.object({
          category: z.string(),
          points: z.number().int(),
          fixtureId: postgresUuidSchema,
        }),
      ),
    }),
  ),
  /**
   * BG-0075 — the substitutions finalization applied to this team in this
   * gameweek, in the order it applied them. Empty until the gameweek finalizes.
   */
  autoSubstitutions: z.array(
    z.object({
      playerOutId: postgresUuidSchema,
      playerInId: postgresUuidSchema,
      sequence: z.number().int().positive(),
      reason: z.string(),
    }),
  ),
});
export type FantasyPointsDto = z.infer<typeof fantasyPointsSchema>;

/**
 * BG-0075 — the gameweek-wide Average / Highest strip on /fantasy/points.
 *
 * Both figures are null, never zero, while no team has been scored: a zero
 * would read as "every manager scored nothing", which is the defect this
 * contract exists to remove. `teamCount` lets a caller tell the two apart.
 */
export const fantasyGameweekSummarySchema = z.object({
  gameweekId: postgresUuidSchema,
  averagePoints: z.coerce.number().nullable(),
  highestPoints: z.number().int().nullable(),
  teamCount: z.coerce.number().int().nonnegative(),
  pointsState: z.enum(["provisional", "final"]),
});
export type FantasyGameweekSummaryDto = z.infer<typeof fantasyGameweekSummarySchema>;

export const fantasyHistoryPageSchema = z.object({
  items: z.array(
    z.object({
      gameweekId: postgresUuidSchema,
      sequence: z.number().int().positive(),
      name: z.string(),
      score: z.number().int(),
      state: z.enum(["provisional", "final"]),
      transferHit: z.number().int().nonnegative(),
      chipType: z.enum(FANTASY_CHIPS).nullable(),
      rank: z.coerce.number().int().positive().nullable(),
      overallRank: z.coerce.number().int().positive().nullable(),
      teamValue: z.coerce.number().positive(),
      bank: z.coerce.number().nonnegative(),
    }),
  ),
  nextCursor: z.number().int().positive().nullable(),
});
export type FantasyHistoryPageDto = z.infer<typeof fantasyHistoryPageSchema>;

export const fantasyTopPlayerSchema = z.object({
  fantasyPlayerId: postgresUuidSchema,
  points: z.number().int(),
  minutesPlayed: z.number().int().nonnegative(),
  state: z.enum(["provisional", "final"]),
});
export type FantasyTopPlayerDto = z.infer<typeof fantasyTopPlayerSchema>;

/**
 * BG-0071 — one player's season aggregate, from
 * `api.fantasy_player_season_stats`.
 *
 * `form` is the mean points over the last 5 SCORED gameweeks of the season, to
 * one decimal, and is `null` — never 0 — when no gameweek has scored yet. That
 * is the only null case and it is exactly the state production is in today. A
 * player whose only score falls outside the window legitimately reads a real
 * `0`, so the two must stay distinguishable all the way to the screen: the UI
 * renders `fantasy.stat.none` ("–") for null and the number otherwise.
 *
 * Every numeric field arrives from `jsonb_build_object` over Postgres `bigint`
 * and `numeric`, which PostgREST may serialize as a JSON number or as a string
 * depending on magnitude; `z.coerce` accepts both, as the rest of this file
 * already does for `price` and `rank`. `.nullable()` is applied OUTSIDE the
 * coercion on purpose — `z.coerce.number()` would turn `null` into `0` and
 * reintroduce the exact confusion this field exists to prevent.
 */
export const fantasyPlayerSeasonStatSchema = z.object({
  fantasyPlayerId: postgresUuidSchema,
  totalPoints: z.coerce.number().int(),
  form: z.coerce.number().nullable(),
  gameweeksPlayed: z.coerce.number().int().nonnegative(),
  minutes: z.coerce.number().int().nonnegative(),
  ownershipCount: z.coerce.number().int().nonnegative(),
  ownershipPercent: z.coerce.number().nonnegative(),
});
export type FantasyPlayerSeasonStatDto = z.infer<typeof fantasyPlayerSeasonStatSchema>;

/**
 * The RPC returns an OBJECT, not a bare array: the window metadata is needed to
 * tell "no gameweek has scored" from "this player scored nothing", and
 * `activeTeamCount` is the ownership denominator the server already applied.
 * `items` is ordered by `fantasyPlayerId` and carries one entry per
 * active+eligible fantasy player in the season.
 */
export const fantasyPlayerSeasonStatsSchema = z.object({
  activeTeamCount: z.coerce.number().int().nonnegative(),
  formWindow: z.coerce.number().int().positive(),
  scoredGameweeksInWindow: z.coerce.number().int().nonnegative(),
  throughGameweekSequence: z.coerce.number().int().positive().nullable(),
  items: z.array(fantasyPlayerSeasonStatSchema),
});
export type FantasyPlayerSeasonStatsDto = z.infer<typeof fantasyPlayerSeasonStatsSchema>;

/**
 * BG-0071 — one gameweek of a player's history, from
 * `api.fantasy_player_gameweek_history` (a bare array, oldest gameweek first).
 *
 * `opponents` is an array because a gameweek can legitimately carry more than
 * one fixture for a club (a double gameweek). The RPC returns `[]`, never null.
 */
export const fantasyPlayerGameweekHistoryEntrySchema = z.object({
  gameweekId: postgresUuidSchema,
  gameweekSequence: z.coerce.number().int().positive(),
  gameweekName: z.string().min(1),
  points: z.coerce.number().int(),
  minutesPlayed: z.coerce.number().int().nonnegative(),
  didPlay: z.boolean(),
  state: z.enum(["provisional", "final"]),
  opponents: z.array(
    z.object({
      teamId: postgresUuidSchema,
      shortName: z.string().min(1),
      name: z.string().min(1),
      home: z.boolean(),
    }),
  ),
});
export type FantasyPlayerGameweekHistoryEntryDto = z.infer<
  typeof fantasyPlayerGameweekHistoryEntrySchema
>;

export const fantasyPlayerGameweekHistorySchema = z.array(fantasyPlayerGameweekHistoryEntrySchema);

export const fantasyTransferPreviewSchema = z.object({
  transferCount: z.number().int().positive(),
  bankBefore: z.coerce.number().nonnegative(),
  bankAfter: z.coerce.number().nonnegative(),
  freeTransfersBefore: z.number().int().nonnegative(),
  freeTransfersUsed: z.number().int().nonnegative(),
  pointHit: z.number().int().nonnegative(),
  resultingVersion: z.coerce.number().int().positive(),
  deadlineAt: z.string(),
  chipType: z.enum(FANTASY_CHIPS).nullable(),
});
export type FantasyTransferPreviewDto = z.infer<typeof fantasyTransferPreviewSchema>;

export const fantasyRulesSchema = z.object({
  seasonId: postgresUuidSchema,
  rulesetId: postgresUuidSchema,
  rulesetCode: z.string(),
  rulesetVersion: z.number().int().positive(),
  rulesetSemanticVersion: z.string(),
  squadSize: z.number().int().positive(),
  budget: z.coerce.number().positive(),
  maxPlayersPerClub: z.number().int().positive(),
  initialFreeTransfers: z.number().int().nonnegative(),
  maxFreeTransferRollover: z.number().int().nonnegative(),
  transferHitCost: z.number().int().nonnegative(),
  captainMultiplier: z.coerce.number().positive(),
  tripleCaptainMultiplier: z.coerce.number().positive(),
  deadline: z.object({
    minutesBeforeFirstFixture: z.number().int().nonnegative(),
    gracePeriodSeconds: z.number().int().nonnegative(),
  }),
  positions: z.array(
    z.object({
      code: z.enum(FANTASY_POSITIONS),
      squadQuota: z.number().int().positive(),
      startingMinimum: z.number().int().nonnegative(),
      startingMaximum: z.number().int().positive(),
      goalPoints: z.number().int(),
      cleanSheetPoints: z.number().int(),
    }),
  ),
  scoring: z.array(z.unknown()),
  chips: z.array(
    z.object({
      allocationCode: z.string(),
      chipType: z.enum(FANTASY_CHIPS),
      startsAtGameweek: z.number().int().positive(),
      endsAtGameweek: z.number().int().positive().nullable(),
      cancellable: z.boolean(),
    }),
  ),
  features: z.record(z.string(), z.unknown()).nullable(),
});
export type FantasyRulesDto = z.infer<typeof fantasyRulesSchema>;

export const fantasyFixtureDifficultySchema = z.object({
  fixtureId: postgresUuidSchema,
  gameweekId: postgresUuidSchema,
  gameweek: z.number().int().positive(),
  clubId: postgresUuidSchema,
  opponentClubId: postgresUuidSchema,
  kickoffAt: z.string(),
  isHome: z.boolean(),
  difficulty: z.number().int().min(1).max(5),
  confidence: z.enum(["low", "medium", "high"]),
  algorithmVersion: z.string(),
});
export type FantasyFixtureDifficultyDto = z.infer<typeof fantasyFixtureDifficultySchema>;

export interface FantasyPlayerPoolInput {
  readonly seasonId: string;
  readonly position?: FantasyPosition;
  readonly teamId?: string;
  readonly maxPrice?: number;
  readonly search?: string;
  readonly cursor?: { readonly price: number; readonly id: string };
  readonly limit?: number;
}

export interface CreateFantasyTeamInput {
  readonly seasonId: string;
  readonly gameweekId: string;
  readonly teamName: string;
  readonly selection: readonly LineupSelection[];
  readonly idempotencyKey: string;
}

export interface TransferInput {
  readonly player_out_id: string;
  readonly player_in_id: string;
}

export interface FantasyRepository {
  getHub(language: "fr" | "ar", context: RepositoryContext): Promise<FantasyHubDto>;
  getPlayerPool(
    input: FantasyPlayerPoolInput,
    context: RepositoryContext,
  ): Promise<PlayerPoolPageDto>;
  getTeam(seasonId: string, context: RepositoryContext): Promise<FantasyTeamDto>;
  createTeam(input: CreateFantasyTeamInput, context: RepositoryContext): Promise<FantasyTeamDto>;
  saveLineup(
    teamId: string,
    gameweekId: string,
    selection: readonly LineupSelection[],
    expectedVersion: number,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<FantasyTeamDto>;
  previewTransfers(
    teamId: string,
    gameweekId: string,
    transfers: readonly TransferInput[],
    expectedVersion: number,
    chip: FantasyChip | null,
    context: RepositoryContext,
  ): Promise<FantasyTransferPreviewDto>;
  confirmTransfers(
    teamId: string,
    gameweekId: string,
    transfers: readonly TransferInput[],
    expectedVersion: number,
    idempotencyKey: string,
    chip: FantasyChip | null,
    context: RepositoryContext,
  ): Promise<unknown>;
  activateChip(
    teamId: string,
    gameweekId: string,
    chip: FantasyChip,
    expectedVersion: number,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<unknown>;
  cancelChip(
    teamId: string,
    gameweekId: string,
    expectedVersion: number,
    context: RepositoryContext,
  ): Promise<unknown>;
  getRules(seasonId: string, context: RepositoryContext): Promise<FantasyRulesDto>;
  getFixtureDifficulty(
    seasonId: string,
    fromGameweek: number,
    gameweekCount: number,
    context: RepositoryContext,
  ): Promise<readonly FantasyFixtureDifficultyDto[]>;
  getGameweeks(
    seasonId: string,
    beforeSequence: number | null,
    context: RepositoryContext,
  ): Promise<z.infer<typeof fantasyGameweekPageSchema>>;
  getPoints(
    teamId: string,
    gameweekId: string,
    context: RepositoryContext,
  ): Promise<FantasyPointsDto>;
  getHistory(
    teamId: string,
    beforeSequence: number | null,
    context: RepositoryContext,
  ): Promise<FantasyHistoryPageDto>;
  getGameweekSummary(
    gameweekId: string,
    context: RepositoryContext,
  ): Promise<FantasyGameweekSummaryDto>;
  getLeagues(
    seasonId: string,
    visibility: "public" | "private" | null,
    context: RepositoryContext,
  ): Promise<readonly FantasyLeagueDto[]>;
  getLeagueStandings(
    leagueId: string,
    gameweekId: string | null,
    context: RepositoryContext,
  ): Promise<FantasyLeagueStandingPageDto>;
  getOverallStandings(
    input: FantasyOverallStandingsInput,
    context: RepositoryContext,
  ): Promise<FantasyOverallStandingPageDto>;
  createLeague(
    seasonId: string,
    teamId: string,
    name: string,
    visibility: "public" | "private",
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<unknown>;
  joinLeague(
    teamId: string,
    inviteCode: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<unknown>;
  leaveLeague(leagueId: string, teamId: string, context: RepositoryContext): Promise<void>;
  archiveLeague(leagueId: string, teamId: string, context: RepositoryContext): Promise<void>;
  getTopPlayers(
    gameweekId: string,
    context: RepositoryContext,
  ): Promise<readonly FantasyTopPlayerDto[]>;
  /**
   * BG-0071 — the season aggregate behind every picking screen. Kept out of
   * `getPlayerPool` deliberately: that RPC's signature, column order and keyset
   * cursor are load-bearing for the squad builder and the Playwright journeys
   * and must not move.
   */
  getPlayerSeasonStats(
    seasonId: string,
    throughGameweekId: string | null,
    context: RepositoryContext,
  ): Promise<FantasyPlayerSeasonStatsDto>;
  /** BG-0071 — per-gameweek history for one player, oldest gameweek first. */
  getPlayerGameweekHistory(
    fantasyPlayerId: string,
    context: RepositoryContext,
  ): Promise<readonly FantasyPlayerGameweekHistoryEntryDto[]>;
}

export interface PositionRule {
  readonly position: FantasyPosition;
  readonly squadQuota: number;
  readonly startingMinimum: number;
  readonly startingMaximum: number;
}

export interface FantasyRules {
  readonly squadSize: number;
  readonly budget: number;
  readonly maxPlayersPerClub: number;
  readonly initialFreeTransfers: number;
  readonly maxFreeTransferRollover: number;
  readonly transferHitCost: number;
  readonly captainMultiplier: number;
  readonly tripleCaptainMultiplier: number;
  readonly positions: readonly PositionRule[];
}
