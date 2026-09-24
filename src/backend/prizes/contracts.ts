import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";

/**
 * Fantasy prizes: the DTOs of `api.fantasy_prizes`, `api.fantasy_prize_winners`
 * and the `api.admin_*_fantasy_prize*` functions
 * (supabase/migrations/20260924120000_fantasy_prizes.sql).
 *
 * The public shapes are the whole public contract: a key the database starts
 * returning is dropped by the parse rather than shown. Emails, display names,
 * user ids and verification notes exist only on the admin shapes.
 */

const uuid = z.string().uuid();
const integer = z.number().int();

export const prizeTierSchema = z.enum(["gameweek", "monthly", "season", "mini_league"]);
export type PrizeTier = z.infer<typeof prizeTierSchema>;

/** Tiers in the order every surface lists them. */
export const PRIZE_TIERS = ["gameweek", "monthly", "season", "mini_league"] as const;

export const prizeWinnerStatusSchema = z.enum([
  "pending",
  "verified",
  "paid",
  "forfeited",
  "overridden",
]);
export type PrizeWinnerStatus = z.infer<typeof prizeWinnerStatusSchema>;

export const prizeTieBreakSchema = z.enum([
  "outright",
  "fewer_transfers",
  "earlier_registration",
  "final_fallback",
  "admin_override",
]);
export type PrizeTieBreak = z.infer<typeof prizeTieBreakSchema>;

export const prizeSkipReasonSchema = z.enum([
  "flagged",
  "staff",
  "gameweek_cap_reached",
  "mini_league_cap_reached",
]);
export type PrizeSkipReason = z.infer<typeof prizeSkipReasonSchema>;

const localizedSchema = z.object({ fr: z.string(), ar: z.string() });

// ---------------------------------------------------------------------------
// Public
// ---------------------------------------------------------------------------

export const publicPrizeSchema = z.object({
  id: uuid,
  tier: prizeTierSchema,
  name: localizedSchema,
  description: localizedSchema,
  estimatedValueMad: integer.min(0).nullable(),
  sponsorName: z.string().nullable(),
  sponsorLogoUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
});
export type PublicPrizeDto = z.infer<typeof publicPrizeSchema>;
export const publicPrizeListSchema = z.object({ items: z.array(publicPrizeSchema) });

export const publicPrizeWinnerSchema = z.object({
  id: uuid,
  tier: z.enum(["gameweek", "monthly", "season"]),
  seasonName: z.string(),
  blockNumber: integer.positive().nullable(),
  firstGameweekNumber: integer.positive(),
  lastGameweekNumber: integer.positive(),
  teamName: z.string(),
  maskedUsername: z.string().nullable(),
  points: integer,
  tieBreak: prizeTieBreakSchema,
  prizeName: localizedSchema,
  awardedAt: z.string(),
});
export type PublicPrizeWinnerDto = z.infer<typeof publicPrizeWinnerSchema>;

const createdCursorSchema = z.object({ createdAt: z.string(), id: uuid });
export type PrizeWinnerCursor = z.infer<typeof createdCursorSchema>;

export const publicPrizeWinnerPageSchema = z.object({
  items: z.array(publicPrizeWinnerSchema),
  nextCursor: createdCursorSchema.nullable(),
});
export type PublicPrizeWinnerPageDto = z.infer<typeof publicPrizeWinnerPageSchema>;

