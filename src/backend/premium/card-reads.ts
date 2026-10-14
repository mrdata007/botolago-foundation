import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { memberCardSchema } from "@/backend/manager-card/contracts";
import { ManagerCardError, mapManagerCardError } from "@/backend/manager-card/errors";
import { TIER_CODES } from "@/components/manager-card/types";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

/**
 * BotolaGO+ premium card reads, as migration 20261013100400 returns them:
 *
 *   api.get_my_card_career(p_season)            « Votre carrière »
 *   api.get_card_duel(p_other_team, p_season)   « Face-à-face+ »
 *   api.set_card_history_visibility(p_visible)  show or hide my history to league mates
 *   api.get_my_card_history_visibility()        the current value
 *
 * Every answer is one of three shapes, checked in this order by the database:
 *   - `{ available: false }`            switched off (BotolaGO+ off, the Manager Card reads off, or
 *                                       preview and the caller is not a member). An answer, not an
 *                                       error; a database the migration has not reached reads the same.
 *   - `{ available: true, locked: true }` the caller is not a member. Nothing else comes with it.
 *   - `{ available: true, locked: false, ... }` a member's data.
 *
 * Display only. Nothing here is a second rating: raw values are plain numbers the screen explains in
 * words. Errors are the Manager Card's (`ManagerCardError`): a duel against anyone who is not a
 * league mate is `not_found`, with no hint why.
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const tier = z.enum(TIER_CODES);
const ovr = z.number().int().min(1).max(99);
const nonNegativeInt = z.number().int().nonnegative();

const off = z.object({ available: z.literal(false) });
/** A non-member: exactly these two keys, no data. */
const locked = z.object({ available: z.literal(true), locked: z.literal(true) }).strict();

const statValues = z.object({
  cap: ovr.nullable(),
  sel: ovr.nullable(),
  trf: ovr.nullable(),
  con: ovr.nullable(),
});
const rawValues = z.object({
  cap: z.number().nullable(),
  sel: z.number().nullable(),
  trf: z.number().nullable(),
  con: z.number().nullable(),
});
const seasonRef = z.object({ id: uuid, label: z.string() });

// ---------------------------------------------------------------------------
// « Votre carrière »
// ---------------------------------------------------------------------------

/** The captain of a week; `share` and `hit` are null when the card skips the week (CAP rules). */
export const careerWeekCaptainSchema = z.object({
  name: z.string(),
  points: z.number().int(),
  bestStarterPoints: z.number().int().nullable(),
  usedVice: z.boolean(),
  share: z.number().nullable(),
  hit: z.boolean().nullable(),
});

export const careerWeekSchema = z.object({
  gameweekSeq: z.number().int().positive(),
  gameweekName: z.string(),
  score: z.number().int(),
  transferHit: nonNegativeInt,
  chip: z.string().nullable(),
  /** The card's figures as of this week; null under the rules' minimum number of counted weeks. */
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  gameweeksCounted: nonNegativeInt,
  stats: statValues,
  raw: rawValues,
  captain: careerWeekCaptainSchema.nullable(),
});

export const careerHeroSchema = z.object({
  firstOvr: ovr,
  firstGameweekSeq: z.number().int().positive(),
  lastOvr: ovr,
  lastGameweekSeq: z.number().int().positive(),
  tier: tier.nullable(),
  provisional: z.boolean(),
});

/** A best or worst week; `topHalf` is the card's CON definition (fewer than half scored more). */
export const careerExtremeWeekSchema = z.object({
  gameweekSeq: z.number().int().positive(),
  score: z.number().int(),
  topHalf: z.boolean(),
  captain: z
    .object({ name: z.string(), points: z.number().int(), usedVice: z.boolean() })
    .nullable(),
});

export const careerCaptainSchema = z.object({
  /** Weeks the card counts for CAP. */
  weeksCounted: nonNegativeInt,
  /** Of those, how many times the captain scored at least as much as the best starter. */
  hits: nonNegativeInt,
  /** The mean share of the best starter's points: the card's raw CAP figure. */
  averageShare: z.number().nullable(),
});

