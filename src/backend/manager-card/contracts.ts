import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { postgresUuidSchema } from "@/backend/contracts/validation";

/**
 * Manager Card (BG-0158): the DTOs of the `api.*` reads in
 * supabase/migrations/20261008123300_manager_card_api.sql.
 *
 * The card is display only: nothing here feeds a prize, a ranking or a league.
 * The shapes are the whole contract. A key the database starts returning is
 * dropped by the parse rather than shown, and a key it stops returning fails
 * loudly instead of rendering as undefined. No user id and no e-mail ever
 * appear: a card is looked up by Fantasy team.
 */

const uuid = postgresUuidSchema;

export const MANAGER_CARD_TIERS = ["homa", "stade", "pro", "champion", "legend"] as const;
export type ManagerCardTier = (typeof MANAGER_CARD_TIERS)[number];

/** Most Fantasy teams one `get_manager_cards` call accepts (distinct ids). */
export const MAX_CARDS_PER_READ = 100;
/** `api.get_my_manager_card_history`: page size bounds and default. */
export const HISTORY_MIN_LIMIT = 1;
export const HISTORY_MAX_LIMIT = 50;
export const HISTORY_DEFAULT_LIMIT = 20;

/** A stat on the card: a whole number 1-99, or null while the season is under the minimum. */
const stat = z.number().int().min(1).max(99).nullable();
const hexColor = z
  .string()
  .regex(/^#[0-9A-Fa-f]{6}$/)
  .nullable();

export const managerCardStatsSchema = z.object({
  /** Captain choices. */
  cap: stat,
  /** Team selection. */
  sel: stat,
  /** Transfers. Null also when the manager made no transfer at all. */
  trf: stat,
  /** Consistency. */
  con: stat,
});
export type ManagerCardStatsDto = z.infer<typeof managerCardStatsSchema>;

export const managerCardClubSchema = z.object({
  id: uuid,
  code: z.string().nullable(),
  shortName: z.object({ fr: z.string(), ar: z.string() }),
  primaryColor: hexColor,
  secondaryColor: hexColor,
});
export type ManagerCardClubDto = z.infer<typeof managerCardClubSchema>;

export const managerCardSchema = z.object({
  fantasyTeamId: uuid,
  /** The profile display name, else the Fantasy team name. */
  name: z.string(),
  handle: z.string().nullable(),
  /** The permanent six-digit number (100000-999999), null before one is assigned. */
  serial: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .nullable(),
  founderCohort: z.number().int().positive().nullable(),
  season: z.object({ id: uuid, label: z.string() }),
  /** Null (with tier and stats) while the season is under the minimum of finished gameweeks. */
  ovr: stat,
  tier: z.enum(MANAGER_CARD_TIERS).nullable(),
  stats: managerCardStatsSchema,
  provisional: z.boolean(),
  gameweeksCounted: z.number().int().nonnegative(),
  rulesVersion: z.number().int().positive(),
  club: managerCardClubSchema.nullable(),
});
export type ManagerCardDto = z.infer<typeof managerCardSchema>;

/** `api.get_my_manager_card` and `api.get_manager_card`: a card, or null (nothing to show). */
export const managerCardResponseSchema = managerCardSchema.nullable();

/** `api.get_manager_cards`: the visible cards, in the order first asked. */
export const managerCardsResponseSchema = z.array(managerCardSchema);

export const managerCardHistoryItemSchema = z.object({
  gameweekSequence: z.number().int().positive(),
  ovr: stat,
  tier: z.enum(MANAGER_CARD_TIERS).nullable(),
  stats: managerCardStatsSchema,
  provisional: z.boolean(),
});
export type ManagerCardHistoryItemDto = z.infer<typeof managerCardHistoryItemSchema>;

export const managerCardHistoryPageSchema = z.object({
  /** Newest gameweek first. */
  items: z.array(managerCardHistoryItemSchema),
  /** Pass as `afterGameweekSequence` for the next page; null on the last page. */
  nextAfter: z.number().int().positive().nullable(),
});
export type ManagerCardHistoryPageDto = z.infer<typeof managerCardHistoryPageSchema>;

export interface ManagerCardHistoryRequest {
  readonly afterGameweekSequence?: number | null;
  readonly limit?: number;
}

export interface ManagerCardRepository {
  /** The caller's card (latest qualifying season), or null. */
  getMyCard(context: RepositoryContext): Promise<ManagerCardDto | null>;
  /** One manager's card, by Fantasy team; null when there is nothing to show. */
  getCard(fantasyTeamId: string, context: RepositoryContext): Promise<ManagerCardDto | null>;
  /** Up to 100 distinct teams; teams without a visible card are left out. */
  getCards(
    fantasyTeamIds: readonly string[],
    context: RepositoryContext,
  ): Promise<readonly ManagerCardDto[]>;
  getMyHistory(
    input: ManagerCardHistoryRequest,
    context: RepositoryContext,
  ): Promise<ManagerCardHistoryPageDto>;
}
