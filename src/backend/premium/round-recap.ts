import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { type CardApi, read, untyped } from "./card-reads";

/**
 * BotolaGO+ round recap (« Votre journée expliquée »), as migration 20261015120000 returns it:
 *
 *   api.get_round_recap(p_gameweek, p_league)
 *
 * One journée of the caller's own team, explained against ONE private league: the score and its
 * parts, the eleven and the bench with their published points, the effective captain, the journée's
 * transfers with this journée's points of the player out and in, and the gap to the league average.
 * Display only; nothing here is a second score.
 *
 * Every answer is one of four shapes, checked in this order by the database:
 *   - `{ available: false }`              switched off (BotolaGO+ off, the Manager Card reads off, or
 *                                         preview and the caller is not a member). An answer, not an
 *                                         error; a database the migration has not reached reads the same.
 *   - `{ available: true, locked: true }` the caller is not a member. Nothing else comes with it.
 *   - `{ ..., gameweek: null }`           a member with no journée to explain yet: an empty state.
 *   - `{ ..., gameweek: {...} }`          a member's data.
 *
 * POINTS, NEVER RATINGS. The read serves points. It does not say which fantasy points came from a
 * real rating and which from the 5 given to a player who appeared without one, so a screen never
 * shows a number from here as a rating. A player whose points are not published yet is `pending`
 * with `points: null`: « en attente », never a fallback number.
 *
 * Errors are the Manager Card's (`ManagerCardError`): a journée the caller's team has no result for
 * and a league the caller is not in are `not_found`, with no hint why.
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const seq = z.number().int().positive();
const points = z.number().int();

const off = z.object({ available: z.literal(false) });
/** A non-member: exactly these two keys, no data. */
const locked = z.object({ available: z.literal(true), locked: z.literal(true) }).strict();

export const recapPlayerSchema = z.object({
  fantasyPlayerId: uuid,
  name: z.string(),
  /** The Fantasy position code: GK, DEF, MID or FWD. */
  position: z.string(),
  slot: z.enum(["starter", "bench"]),
  order: z.number().int().positive(),
  captain: z.boolean(),
  viceCaptain: z.boolean(),
  /** In the counted eleven, after the automatic substitutions. */
  onPitch: z.boolean(),
  /** Counted in the score: the eleven, and the whole bench under Bench Boost. */
  counted: z.boolean(),
  /** No published points yet: `points` is null and the screen says « en attente ». */
  pending: z.boolean(),
  points: points.nullable(),
  minutes: count,
  played: z.boolean(),
});

export const recapCaptainSchema = z.object({
  fantasyPlayerId: uuid,
  name: z.string(),
  /** Counted over points; null when the player scored nothing. */
  multiplier: z.number().int().nullable(),
  usedVice: z.boolean(),
  pending: z.boolean(),
  points: points.nullable(),
  /** The points that counted: his points plus the captain bonus. */
  counted: points.nullable(),
  /** Counted points minus the league's average counted captain; null under the minimum group. */
  vsLeague: z.number().nullable(),
});

export const recapTransferSchema = z.object({
  playerOutId: uuid,
  playerInId: uuid,
  playerOut: z.string(),
  playerIn: z.string(),
  outPoints: points.nullable(),
  inPoints: points.nullable(),
  /** This transfer's share of the batch's points hit. */
  hitShare: z.number(),
  pending: z.boolean(),
  gain: z.number().nullable(),
  /** The gain after the hit share. */
  net: z.number().nullable(),
});

const recapGameweekSchema = z.object({
  id: uuid,
  seq,
  name: z.string(),
  status: z.string(),
  /** Every score of the journée is final. False while ratings are still arriving. */
  settled: z.boolean(),
  corrected: z.boolean(),
  calculationVersion: z.number().int().positive(),
  /** When the result was published; null while it is not final. */
  publishedAt: iso.nullable(),
});

const recapListItemSchema = z.object({
  id: uuid,
  seq,
  name: z.string(),
  status: z.string(),
  settled: z.boolean(),
});

