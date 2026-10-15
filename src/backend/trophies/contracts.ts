import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { read, untyped, type CardApi } from "@/backend/premium/card-reads";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

/**
 * BotolaGO+ Trophées, as migrations 20261015150000 to 20261015150200 return them:
 *
 *   api.get_my_trophies(p_season)             the caller's cabinet for a season
 *   api.choose_card_frame(p_code)             the frame drawn around the caller's Manager Card
 *   api.set_trophies_visibility(p_visible)    « Montrer mes trophées » (on by default)
 *   api.get_league_member_trophies(p_league)  the trophies the league mates show, in one private league
 *
 * Visibility: the trophies a manager earned (never points, ratings or tiers) are shown by default to
 * the managers who share a private Fantasy league with them this season; never to strangers, never in
 * public or overall leagues. Looking at them is free and follows the cabinet's own gate.
 *
 * The league podium and the league champion are given at the END of the season: until then they are
 * `progress` (today's rank), never `earned`.
 *
 * Trophées are earned by everyone, by playing: the list is readable by every signed-in manager
 * once BotolaGO+ is on (`member` says whether they hold the subscription, which adds the lit
 * cabinet and the frames). A trophy is never taken back: nothing here has a « withdrawn » state.
 *
 * Every answer is `{ available: false }` (BotolaGO+ off, the card reads off, or preview and not a
 * member) or the cabinet. An answer, not an error; a database the migrations have not reached
 * reads the same way (`PGRST202` is `unavailable`, the Manager Card's own code).
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });

export const TROPHY_FAMILIES = ["paliers", "journees", "decisions", "ligue", "carte"] as const;
export type TrophyFamily = (typeof TROPHY_FAMILIES)[number];

export const earnedTrophySchema = z.object({
  code: z.string(),
  family: z.enum(TROPHY_FAMILIES),
  labelFr: z.string(),
  labelAr: z.string(),
  seasonId: uuid.nullable(),
  gameweekSeq: z.number().int().positive().nullable(),
  /** The figure that earned it, as it was when it was earned (never rewritten by a correction). */
  facts: z.record(z.string(), z.unknown()),
  /** When the result behind it was published. */
  publishedAt: iso,
  earnedAt: iso,
});

export const catalogTrophySchema = z.object({
  code: z.string(),
  family: z.enum(TROPHY_FAMILIES),
  scope: z.enum(["season", "card"]),
  need: z.number().int().positive().nullable(),
  labelFr: z.string(),
  labelAr: z.string(),
});

export const pendingTrophySchema = z.object({
  code: z.string(),
  gameweekSeq: z.number().int().positive(),
  reason: z.literal("ratings_not_published"),
});

export const trophyProgressSchema = z.object({
  code: z.string(),
  /** Null: nothing to count yet (for a rating, the manager is « sans note »). */
  have: z.number().nullable(),
  need: z.number().nullable(),
  unit: z.enum(["gameweeks", "points", "rating", "rank"]),
});

export const cardFrameSchema = z.object({
  code: z.string(),
  trophyCode: z.string().nullable(),
  labelFr: z.string(),
  labelAr: z.string(),
  earned: z.boolean(),
});

const off = z.object({ available: z.literal(false) });

export const trophiesCabinetSchema = z.object({
  available: z.literal(true),
  member: z.boolean(),
  season: z.object({ id: uuid, label: z.string() }).nullable(),
  journeesPlayed: z.number().int().nonnegative(),
  catalog: z.array(catalogTrophySchema),
  earned: z.array(earnedTrophySchema),
  pending: z.array(pendingTrophySchema),
  progress: z.array(trophyProgressSchema),
  frames: z.array(cardFrameSchema),
  chosenFrame: z.string(),
  /** The frame the card is drawn in now: the chosen one only while the subscription lasts. */
  frame: z.string(),
  /** « Montrer mes trophées »: league mates see the trophies earned (default true). */
  showToLeagues: z.boolean(),
});

export const trophiesResponseSchema = z.union([off, trophiesCabinetSchema]);

/** One trophy of a league mate: what it is and when it was published, nothing else. */
export const mateTrophySchema = z.object({
  code: z.string(),
  family: z.enum(TROPHY_FAMILIES),
  labelFr: z.string(),
  labelAr: z.string(),
  gameweekSeq: z.number().int().positive().nullable(),
  publishedAt: iso,
});

