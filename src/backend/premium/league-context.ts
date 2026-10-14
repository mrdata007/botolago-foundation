import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { type CardApi, read, untyped } from "./card-reads";

/**
 * BotolaGO+ league context, as migration 20261014150000 returns it:
 *
 *   api.get_card_league_context(p_league, p_season, p_rival_team)
 *
 * The caller (and, in a duel, a rival) set against one private league of the season: per journée
 * the league average and best score, the caller's rank and movement, the captain's average points
 * and the ratings' average and rank; for the season the totals, the captain and transfer averages
 * and today's ratings with their ranks. A separate read from the career and the duel
 * (`card-reads.ts`), whose contracts are unchanged.
 *
 * Every answer is one of four shapes, checked in this order by the database:
 *   - `{ available: false }`              switched off (BotolaGO+ off, the Manager Card reads off, or
 *                                         preview and the caller is not a member). An answer, not an
 *                                         error; a database the migration has not reached reads the same.
 *   - `{ available: true, locked: true }` the caller is not a member. Nothing else comes with it.
 *   - `{ ..., league: null }`             a member with no private league that season: an empty state.
 *   - `{ ..., league: {...} }`            a member's data.
 *
 * Which league: the one named (`league`: an id of an active private league the caller is in), else
 * the caller's league of the season with the most members, then the lowest id: the first one the
 * leagues list shows. The Curva page remembers its choice on the device, so the screen passes it.
 *
 * Errors are the Manager Card's (`ManagerCardError`): a league the caller is not in is `not_found`
 * (`card_league_not_found`), and so is a rival who is not a mate of that league (`card_duel_not_found`),
 * with no hint why.
 *
 * Averages of fewer than `minGroup` managers are null for the figures the standings do not already
 * show (captain points, net transfers, the ratings history): `contributors` and `rated` say how many
 * there were. The rival's week-by-week figures (`weeks[].rival`, `rival.captain`, `rival.transfers`)
 * are there only when they switched their card history on (`rival.historyVisible`); their total, rank
 * and today's ratings are always there.
 */

const uuid = z.string().uuid();
const count = z.number().int().nonnegative();
const seq = z.number().int().positive();
const points = z.number().int();
const mean = z.number().nullable();

const off = z.object({ available: z.literal(false) });
/** A non-member: exactly these two keys, no data. */
const locked = z.object({ available: z.literal(true), locked: z.literal(true) }).strict();
const seasonRef = z.object({ id: uuid, label: z.string() });

/** The five ratings the card shows, in the database's lower-case keys. */
export const LEAGUE_RATING_KEYS = ["cap", "sel", "trf", "con", "ovr"] as const;
export type LeagueRatingKey = (typeof LEAGUE_RATING_KEYS)[number];

function byRating<T extends z.ZodTypeAny>(shape: T) {
  return z.object({ cap: shape, sel: shape, trf: shape, con: shape, ovr: shape });
}

const rating = z.number().int().min(1).max(99);
const rank = z.number().int().positive().nullable();

const leagueRef = z.object({ id: uuid, name: z.string(), members: count, ranked: count });

const totals = z.object({
  /** Managers with a final result so far. */
  ranked: count,
  leagueAverage: mean,
  leaderTotal: points.nullable(),
});

const captainLeague = z.object({ contributors: count, leagueAverage: mean });

const transfersLeague = z.object({
  /** Managers with at least one counted transfer. */
  contributors: count,
  /** The mean net gain of those; null under `minGroup` managers. */
  leagueAverage: mean,
  /** The mean over every ranked manager, no transfer counting 0; null under `minGroup`. */
  leagueAverageAll: mean,
});

const ratingsLeague = byRating(z.object({ rated: count, average: mean }));

const captainTotal = z.object({ points, weeks: count });

/** Net is the card's TRF gains summed (after each transfer's share of the hit); gross is before it. */
const transfersTotal = z.object({
  net: z.number(),
  gross: z.number(),
  hitsPaid: count,
  transfers: count,
  counted: count,
});

const ratingNow = byRating(z.object({ value: rating.nullable(), rank }));

export const leagueManagerSchema = z.object({
  teamId: uuid.nullable(),
  total: points.nullable(),
  rank,
  captain: captainTotal.nullable(),
  transfers: transfersTotal.nullable(),
  ratings: ratingNow,
});

export const leagueRivalSchema = leagueManagerSchema.extend({
  /** Whether the rival shows their week-by-week history to league mates. False: no weekly figures. */
  historyVisible: z.boolean(),
});

const weekMe = z.object({
  score: points.nullable(),
  rank,
  previousRank: rank,
  /** Places gained since the journée before (positive is up); null on the first journée. */
  movement: z.number().int().nullable(),
});

