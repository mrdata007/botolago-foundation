import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { type CardApi, read, untyped } from "./card-reads";

/**
 * The BotolaGO+ deadline briefing, as migration 20261015140000 returns it:
 *
 *   api.get_my_deadline_briefing(p_season_id)        the whole briefing in one call
 *   api.get_my_briefing_alternatives(p_player_out)   same-position players within the budget
 *
 * Every answer is one of the usual shapes, checked in this order by the database:
 *   - `{ available: false }`              switched off (BotolaGO+ off, or preview and the caller is
 *                                         not a member). An answer, not an error; a database the
 *                                         migration has not reached reads the same.
 *   - `{ available: true, locked: true }` the caller is not a member. Nothing else comes with it.
 *   - `{ ..., gameweek: null }`           a member with no team or no gameweek open for changes.
 *   - a member's briefing.
 *
 * Display only: nothing here writes, and nothing predicts. The honest limits are in the data:
 *   - an absence is a row the data provider listed, with its date (`absence.asOf`); the app has no
 *     injury feed of its own, and `absenceFeed.listed` says how many absences the provider listed
 *     for the gameweek. Zero means « no list available », never « nobody is absent »;
 *   - a journée not yet published is `pending` with no number; a 5 from an appearance under the
 *     rating rule is `no_rating` with no number (the stored result cannot tell it from a real 5);
 *   - difficulty is our own estimate and carries its confidence.
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const money = z.number().nonnegative();
const sequence = z.number().int().positive();

const off = z.object({ available: z.literal(false) });
/** A non-member: exactly these two keys, no data. */
const locked = z.object({ available: z.literal(true), locked: z.literal(true) }).strict();

export const POSITIONS = ["GK", "DEF", "MID", "FWD"] as const;
export type BriefingPosition = (typeof POSITIONS)[number];

const club = z.object({ id: uuid, shortName: z.string(), name: z.string() });

/** One journée of one player: published points, pending, or published without a rating. */
export const formCellSchema = z.object({
  gameweekSequence: sequence,
  gameweekName: z.string(),
  state: z.enum(["published", "pending", "no_rating"]),
  /** Only when `state` is `published`. */
  points: z.number().int().nullable(),
  /** Minutes played, once published. */
  minutes: z.number().int().nonnegative().nullable(),
  publishedAt: iso.nullable(),
});

export const absenceSchema = z.object({
  category: z.enum(["injury", "suspension"]),
  expectedReturnOn: z.string().nullable(),
  gamesMissed: z.number().int().nonnegative().nullable(),
  /** When the provider last said so. */
  asOf: iso,
  source: z.literal("provider"),
});

export const nextFixtureSchema = z.object({
  opponent: club,
  isHome: z.boolean(),
  difficulty: z.number().int().min(1).max(5),
  confidence: z.enum(["high", "medium", "low"]),
});

export const squadPlayerSchema = z.object({
  fantasyPlayerId: uuid,
  name: z.string(),
  position: z.enum(POSITIONS),
  club,
  price: money,
  salePrice: money,
  /** In the lineup of the gameweek: starter or bench; null when the player is not in it. */
  role: z.enum(["starter", "bench"]).nullable(),
  captain: z.boolean(),
  viceCaptain: z.boolean(),
  form: z.array(formCellSchema),
  absence: absenceSchema.nullable(),
  nextFixture: nextFixtureSchema.nullable(),
});

const publishedGameweek = z.object({
  sequence,
  name: z.string(),
  state: z.enum(["published", "partial", "pending"]),
  publishedAt: iso.nullable(),
});

export const briefingMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  gameweek: z.object({ id: uuid, sequence, name: z.string(), deadlineAt: iso }),
  team: z.object({
    id: uuid,
    name: z.string(),
    bank: money,
    teamValue: money,
    freeTransfers: z.number().int().nonnegative(),
    transferHitCost: z.number().int().nonnegative(),
    maxPerClub: z.number().int().positive(),
    captainMultiplier: z.number().positive(),
  }),
  /** The three journées before this one, oldest first. */
  published: z.array(publishedGameweek),
  absenceFeed: z.object({ listed: z.number().int().nonnegative() }),
  squad: z.array(squadPlayerSchema),
  league: z
    .object({
      id: uuid,
      name: z.string(),
      rank: z.number().int().positive(),
      size: z.number().int().positive(),
      /** The names of the teams ranked above the caller, best first. */
      ahead: z.array(z.string()),
    })
    .nullable(),
});

/** A member with no team, or no gameweek open for changes: an empty state, not an error. */
export const briefingEmptySchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  gameweek: z.null(),
});

export const briefingResponseSchema = z.union([
  off,
  locked,
  briefingEmptySchema,
  briefingMemberSchema,
]);

export const alternativeSchema = z.object({
  fantasyPlayerId: uuid,
  name: z.string(),
  position: z.enum(POSITIONS),
  club,
  price: money,
  /** How many of the club's players the squad would hold after the swap. */
  clubInSquadAfter: z.number().int().positive(),
  form: z.array(formCellSchema),
});

export const alternativesMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  playerOut: uuid,
  budget: z.object({ salePrice: money, bank: money, max: money }),
  maxPerClub: z.number().int().positive(),
  items: z.array(alternativeSchema),
});

export const alternativesResponseSchema = z.union([off, locked, alternativesMemberSchema]);

export type BriefingResponse = z.infer<typeof briefingResponseSchema>;
export type BriefingMember = z.infer<typeof briefingMemberSchema>;
export type BriefingPlayer = z.infer<typeof squadPlayerSchema>;
export type FormCell = z.infer<typeof formCellSchema>;
export type Alternative = z.infer<typeof alternativeSchema>;
export type AlternativesResponse = z.infer<typeof alternativesResponseSchema>;
export type AlternativesMember = z.infer<typeof alternativesMemberSchema>;

export function isBriefingMember(response: BriefingResponse): response is BriefingMember {
  return response.available && !response.locked && response.gameweek !== null;
}
export function isAlternativesMember(
  response: AlternativesResponse,
): response is AlternativesMember {
  return response.available && !response.locked;
}

export interface PremiumBriefingRepository {
  briefing(season: string | null, context: RepositoryContext): Promise<BriefingResponse>;
  /** A player who is not in the caller's squad is `not_found`. */
  alternatives(
    playerOut: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<AlternativesResponse>;
}

/** The deadline briefing RPCs, through the `api` schema only. */
export class SupabasePremiumBriefingRepository implements PremiumBriefingRepository {
  constructor(private readonly api: CardApi | null = null) {}

  briefing(season: string | null, context: RepositoryContext): Promise<BriefingResponse> {
    // Null is sent, not omitted: the function is found by its full argument list.
    return read(
      untyped(this.api ?? getManagerCardApi()).rpc("get_my_deadline_briefing", {
        p_season_id: season,
      }),
      briefingResponseSchema,
      context,
    );
  }

  alternatives(
    playerOut: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<AlternativesResponse> {
    return read(
      untyped(this.api ?? getManagerCardApi()).rpc("get_my_briefing_alternatives", {
        p_player_out: playerOut,
        p_limit: limit,
      }),
      alternativesResponseSchema,
      context,
    );
  }
}