export const recapMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  /** Averages of fewer managers than this are null. */
  minGroup: z.number().int().positive(),
  league: z.object({ id: uuid, name: z.string(), members: count }).nullable(),
  /** The journées that can be explained, newest first. */
  gameweeks: z.array(recapListItemSchema),
  gameweek: recapGameweekSchema,
  me: z.object({
    /** The final score, or the provisional one while the journée is not settled. */
    score: points,
    startingPoints: points,
    benchPoints: points,
    captainBonus: points,
    transferHit: count,
    chip: z.string().nullable(),
    rank: z.number().int().positive().nullable(),
    previousRank: z.number().int().positive().nullable(),
    /** Places gained since the journée before (positive is up). */
    movement: z.number().int().nullable(),
  }),
  leagueFigures: z
    .object({
      scored: count,
      average: z.number().nullable(),
      best: points.nullable(),
      settled: z.boolean(),
      captainAverage: z.number().nullable(),
    })
    .nullable(),
  explain: z.object({
    vsLeague: z.number().nullable(),
    captain: recapCaptainSchema.nullable(),
    transfers: z.array(recapTransferSchema),
    transfersNet: z.number().nullable(),
    /** « Vos autres choix »: a remainder, not a per-player measure. */
    others: z.number().nullable(),
    othersIsRemainder: z.literal(true),
  }),
  players: z.array(recapPlayerSchema),
  autoSubstitutions: z.array(
    z.object({ playerOut: z.string(), playerIn: z.string(), reason: z.string() }),
  ),
  pendingPlayers: count,
});

/** A member with no journée to explain yet (no team, or nothing past the matches). */
export const recapEmptySchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  gameweek: z.null(),
  gameweeks: z.array(recapListItemSchema),
});

export const recapResponseSchema = z.union([off, locked, recapEmptySchema, recapMemberSchema]);

export type RoundRecapResponse = z.infer<typeof recapResponseSchema>;
export type RoundRecapMember = z.infer<typeof recapMemberSchema>;
export type RecapPlayer = z.infer<typeof recapPlayerSchema>;
export type RecapTransfer = z.infer<typeof recapTransferSchema>;

/** A member's data, as opposed to off, locked or the empty state. */
export function isRoundRecapMember(response: RoundRecapResponse): response is RoundRecapMember {
  return (
    response.available &&
    !response.locked &&
    (response as { gameweek: unknown }).gameweek !== null &&
    "me" in response
  );
}

// ---------------------------------------------------------------------------
// The shape the screen draws from
// ---------------------------------------------------------------------------

/** The pitch rows from the attack down to the goalkeeper. */
export const PITCH_ROWS = ["FWD", "MID", "DEF", "GK"] as const;
export type PitchRow = (typeof PITCH_ROWS)[number];

/** Which cause of the gap a player's chip belongs to. */
export type RecapCause = "captain" | "transfer" | "others";

export interface RecapChip extends RecapPlayer {
  cause: RecapCause;
}

export interface RoundRecapView {
  gameweekId: string;
  seq: number;
  /** All journées that can be explained, newest first. */
  journees: Array<{ id: string; seq: number; settled: boolean }>;
  settled: boolean;
  corrected: boolean;
  publishedAt: string | null;
  calculationVersion: number;
  league: { name: string; members: number } | null;
  score: number;
  startingPoints: number;
  benchPoints: number;
  captainBonus: number;
  transferHit: number;
  chip: string | null;
  /** The parts add up to the score (starters, Bench Boost bench, captain bonus, minus the hit). */
  reconciled: boolean;
  rank: number | null;
  movement: number | null;
  /** The league average (null under the minimum group or without a league) and the best score. */
  average: number | null;
  best: number | null;
  vsLeague: number | null;
  captain: RoundRecapMember["explain"]["captain"];
  transfers: RecapTransfer[];
  transfersNet: number | null;
  others: number | null;
  /** The eleven by row, attack first; players keep their order within a row. */
  pitch: Array<{ row: PitchRow; chips: RecapChip[] }>;
  /** Everyone who is not in the counted eleven. */
  bench: RecapPlayer[];
  pendingPlayers: number;
  autoSubstitutions: number;
}