export const careerTransferSchema = z.object({
  gameweekSeq: z.number().int().positive(),
  playerOut: z.string(),
  playerIn: z.string(),
  /** This transfer's share of the batch's points hit. */
  hit: z.number(),
  /** Null while the batch's window is not yet played (`pending`). */
  gain: z.number().nullable(),
  state: z.enum(["counted", "pending"]),
});

export const careerTransfersSchema = z.object({
  items: z.array(careerTransferSchema),
  byGameweek: z.array(
    z.object({
      gameweekSeq: z.number().int().positive(),
      gain: z.number(),
      transfers: z.number().int().positive(),
    }),
  ),
  seasonGain: z.number().nullable(),
  /** The mean of the counted gains: the card's raw TRF figure. */
  averageGain: z.number().nullable(),
  hitsPaid: nonNegativeInt,
  best: careerTransferSchema.nullable(),
  worst: careerTransferSchema.nullable(),
});

export const careerSeasonSchema = z.object({
  seasonId: uuid,
  label: z.string(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  bestTier: tier.nullable(),
  gameweeksCounted: nonNegativeInt,
  stats: statValues,
  closedAt: iso.nullable(),
});

export const careerMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  season: seasonRef.nullable(),
  hero: careerHeroSchema.nullable(),
  weeks: z.array(careerWeekSchema),
  bestWeeks: z.array(careerExtremeWeekSchema),
  worstWeeks: z.array(careerExtremeWeekSchema),
  captain: careerCaptainSchema,
  transfers: careerTransfersSchema,
  seasons: z.array(careerSeasonSchema),
});

export const careerResponseSchema = z.union([off, locked, careerMemberSchema]);

// ---------------------------------------------------------------------------
// « Face-à-face+ »
// ---------------------------------------------------------------------------

const duelSideSchema = z.object({
  score: z.number().int(),
  ovr: ovr.nullable(),
  tier: tier.nullable(),
  provisional: z.boolean(),
  stats: statValues,
});

export const duelWeekSchema = z.object({
  gameweekSeq: z.number().int().positive(),
  gameweekName: z.string(),
  winner: z.enum(["me", "opponent", "tie"]),
  me: duelSideSchema,
  opponent: duelSideSchema,
});

const margin = z.object({ gameweekSeq: z.number().int().positive(), margin: z.number().int() });

export const duelSummarySchema = z.object({
  played: nonNegativeInt,
  meWins: nonNegativeInt,
  opponentWins: nonNegativeInt,
  ties: nonNegativeInt,
  biggestWin: margin.nullable(),
  biggestLoss: margin.nullable(),
  opponentBestCaptain: z
    .object({
      gameweekSeq: z.number().int().positive(),
      name: z.string(),
      points: z.number().int(),
    })
    .nullable(),
});

export const duelMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  season: seasonRef,
  /** The seasons the two share a private league in, newest first: the season switcher. */
  seasons: z.array(z.object({ seasonId: uuid, label: z.string() })),
  me: z.object({ teamId: uuid, card: memberCardSchema.nullable() }),
  opponent: z.object({
    teamId: uuid,
    card: memberCardSchema.nullable(),
    /**
     * Whether the opponent shows their week-by-week history to league mates. False (the default):
     * `weeks` is empty and `summary` null, and only today's card values are in `card`.
     */
    historyVisible: z.boolean(),
  }),
  weeks: z.array(duelWeekSchema),
  summary: duelSummarySchema.nullable(),
});

export const duelResponseSchema = z.union([off, locked, duelMemberSchema]);

// ---------------------------------------------------------------------------
// The privacy switch
// ---------------------------------------------------------------------------

export const historyVisibilityResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), visible: z.boolean() }),
]);

export type CareerResponse = z.infer<typeof careerResponseSchema>;
export type CareerMember = z.infer<typeof careerMemberSchema>;
export type CareerWeek = z.infer<typeof careerWeekSchema>;
export type CareerTransfer = z.infer<typeof careerTransferSchema>;
export type DuelResponse = z.infer<typeof duelResponseSchema>;
export type DuelMember = z.infer<typeof duelMemberSchema>;
export type DuelWeek = z.infer<typeof duelWeekSchema>;
export type HistoryVisibilityResponse = z.infer<typeof historyVisibilityResponseSchema>;

