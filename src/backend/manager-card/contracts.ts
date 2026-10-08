import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { TIER_CODES } from "@/components/manager-card/types";

/**
 * Manager Card DTOs, as the `api.*manager_card*` functions return them
 * (docs/product/MANAGER_CARD_SECTION_PLAN.md section 7.2, verbatim). camelCase,
 * localised names as `{ fr, ar }`.
 *
 * "Switched off" is an answer, not an error: with reads off, or no rules row, a card read answers
 * HTTP 200 `{ available: false }` (the Pépites pattern), never a 4xx, which every browser logs as
 * a console error. `card: null` means the caller has no team this season.
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const localized = z.object({ fr: z.string(), ar: z.string() });
const hex = z.string().regex(/^#[0-9a-fA-F]{6}$/);
const tier = z.enum(TIER_CODES);
const ovr = z.number().int().min(1).max(99);

export const STAT_NULL_REASONS = [
  "pending_minimum",
  "no_transfers",
  "window_open",
  "excluded_weeks_only",
  "board_not_final",
  "pre_captain_fix",
] as const;
export const OVR_NULL_REASONS = ["pending_minimum", "too_few_stats"] as const;
export const RATING_STATES = ["forming", "insufficient", "provisional", "rated"] as const;

export type StatNullReason = (typeof STAT_NULL_REASONS)[number];
export type OvrNullReason = (typeof OVR_NULL_REASONS)[number];
export type RatingState = (typeof RATING_STATES)[number];

export const managerCardStatusSchema = z.object({
  enabled: z.boolean(),
  minRated: z.number().int().positive().nullable(),
  minConfirmed: z.number().int().positive().nullable(),
});

export const cardClubSchema = z.object({
  id: uuid,
  slug: z.string().nullable(),
  code: z.string().nullable(),
  name: localized,
  shortName: localized,
  city: localized.nullable(),
  primaryColor: hex.nullable(),
  secondaryColor: hex.nullable(),
});
const statSchema = z.object({
  value: ovr.nullable(),
  nullReason: z.enum(STAT_NULL_REASONS).nullable(),
});
const statsSchema = z.object({
  cap: statSchema,
  sel: statSchema,
  trf: statSchema,
  con: statSchema,
});

export const momentSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("card_created"),
    key: z.literal("card_created"),
    occurredAt: iso.nullable(),
    seasonLabel: z.string(),
  }),
  z.object({
    kind: z.literal("first_rating"),
    key: z.string().startsWith("first_rating:"),
    occurredAt: iso,
    gameweekSeq: z.number().int(),
    ovr,
    tier,
    provisional: z.boolean(),
    gameweeksCounted: z.number().int(),
    firstEver: z.boolean(),
  }),
  z.object({
    kind: z.literal("provisional_cleared"),
    key: z.string().startsWith("provisional_cleared:"),
    occurredAt: iso,
    gameweekSeq: z.number().int(),
    ovr,
    gameweeksCounted: z.number().int(),
  }),
  z.object({
    kind: z.literal("tier_changed"),
    // `startsWith("tier_changed:")`, narrowed to the four tiers a card can rise to: HOMA is where a
    // card starts, so it is never a change (the backend's moment_key check says the same).
    key: z.string().regex(/^tier_changed:(stade|pro|champion|legend)$/),
    occurredAt: iso,
    tier,
    previousTier: tier.nullable(),
    ovr,
    gameweekSeq: z.number().int(),
    seasonLabel: z.string(),
  }),
  z.object({
    kind: z.literal("founder_granted"),
    key: z.literal("founder_granted"),
    occurredAt: iso,
    cohort: z.number().int(),
    cutoffDate: z.string().date().nullable(),
  }),
  z.object({
    kind: z.literal("season_closed"),
    key: z.string().startsWith("season_closed:"),
    occurredAt: iso,
    seasonLabel: z.string(),
    ovr: ovr.nullable(),
    tier: tier.nullable(),
  }),
  z.object({
    kind: z.literal("season_started"),
    key: z.string().startsWith("season_started:"),
    occurredAt: iso,
    seasonLabel: z.string(),
    previous: z.object({ label: z.string(), ovr: ovr.nullable(), tier: tier.nullable() }),
  }),
]);

export const seasonSummarySchema = z.object({
  seasonId: uuid,
  label: z.string(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  bestTier: tier.nullable(),
  gameweeksCounted: z.number().int().nonnegative(),
  closedAt: iso.nullable(),
});

export const myCardSchema = z.object({
  teamId: uuid,
  name: z.string(),
  handle: z.string().nullable(),
  season: z.object({ id: uuid, label: z.string() }),
  serial: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .nullable(),
  founder: z
    .object({ cohort: z.number().int(), grantedAt: iso, cutoffDate: z.string().date().nullable() })
    .nullable(),
  club: cardClubSchema.nullable(),
  ratingState: z.enum(RATING_STATES),
  ovr: ovr.nullable(),
  ovrNullReason: z.enum(OVR_NULL_REASONS).nullable(),
  tier: tier.nullable(),
  bestTier: tier.nullable(),
  nextTier: z.object({ code: tier, fromOvr: ovr }).nullable(),
  provisional: z.boolean(),
  stats: statsSchema,
  gameweeksCounted: z.number().int().nonnegative(),
  minRated: z.number().int().positive(),
  minConfirmed: z.number().int().positive(),
  rulesVersion: z.string().nullable(),
  throughGameweekSeq: z.number().int().nullable(),
  calculatedAt: iso.nullable(),
  firstCountedGameweekSeq: z.number().int().nullable(),
  firstRatedGameweekSeq: z.number().int().nullable(),
  ratingGameweeks: z.array(z.number().int()).nullable(),
  ratingGameweeksComplete: z.boolean(),
  previousSeason: z
    .object({ label: z.string(), ovr: ovr.nullable(), tier: tier.nullable() })
    .nullable(),
  seasonClosed: z.boolean(),
  seasons: z.array(seasonSummarySchema),
  createdAt: iso.nullable(),
  moments: z.array(momentSchema),
});

export const memberCardSchema = z.object({
  teamId: uuid,
  name: z.string(),
  club: cardClubSchema.nullable(),
  serial: z
    .string()
    .regex(/^[1-9][0-9]{5}$/)
    .nullable(),
  founderCohort: z.number().int().nullable(),
  seasonLabel: z.string(),
  ratingState: z.enum(RATING_STATES),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  stats: z.object({
    cap: ovr.nullable(),
    sel: ovr.nullable(),
    trf: ovr.nullable(),
    con: ovr.nullable(),
  }),
  gameweeksCounted: z.number().int().nonnegative(),
  minRated: z.number().int().positive(),
  firstRatedGameweekSeq: z.number().int().nullable(),
});

export const historyRowSchema = z.object({
  seasonId: uuid,
  seasonLabel: z.string(),
  gameweekSeq: z.number().int(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  gameweeksCounted: z.number().int(),
  stats: z.object({
    cap: ovr.nullable(),
    sel: ovr.nullable(),
    trf: ovr.nullable(),
    con: ovr.nullable(),
  }),
  calculatedAt: iso,
});

const off = z.object({ available: z.literal(false) });
export const myCardResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), card: myCardSchema.nullable() }),
]);
export const cardsResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), cards: z.array(memberCardSchema) }),
]);
export const historyResponseSchema = z.union([
  off,
  z.object({
    available: z.literal(true),
    items: z.array(historyRowSchema),
    nextBeforeSeq: z.number().int().nullable(),
  }),
]);
export const ackResponseSchema = z.object({
  acknowledged: z.array(z.string()),
  ignored: z.array(z.string()),
});

export type ManagerCardStatus = z.infer<typeof managerCardStatusSchema>;
export type CardClubDto = z.infer<typeof cardClubSchema>;
export type MomentDto = z.infer<typeof momentSchema>;
export type MomentKind = MomentDto["kind"];
export type SeasonSummaryDto = z.infer<typeof seasonSummarySchema>;
export type MyCardDto = z.infer<typeof myCardSchema>;
export type MemberCardDto = z.infer<typeof memberCardSchema>;
export type HistoryRowDto = z.infer<typeof historyRowSchema>;
export type MyCardResponse = z.infer<typeof myCardResponseSchema>;
export type CardsResponse = z.infer<typeof cardsResponseSchema>;
export type HistoryResponse = z.infer<typeof historyResponseSchema>;
export type AckResponse = z.infer<typeof ackResponseSchema>;

/** The most team ids one batch read takes, and the most keys one acknowledgement takes. */
export const MAX_CARDS_PER_READ = 100;
export const MAX_ACK_KEYS = 16;

export interface ManagerCardRepository {
  status(context: RepositoryContext): Promise<ManagerCardStatus>;
  myCard(context: RepositoryContext): Promise<MyCardResponse>;
  cards(teamIds: readonly string[], context: RepositoryContext): Promise<CardsResponse>;
  myHistory(
    query: { seasonId: string | null; beforeSeq: number | null; limit: number },
    context: RepositoryContext,
  ): Promise<HistoryResponse>;
  ackMoments(keys: readonly string[], context: RepositoryContext): Promise<AckResponse>;
}