/**
 * Arranges a member's answer for the screen. It computes nothing about the game: the causes are the
 * database's, and « reconciled » only checks that the stored parts add up so a breakdown is never
 * shown that could count something twice.
 */
export function toRoundRecapView(answer: RoundRecapMember): RoundRecapView {
  const { me, explain, gameweek, leagueFigures } = answer;
  const transferIn = new Set(explain.transfers.map((transfer) => transfer.playerInId));
  const captainId = explain.captain?.fantasyPlayerId ?? null;
  const causeOf = (player: RecapPlayer): RecapCause =>
    player.fantasyPlayerId === captainId
      ? "captain"
      : transferIn.has(player.fantasyPlayerId)
        ? "transfer"
        : "others";
  const onPitch = answer.players.filter((player) => player.onPitch);
  const known = new Set<string>(PITCH_ROWS);
  const pitch = PITCH_ROWS.map((row) => ({
    row,
    chips: onPitch
      .filter((player) => (known.has(player.position) ? player.position : "MID") === row)
      .sort((a, b) => a.order - b.order)
      .map((player) => ({ ...player, cause: causeOf(player) })),
  })).filter((line) => line.chips.length > 0);
  const benchBoost = me.chip === "bench_boost";
  return {
    gameweekId: gameweek.id,
    seq: gameweek.seq,
    journees: answer.gameweeks.map(({ id, seq: n, settled }) => ({ id, seq: n, settled })),
    settled: gameweek.settled,
    corrected: gameweek.corrected,
    publishedAt: gameweek.publishedAt,
    calculationVersion: gameweek.calculationVersion,
    league: answer.league ? { name: answer.league.name, members: answer.league.members } : null,
    score: me.score,
    startingPoints: me.startingPoints,
    benchPoints: me.benchPoints,
    captainBonus: me.captainBonus,
    transferHit: me.transferHit,
    chip: me.chip,
    reconciled:
      me.startingPoints + (benchBoost ? me.benchPoints : 0) + me.captainBonus - me.transferHit ===
      me.score,
    rank: me.rank,
    movement: me.movement,
    average: leagueFigures?.average ?? null,
    best: leagueFigures?.best ?? null,
    vsLeague: explain.vsLeague,
    captain: explain.captain,
    transfers: explain.transfers,
    transfersNet: explain.transfersNet,
    others: explain.others,
    pitch,
    bench: answer.players.filter((player) => !player.onPitch).sort((a, b) => a.order - b.order),
    pendingPlayers: answer.pendingPlayers,
    autoSubstitutions: answer.autoSubstitutions.length,
  };
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export interface RoundRecapRequest {
  /** A journée of the current season the caller's team has a result for; null is the latest. */
  gameweek?: string | null;
  /** An id of a private league the caller is in; null is the caller's default league. */
  league?: string | null;
}

export interface PremiumRoundRecapRepository {
  /** A journée or a league that is not the caller's is `not_found`, with no hint why. */
  roundRecap(request: RoundRecapRequest, context: RepositoryContext): Promise<RoundRecapResponse>;
}

/** The BotolaGO+ round recap RPC, through the `api` schema only. */
export class SupabasePremiumRoundRecapRepository implements PremiumRoundRecapRepository {
  constructor(private readonly api: CardApi | null = null) {}

  roundRecap(request: RoundRecapRequest, context: RepositoryContext): Promise<RoundRecapResponse> {
    // Nulls are sent, not omitted: the function is found by its full argument list.
    const client = untyped(this.api ?? getManagerCardApi());
    return read(
      client.rpc("get_round_recap", {
        p_gameweek: request.gameweek ?? null,
        p_league: request.league ?? null,
      }),
      recapResponseSchema,
      context,
    );
  }
}