const weekRival = z.object({
  score: points.nullable(),
  rank,
  movement: z.number().int().nullable(),
  captain: points.nullable(),
  ratings: byRating(z.object({ value: rating.nullable(), rank })),
});

export const leagueWeekSchema = z.object({
  gameweekSeq: seq,
  gameweekName: z.string(),
  /** Managers who scored in the journée; `ranked` is those with a total through it. */
  scored: count,
  ranked: count.nullable(),
  leagueAverage: mean,
  leagueBest: points.nullable(),
  me: weekMe.nullable(),
  captain: z.object({ contributors: count, leagueAverage: mean, me: points.nullable() }),
  /** The card's figures as of the journée: null under the rules' minimum of counted weeks. */
  ratings: byRating(z.object({ rated: count, average: mean, me: rating.nullable(), rank })),
  rival: weekRival.nullable(),
});

export const leagueContextMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  season: seasonRef,
  league: leagueRef,
  /** Averages of fewer managers than this are null. */
  minGroup: z.number().int().positive(),
  totals,
  captain: captainLeague,
  transfers: transfersLeague,
  ratings: ratingsLeague,
  me: leagueManagerSchema,
  rival: leagueRivalSchema.nullable(),
  weeks: z.array(leagueWeekSchema),
});

/** A member with no private league of the season. */
export const leagueContextNoLeagueSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  season: seasonRef.nullable(),
  league: z.null(),
});

export const leagueContextResponseSchema = z.union([
  off,
  locked,
  leagueContextNoLeagueSchema,
  leagueContextMemberSchema,
]);

export type LeagueContextResponse = z.infer<typeof leagueContextResponseSchema>;
export type LeagueContextMember = z.infer<typeof leagueContextMemberSchema>;
export type LeagueContextWeek = z.infer<typeof leagueWeekSchema>;
export type LeagueManager = z.infer<typeof leagueManagerSchema>;
export type LeagueRival = z.infer<typeof leagueRivalSchema>;

/** `league` set is a member's data; `league: null` is a member with no league; else off or locked. */
export function isLeagueContextMember(
  response: LeagueContextResponse,
): response is LeagueContextMember {
  return response.available && !response.locked && response.league !== null;
}

// ---------------------------------------------------------------------------
// Mapper: the shape the member screens draw from
// ---------------------------------------------------------------------------

export type LeagueRatingCode = "CAP" | "SEL" | "TRF" | "CON" | "OVR";
const CODE: Record<LeagueRatingKey, LeagueRatingCode> = {
  cap: "CAP",
  sel: "SEL",
  trf: "TRF",
  con: "CON",
  ovr: "OVR",
};

/** One value per journée played, in order, with the journée numbers alongside. */
export interface LeagueSeries {
  /** The journées the league played (evaluable gameweeks), in order. */
  gameweeks: number[];
  leagueSize: number;
  /** League average and best score per journée; null where no manager scored. */
  leagueAvg: Array<number | null>;
  leagueBest: Array<number | null>;
  /** The caller's rank after each journée, and the places gained over the journée before. */
  youRank: Array<number | null>;
  youMovement: Array<number | null>;
  /** The rival's, only when they show their history (else null). */
  rivalRank: Array<number | null> | null;
  /** The league's average captain points per journée (null under the minimum group). */
  leagueCaptainByWeek: Array<number | null>;
  youCaptainByWeek: Array<number | null>;
  rivalCaptainByWeek: Array<number | null> | null;
  /** Season: the leader's total, the league's average total, the caller's total and rank. */
  leaderTotal: number | null;
  leagueTotal: number | null;
  youTotal: number | null;
  youSeasonRank: number | null;
  /** The league's average captain points and net transfer gain over the season (null under the minimum). */
  leagueCaptain: number | null;
  leagueNetTransfers: number | null;
  /** Today's ratings: the league average, the caller's rank, the rival's value and rank. */
  leagueRating: Record<LeagueRatingCode, number | null>;
  ratingRank: Record<LeagueRatingCode, number | null>;
  rivalRating: Record<LeagueRatingCode, number | null> | null;
  rivalRatingRank: Record<LeagueRatingCode, number | null> | null;
  /** The ratings' history per journée: the caller's value, the league average and the caller's rank. */
  ratingsByWeek: Record<
    LeagueRatingCode,
    Array<{ value: number | null; leagueAverage: number | null; rank: number | null }>
  >;
  /** The caller's own season figures: the captain's points and the transfers' gross and net. */
  youSeason: {
    captain: number | null;
    netTransfers: number | null;
    grossTransfers: number | null;
    hitsPaid: number | null;
    transfers: number | null;
  };
  /** The rival's figures for the season; null while they hide their history. */
  rivalSeason: {
    total: number | null;
    rank: number | null;
    captain: number | null;
    netTransfers: number | null;
    grossTransfers: number | null;
    hitsPaid: number | null;
    transfers: number | null;
  } | null;
  historyVisible: boolean | null;
}

