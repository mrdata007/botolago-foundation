import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";

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
  fantasy_player_id: z.string().uuid(),
  slot: z.enum(["starter", "bench"]),
  slot_order: z.number().int().min(1).max(11),
  captain: z.boolean(),
  vice_captain: z.boolean(),
});
export type LineupSelection = z.infer<typeof lineupSelectionSchema>;

export const fantasyPlayerSchema = z.object({
  id: z.string().uuid(),
  footballPlayerId: z.string().uuid(),
  footballTeamId: z.string().uuid(),
  name: z.string().min(1),
  fullName: z.string().min(1),
  position: z.enum(FANTASY_POSITIONS),
  price: z.coerce.number().positive(),
  status: z.enum(["available", "doubtful", "injured", "suspended", "ineligible", "unavailable"]),
  teamName: z.string().min(1),
  teamShortName: z.string().min(1),
  photoAssetId: z.string().uuid().nullable(),
  crestAssetId: z.string().uuid().nullable(),
  selectedByCount: z.coerce.number().int().nonnegative(),
});
export type FantasyPlayerDto = z.infer<typeof fantasyPlayerSchema>;

export const fantasyTeamSchema = z.object({
  id: z.string().uuid(),
  seasonId: z.string().uuid(),
  currentGameweekId: z.string().uuid().nullable(),
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
      membershipId: z.string().uuid(),
      fantasyPlayerId: z.string().uuid(),
      footballPlayerId: z.string().uuid(),
      footballTeamId: z.string().uuid(),
      position: z.enum(FANTASY_POSITIONS),
      price: z.coerce.number().positive(),
      purchasePrice: z.coerce.number().positive(),
      salePrice: z.coerce.number().positive(),
      status: z.string(),
    }),
  ),
  lineup: z.array(
    z.object({
      fantasyPlayerId: z.string().uuid(),
      slot: z.enum(["starter", "bench"]),
      slotOrder: z.number().int().positive(),
      captain: z.boolean(),
      viceCaptain: z.boolean(),
      multiplier: z.coerce.number().nonnegative(),
    }),
  ),
});
export type FantasyTeamDto = z.infer<typeof fantasyTeamSchema>;

export const fantasyHubSchema = z.object({
  season: z.object({ id: z.string().uuid(), name: z.string(), status: z.string() }),
  gameweek: z
    .object({
      id: z.string().uuid(),
      sequence: z.number().int().positive(),
      name: z.string(),
      deadlineAt: z.string(),
      status: z.enum(FANTASY_GAMEWEEK_STATUSES),
      pointsState: z.enum(["provisional", "final"]),
    })
    .nullable(),
  team: fantasyTeamSchema.nullable(),
  rankingAvailable: z.boolean(),
});
export type FantasyHubDto = z.infer<typeof fantasyHubSchema>;

export const playerPoolPageSchema = z.object({
  items: z.array(fantasyPlayerSchema),
  nextCursor: z.object({ price: z.coerce.number(), id: z.string().uuid() }).nullable(),
});
export type PlayerPoolPageDto = z.infer<typeof playerPoolPageSchema>;

export const fantasyGameweekSchema = z.object({
  id: z.string().uuid(),
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
  id: z.string().uuid(),
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
    id: z.string().uuid(),
    name: z.string(),
    visibility: z.enum(["public", "private"]),
    memberCount: z.number().int().nonnegative(),
  }),
  items: z.array(
    z.object({
      teamId: z.string().uuid(),
      teamName: z.string(),
      rank: z.coerce.number().int().positive(),
      previousRank: z.coerce.number().int().positive().nullable(),
      totalPoints: z.number().int(),
      gameweekPoints: z.number().int().nullable(),
      calculatedAt: z.string(),
    }),
  ),
});
export type FantasyLeagueStandingPageDto = z.infer<typeof fantasyLeagueStandingPageSchema>;

export const fantasyPointsSchema = z.object({
  teamId: z.string().uuid(),
  gameweekId: z.string().uuid(),
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
      fantasyPlayerId: z.string().uuid(),
      slot: z.enum(["starter", "bench"]),
      slotOrder: z.number().int().positive(),
      captain: z.boolean(),
      viceCaptain: z.boolean(),
      multiplier: z.coerce.number().nonnegative(),
      provisionalPoints: z.number().int(),
      finalPoints: z.number().int().nullable(),
      didPlay: z.boolean(),
      minutesPlayed: z.number().int().nonnegative(),
    }),
  ),
});
export type FantasyPointsDto = z.infer<typeof fantasyPointsSchema>;

export const fantasyHistoryPageSchema = z.object({
  items: z.array(
    z.object({
      gameweekId: z.string().uuid(),
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
  fantasyPlayerId: z.string().uuid(),
  points: z.number().int(),
  minutesPlayed: z.number().int().nonnegative(),
  state: z.enum(["provisional", "final"]),
});
export type FantasyTopPlayerDto = z.infer<typeof fantasyTopPlayerSchema>;

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
  ): Promise<unknown>;
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