export interface PrizesRepository {
  listPrizes(context: RepositoryContext): Promise<PublicPrizeDto[]>;
  listWinners(
    cursor: PrizeWinnerCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<PublicPrizeWinnerPageDto>;
}

// ---------------------------------------------------------------------------
// Admin
// ---------------------------------------------------------------------------

export const adminPrizeSchema = z.object({
  id: uuid,
  tier: prizeTierSchema,
  nameFr: z.string(),
  nameAr: z.string().nullable(),
  descriptionFr: z.string(),
  descriptionAr: z.string().nullable(),
  estimatedValueMad: integer.min(0).nullable(),
  sponsorName: z.string().nullable(),
  sponsorLogoUrl: z.string().nullable(),
  imageUrl: z.string().nullable(),
  active: z.boolean(),
  updatedAt: z.string(),
});
export type AdminPrizeDto = z.infer<typeof adminPrizeSchema>;
export const adminPrizeListSchema = z.object({ items: z.array(adminPrizeSchema) });

/** What the admin editor submits; `id: null` creates a prize. */
export interface AdminPrizeDraft {
  id: string | null;
  tier: PrizeTier;
  nameFr: string;
  nameAr: string | null;
  descriptionFr: string;
  descriptionAr: string | null;
  estimatedValueMad: number | null;
  sponsorName: string | null;
  sponsorLogoUrl: string | null;
  imageUrl: string | null;
  active: boolean;
}

export const prizeBlockSchema = z.object({
  blockNumber: integer.positive(),
  firstGameweekNumber: integer.positive(),
  lastGameweekNumber: integer.positive(),
});
export type PrizeBlockDto = z.infer<typeof prizeBlockSchema>;

export const adminPrizeSettingsSchema = z.object({
  seasonId: uuid,
  seasonName: z.string(),
  gameweekCount: integer.positive(),
  miniLeagueMinMembers: integer.positive(),
  isDefault: z.boolean(),
  lastFinalizedGameweek: integer.positive().nullable(),
  lastEvaluatedGameweek: integer.positive().nullable(),
  blocks: z.array(prizeBlockSchema),
});
export type AdminPrizeSettingsDto = z.infer<typeof adminPrizeSettingsSchema>;

export const adminPrizeWinnerSchema = z.object({
  id: uuid,
  tier: prizeTierSchema,
  seasonId: uuid,
  seasonName: z.string(),
  periodKey: z.string(),
  blockNumber: integer.positive().nullable(),
  firstGameweekNumber: integer.positive(),
  lastGameweekNumber: integer.positive(),
  leagueId: uuid.nullable(),
  leagueName: z.string().nullable(),
  prizeId: uuid,
  prizeNameFr: z.string(),
  prizeValueMad: integer.nullable(),
  fantasyTeamId: uuid,
  teamName: z.string(),
  userId: uuid,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  email: z.string().nullable(),
  points: integer,
  transfersInPeriod: integer.min(0),
  teamCreatedAt: z.string(),
  tieBreak: prizeTieBreakSchema,
  runnerUpTeamName: z.string().nullable(),
  runnerUpUsername: z.string().nullable(),
  status: prizeWinnerStatusSchema,
  verificationNotes: z.string().nullable(),
  verifiedAt: z.string().nullable(),
  paidAt: z.string().nullable(),
  forfeitedAt: z.string().nullable(),
  overriddenAt: z.string().nullable(),
  supersededByWinnerId: uuid.nullable(),
  overrideOfWinnerId: uuid.nullable(),
  overrideReason: z.string().nullable(),
  flagged: z.boolean(),
  skipped: z.array(
    z.object({
      teamName: z.string(),
      username: z.string().nullable(),
      points: integer,
      reason: prizeSkipReasonSchema,
    }),
  ),
  createdAt: z.string(),
});
export type AdminPrizeWinnerDto = z.infer<typeof adminPrizeWinnerSchema>;

export const adminPrizeWinnerPageSchema = z.object({
  items: z.array(adminPrizeWinnerSchema),
  nextCursor: createdCursorSchema.nullable(),
});
export type AdminPrizeWinnerPageDto = z.infer<typeof adminPrizeWinnerPageSchema>;

export const adminPrizeFlagSchema = z.object({
  userId: uuid,
  username: z.string().nullable(),
  displayName: z.string().nullable(),
  reason: z.string(),
  flaggedAt: z.string(),
});
export type AdminPrizeFlagDto = z.infer<typeof adminPrizeFlagSchema>;
export const adminPrizeFlagListSchema = z.object({ items: z.array(adminPrizeFlagSchema) });
export const adminPrizeFlagResultSchema = z.object({ userId: uuid, flagged: z.boolean() });

/** The status an admin may move a winner to; the database enforces the order. */
export type AdminPrizeWinnerTransition = "verified" | "paid" | "forfeited";

/** Every admin write carries a motive the database audits (8..500 characters). */
export const PRIZE_ADMIN_REASON_MIN = 8;

export interface PrizesAdminRepository {
  listPrizes(context: RepositoryContext): Promise<AdminPrizeDto[]>;
  savePrize(
    draft: AdminPrizeDraft,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeDto>;
  getSettings(seasonId: string | null, context: RepositoryContext): Promise<AdminPrizeSettingsDto>;
  saveSettings(
    input: { seasonId: string; gameweekCount: number; miniLeagueMinMembers: number },
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeSettingsDto>;
  listWinners(
    status: PrizeWinnerStatus | null,
    cursor: PrizeWinnerCursor | null,
    limit: number,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerPageDto>;
  setWinnerStatus(
    winnerId: string,
    status: AdminPrizeWinnerTransition,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto>;
  addWinnerNote(
    winnerId: string,
    note: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto>;
  overrideWinner(
    winnerId: string,
    replacementUsername: string,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<AdminPrizeWinnerDto>;
  listFlags(context: RepositoryContext): Promise<AdminPrizeFlagDto[]>;
  setFlag(
    account: { userId: string } | { username: string },
    flagged: boolean,
    reason: string,
    idempotencyKey: string,
    context: RepositoryContext,
  ): Promise<{ userId: string; flagged: boolean }>;
}

// ---------------------------------------------------------------------------
// Errors
// ---------------------------------------------------------------------------

/**
 * Refusals the prize functions raise by name. Anything else is an access or
 * platform refusal and goes through the console's own `mapAdminError`.
 */
export const PRIZE_ADMIN_ERROR_CODES = [
  "prize_reason_invalid",
  "prize_tier_invalid",
  "prize_name_invalid",
  "prize_description_invalid",
  "prize_value_invalid",
  "prize_sponsor_invalid",
  "prize_url_invalid",
  "prize_status_invalid",
  "prize_settings_invalid",
  "prize_notes_too_long",
  "prize_not_found",
  "prize_winner_not_found",
  "prize_account_not_found",
  "prize_override_team_not_found",
  "prize_tier_already_active",
  "prize_tier_immutable",
  "prize_winner_transition_invalid",
  "prize_winner_not_overridable",
  "prize_override_same_team",
  "prize_override_team_ineligible",
  "prize_settings_conflict",
  "fantasy_season_not_found",
  "validation_failed",
] as const;
export type PrizeAdminErrorCode = (typeof PRIZE_ADMIN_ERROR_CODES)[number];

export class PrizeAdminError extends Error {
  constructor(
    readonly code: PrizeAdminErrorCode,
    readonly cause?: unknown,
  ) {
    super(code, { cause });
    this.name = "PrizeAdminError";
  }
}

/** The prize refusal named in a PostgREST error, or null when there is none. */
export function prizeAdminErrorCode(error: unknown): PrizeAdminErrorCode | null {
  if (error instanceof PrizeAdminError) return error.code;
  const source = error as { message?: unknown } | null;
  const message = typeof source?.message === "string" ? source.message.trim() : "";
  return (PRIZE_ADMIN_ERROR_CODES as readonly string[]).includes(message)
    ? (message as PrizeAdminErrorCode)
    : null;
}