/** `locked: true` is a non-member; `available: false` is the feature switched off. */
export function isCareerMember(response: CareerResponse): response is CareerMember {
  return response.available && !response.locked;
}
export function isDuelMember(response: DuelResponse): response is DuelMember {
  return response.available && !response.locked;
}

export interface PremiumCardReadsRepository {
  /** `season` is a Fantasy season id or its label (`2026/27`); null is the current season. */
  career(season: string | null, context: RepositoryContext): Promise<CareerResponse>;
  /** Anyone who is not a league mate in the season compared is `not_found`, with no hint why. */
  duel(
    otherTeamId: string,
    season: string | null,
    context: RepositoryContext,
  ): Promise<DuelResponse>;
  setHistoryVisibility(
    visible: boolean,
    context: RepositoryContext,
  ): Promise<HistoryVisibilityResponse>;
  historyVisibility(context: RepositoryContext): Promise<HistoryVisibilityResponse>;
}

// ---------------------------------------------------------------------------
// The Supabase repository
// ---------------------------------------------------------------------------

type CardApi = ReturnType<typeof getManagerCardApi>;
type RpcResult = { data: unknown; error: PostgrestError | null };
type RpcRequest = PromiseLike<RpcResult> & {
  abortSignal(signal: AbortSignal): PromiseLike<RpcResult>;
};

/**
 * The one typed cast: `src/backend/generated/database.types.ts` is a CI artifact and does not know
 * these functions until the backend PR regenerates it. Remove the cast once the types exist.
 */
interface UntypedApi {
  rpc(name: string, args?: Record<string, unknown>): RpcRequest;
}
const untyped = (api: CardApi): UntypedApi => api as unknown as UntypedApi;

const OFF = { available: false } as const;

function parse<T>(schema: { parse(value: unknown): T }, value: unknown): T {
  try {
    return schema.parse(value);
  } catch (error) {
    throw new ManagerCardError(
      "data_unavailable",
      "The BotolaGO+ card API returned an invalid DTO.",
      error,
    );
  }
}

/** A read. A database the migration has not reached answers like the feature switched off. */
async function read<T>(
  request: RpcRequest,
  schema: { parse(value: unknown): T },
  context: RepositoryContext,
): Promise<T | typeof OFF> {
  try {
    let response: RpcResult;
    try {
      response = await (context.signal ? request.abortSignal(context.signal) : request);
    } catch (error) {
      throw mapManagerCardError(error);
    }
    if (response.error) throw mapManagerCardError(response.error);
    return parse(schema, response.data);
  } catch (error) {
    if (error instanceof ManagerCardError && error.code === "unavailable") return OFF;
    throw error;
  }
}

/** The BotolaGO+ card RPCs, through the `api` schema only. */
export class SupabasePremiumCardReadsRepository implements PremiumCardReadsRepository {
  constructor(private readonly api: CardApi | null = null) {}

  private client(): UntypedApi {
    return untyped(this.api ?? getManagerCardApi());
  }

  career(season: string | null, context: RepositoryContext): Promise<CareerResponse> {
    // Null is sent, not omitted: the function is found by its full argument list.
    return read(
      this.client().rpc("get_my_card_career", { p_season: season }),
      careerResponseSchema,
      context,
    );
  }

  duel(
    otherTeamId: string,
    season: string | null,
    context: RepositoryContext,
  ): Promise<DuelResponse> {
    return read(
      this.client().rpc("get_card_duel", { p_other_team: otherTeamId, p_season: season }),
      duelResponseSchema,
      context,
    );
  }

  setHistoryVisibility(
    visible: boolean,
    context: RepositoryContext,
  ): Promise<HistoryVisibilityResponse> {
    return read(
      this.client().rpc("set_card_history_visibility", { p_visible: visible }),
      historyVisibilityResponseSchema,
      context,
    );
  }

  historyVisibility(context: RepositoryContext): Promise<HistoryVisibilityResponse> {
    return read(
      this.client().rpc("get_my_card_history_visibility"),
      historyVisibilityResponseSchema,
      context,
    );
  }
}