/** A league mate who shows trophies and has at least one. `teamId` is the standings row's id. */
export const mateTrophiesSchema = z.object({
  teamId: z.string().min(1),
  count: z.number().int().positive(),
  trophies: z.array(mateTrophySchema).min(1),
});

export const leagueMemberTrophiesSchema = z.union([
  off,
  z.object({
    available: z.literal(true),
    leagueId: z.string().min(1),
    members: z.array(mateTrophiesSchema),
  }),
]);

export const setVisibilityResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), showToLeagues: z.boolean() }),
]);

export const chooseFrameResponseSchema = z.union([
  off,
  z.object({ available: z.literal(true), chosenFrame: z.string(), frame: z.string() }),
]);

export type EarnedTrophy = z.infer<typeof earnedTrophySchema>;
export type CatalogTrophy = z.infer<typeof catalogTrophySchema>;
export type PendingTrophy = z.infer<typeof pendingTrophySchema>;
export type TrophyProgress = z.infer<typeof trophyProgressSchema>;
export type CardFrame = z.infer<typeof cardFrameSchema>;
export type TrophiesCabinet = z.infer<typeof trophiesCabinetSchema>;
export type TrophiesResponse = z.infer<typeof trophiesResponseSchema>;
export type ChooseFrameResponse = z.infer<typeof chooseFrameResponseSchema>;
export type MateTrophy = z.infer<typeof mateTrophySchema>;
export type MateTrophies = z.infer<typeof mateTrophiesSchema>;
export type LeagueMemberTrophiesResponse = z.infer<typeof leagueMemberTrophiesSchema>;
export type SetVisibilityResponse = z.infer<typeof setVisibilityResponseSchema>;

export function isTrophiesCabinet(response: TrophiesResponse): response is TrophiesCabinet {
  return response.available;
}

export interface TrophiesRepository {
  /** `season` is a Fantasy season id or its label (`2026/27`); null is the current season. */
  myTrophies(season: string | null, context: RepositoryContext): Promise<TrophiesResponse>;
  /**
   * A frame that is not `standard` needs the subscription and the trophy it rewards; the database
   * refuses otherwise (`premium_required`, `trophy_not_earned`).
   */
  chooseFrame(code: string, context: RepositoryContext): Promise<ChooseFrameResponse>;
  /** « Montrer mes trophées »: whether the managers of the caller's private leagues see them. */
  setVisibility(visible: boolean, context: RepositoryContext): Promise<SetVisibilityResponse>;
  /**
   * The trophies earned by the caller's mates in one of the caller's private leagues of the
   * season, for those who show them. The database refuses any other league (`league_not_found`).
   */
  leagueMemberTrophies(
    leagueId: string,
    context: RepositoryContext,
  ): Promise<LeagueMemberTrophiesResponse>;
}

/** The Trophées RPCs, through the `api` schema only. */
export class SupabaseTrophiesRepository implements TrophiesRepository {
  constructor(private readonly api: CardApi | null = null) {}

  private client() {
    return untyped(this.api ?? getManagerCardApi());
  }

  myTrophies(season: string | null, context: RepositoryContext): Promise<TrophiesResponse> {
    // Nulls are sent, not omitted: the function is found by its full argument list.
    return read(
      this.client().rpc("get_my_trophies", { p_season: season }),
      trophiesResponseSchema,
      context,
    );
  }

  chooseFrame(code: string, context: RepositoryContext): Promise<ChooseFrameResponse> {
    return read(
      this.client().rpc("choose_card_frame", { p_code: code }),
      chooseFrameResponseSchema,
      context,
    );
  }

  setVisibility(visible: boolean, context: RepositoryContext): Promise<SetVisibilityResponse> {
    return read(
      this.client().rpc("set_trophies_visibility", { p_visible: visible }),
      setVisibilityResponseSchema,
      context,
    );
  }

  leagueMemberTrophies(
    leagueId: string,
    context: RepositoryContext,
  ): Promise<LeagueMemberTrophiesResponse> {
    return read(
      this.client().rpc("get_league_member_trophies", { p_league: leagueId }),
      leagueMemberTrophiesSchema,
      context,
    );
  }
}