function record<T>(pick: (key: LeagueRatingKey) => T): Record<LeagueRatingCode, T> {
  return Object.fromEntries(LEAGUE_RATING_KEYS.map((key) => [CODE[key], pick(key)])) as Record<
    LeagueRatingCode,
    T
  >;
}

/** Arranges a member's answer as series aligned on the journées played; computes nothing new. */
export function toLeagueSeries(answer: LeagueContextMember): LeagueSeries {
  const weeks = answer.weeks;
  const rival = answer.rival;
  const shown = rival?.historyVisible === true;
  return {
    gameweeks: weeks.map((week) => week.gameweekSeq),
    leagueSize: answer.league.members,
    leagueAvg: weeks.map((week) => week.leagueAverage),
    leagueBest: weeks.map((week) => week.leagueBest),
    youRank: weeks.map((week) => week.me?.rank ?? null),
    youMovement: weeks.map((week) => week.me?.movement ?? null),
    rivalRank: shown ? weeks.map((week) => week.rival?.rank ?? null) : null,
    leagueCaptainByWeek: weeks.map((week) => week.captain.leagueAverage),
    youCaptainByWeek: weeks.map((week) => week.captain.me),
    rivalCaptainByWeek: shown ? weeks.map((week) => week.rival?.captain ?? null) : null,
    leaderTotal: answer.totals.leaderTotal,
    leagueTotal: answer.totals.leagueAverage,
    youTotal: answer.me.total,
    youSeasonRank: answer.me.rank,
    leagueCaptain: answer.captain.leagueAverage,
    leagueNetTransfers: answer.transfers.leagueAverage,
    leagueRating: record((key) => answer.ratings[key].average),
    ratingRank: record((key) => answer.me.ratings[key].rank),
    rivalRating: rival ? record((key) => rival.ratings[key].value) : null,
    rivalRatingRank: rival ? record((key) => rival.ratings[key].rank) : null,
    ratingsByWeek: record((key) =>
      weeks.map((week) => ({
        value: week.ratings[key].me,
        leagueAverage: week.ratings[key].average,
        rank: week.ratings[key].rank,
      })),
    ),
    youSeason: {
      captain: answer.me.captain?.points ?? null,
      netTransfers: answer.me.transfers?.net ?? null,
      grossTransfers: answer.me.transfers?.gross ?? null,
      hitsPaid: answer.me.transfers?.hitsPaid ?? null,
      transfers: answer.me.transfers?.transfers ?? null,
    },
    rivalSeason: shown
      ? {
          total: rival.total,
          rank: rival.rank,
          captain: rival.captain?.points ?? null,
          netTransfers: rival.transfers?.net ?? null,
          grossTransfers: rival.transfers?.gross ?? null,
          hitsPaid: rival.transfers?.hitsPaid ?? null,
          transfers: rival.transfers?.transfers ?? null,
        }
      : null,
    historyVisible: rival ? rival.historyVisible : null,
  };
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export interface LeagueContextRequest {
  /** An id of a private league the caller is in; null is the caller's default league. */
  league?: string | null;
  /** A Fantasy season id or its label (`2026/27`); null is the current season. */
  season?: string | null;
  /** A league mate's Fantasy team id, for the duel; null is no rival. */
  rivalTeam?: string | null;
}

export interface PremiumLeagueContextRepository {
  /** A league the caller is not in, or a rival who is not a mate of it, is `not_found`. */
  leagueContext(
    request: LeagueContextRequest,
    context: RepositoryContext,
  ): Promise<LeagueContextResponse>;
}

/** The BotolaGO+ league context RPC, through the `api` schema only. */
export class SupabasePremiumLeagueContextRepository implements PremiumLeagueContextRepository {
  constructor(private readonly api: CardApi | null = null) {}

  leagueContext(
    request: LeagueContextRequest,
    context: RepositoryContext,
  ): Promise<LeagueContextResponse> {
    // Nulls are sent, not omitted: the function is found by its full argument list.
    const client = untyped(this.api ?? getManagerCardApi());
    return read(
      client.rpc("get_card_league_context", {
        p_league: request.league ?? null,
        p_season: request.season ?? null,
        p_rival_team: request.rivalTeam ?? null,
      }),
      leagueContextResponseSchema,
      context,
    );
  }
}
