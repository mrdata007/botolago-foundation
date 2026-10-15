import { z } from "zod";

import type { RepositoryContext } from "@/backend/contracts/repository";
import { ManagerCardError } from "@/backend/manager-card/errors";
import { getManagerCardApi } from "@/integrations/supabase/v2-client";

import { type CardApi, read, untyped } from "./card-reads";

/**
 * BotolaGO+ Rivaux, as migrations 20261015130100 and 20261015130200 return it:
 *
 *   api.get_my_rivals(p_season)               the pinned rivals, each with a head-to-head
 *   api.get_rival_candidates(p_season)        the league mates a member could pin
 *   api.pin_rival(p_rival_team, p_season)     pin one (at most three)
 *   api.unpin_rival(p_rival_team, p_season)   remove one
 *   api.set_rivals_notify(p_enabled)          the optional lead-change notification (off by default)
 *
 * Every answer is one of three shapes, checked in this order by the database:
 *   - `{ available: false }`              switched off (BotolaGO+ off, the Manager Card reads off, or
 *                                         preview and the caller is not a member). An answer, not an
 *                                         error; a database the migration has not reached reads the same.
 *   - `{ available: true, locked: true }` the caller is not a member. Nothing else comes with it.
 *   - `{ available: true, locked: false, ... }` a member's data.
 *
 * Display only. Every figure is a sum of final results Fantasy already stored, so a journée appears
 * only once it is published (`publishedAt`); nothing here is a rating. A friend's captain and last
 * transfer are present only when that friend shares their card history (`historyVisible`).
 */

const uuid = z.string().uuid();
const iso = z.string().datetime({ offset: true });
const count = z.number().int().nonnegative();
const seq = z.number().int().positive();
const points = z.number().int();

const off = z.object({ available: z.literal(false) });
/** A non-member: exactly these two keys, no data. */
const locked = z.object({ available: z.literal(true), locked: z.literal(true) }).strict();

export const LEADERS = ["me", "rival", "tie"] as const;
export type Leader = (typeof LEADERS)[number];
const leader = z.enum(LEADERS).nullable();

const leagueRef = z.object({ id: uuid, name: z.string() });

/** The last published journée of a pair: both scores, both totals, who led before and after. */
export const rivalLastSchema = z.object({
  seq,
  name: z.string(),
  publishedAt: iso.nullable(),
  /** Set when a published result was corrected afterwards. */
  correctedAt: iso.nullable(),
  me: points.nullable(),
  rival: points.nullable(),
  meTotal: points.nullable(),
  rivalTotal: points.nullable(),
  leader,
  leaderBefore: leader,
});

export const rivalWeekSchema = z.object({
  seq,
  me: points.nullable(),
  rival: points.nullable(),
});

const captainSide = z.object({ name: z.string().nullable(), points: points.nullable() }).nullable();

export const rivalSchema = z.object({
  teamId: uuid,
  /** The name the league already shows to its members: the full name. */
  name: z.string(),
  /** The place (1 to 3) the rival holds on the board. */
  position: z.number().int().min(1).max(3),
  league: leagueRef,
  /** Whether the friend shares their card history: only then do captain and transfer come back. */
  historyVisible: z.boolean(),
  last: rivalLastSchema.nullable(),
  tally: z.object({ played: count, won: count, lost: count, tied: count }),
  biggestWin: z.object({ seq, me: points, rival: points, margin: points }).nullable(),
  weeks: z.array(rivalWeekSchema),
  captain: z.object({ me: captainSide, rival: captainSide }).nullable(),
  transfer: z
    .object({
      playerIn: z.string(),
      /** The transfer's result is not evaluable yet: « en attente », never a number. */
      pending: z.boolean(),
      gain: z.number().nullable(),
    })
    .nullable(),
});

export const rivalsMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  season: z.object({ id: uuid, label: z.string() }).nullable(),
  /** Places on the board (three). */
  max: z.number().int().positive(),
  /** The lead-change notification: false until the member turns it on. */
  notify: z.boolean(),
  me: z.object({ name: z.string().nullable(), total: points }).nullable(),
  rivals: z.array(rivalSchema),
});

export const rivalsResponseSchema = z.union([off, locked, rivalsMemberSchema]);

export const candidateSchema = z.object({ teamId: uuid, name: z.string(), league: leagueRef });
export const candidatesMemberSchema = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  candidates: z.array(candidateSchema),
});
export const candidatesResponseSchema = z.union([off, locked, candidatesMemberSchema]);

const pinMember = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  pinned: z.literal(true),
  count: count,
});
const unpinMember = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  removed: count,
});
const notifyMember = z.object({
  available: z.literal(true),
  locked: z.literal(false),
  notify: z.boolean(),
});

export type Rival = z.infer<typeof rivalSchema>;
export type RivalLast = z.infer<typeof rivalLastSchema>;
export type RivalsMember = z.infer<typeof rivalsMemberSchema>;
export type RivalsResponse = z.infer<typeof rivalsResponseSchema>;
export type RivalCandidate = z.infer<typeof candidateSchema>;
export type CandidatesResponse = z.infer<typeof candidatesResponseSchema>;

export function isRivalsMember(response: RivalsResponse): response is RivalsMember {
  return response.available && !response.locked;
}

/** What pinning a friend came to: the board, a refusal, or nothing because the feature is off. */
export type PinOutcome =
  | { kind: "pinned"; count: number }
  | { kind: "full" }
  | { kind: "not_found" }
  | { kind: "unavailable" };

export const RIVAL_MAX = 3;

// ---------------------------------------------------------------------------
// What the screens draw: the answer read once, nothing computed from ratings
// ---------------------------------------------------------------------------

/** The verdict of the last journée for the member: won, lost or level; null without both scores. */
export function roundVerdict(last: RivalLast | null): "won" | "lost" | "level" | null {
  if (!last || last.me === null || last.rival === null) return null;
  return last.me > last.rival ? "won" : last.me < last.rival ? "lost" : "level";
}

/** The gap between the totals, as the member sees it (positive: they lead). Null when unknown. */
export function totalGap(last: RivalLast | null): number | null {
  if (!last || last.meTotal === null || last.rivalTotal === null) return null;
  return last.meTotal - last.rivalTotal;
}

/** The result of a journée for the member, for the tally tiles. */
export function weekResult(week: {
  me: number | null;
  rival: number | null;
}): "w" | "l" | "t" | null {
  if (week.me === null || week.rival === null) return null;
  return week.me > week.rival ? "w" : week.me < week.rival ? "l" : "t";
}

/**
 * The rival who took the lead over the member in the last published journée, if any: the board's
 * banner. A corrected result that flips the lead is a banner too (`corrected`).
 */
export function leadChange(
  rivals: readonly Rival[],
): { rival: Rival; to: "rival" | "me"; corrected: boolean } | null {
  for (const rival of rivals) {
    const last = rival.last;
    if (!last || !last.leader || last.leader === "tie") continue;
    if (last.leaderBefore && last.leaderBefore !== last.leader) {
      return { rival, to: last.leader, corrected: last.correctedAt !== null };
    }
  }
  return null;
}

/** The initials of a full name, for the poster's round avatars (decoration). */
export function initialsOf(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "";
  const first = Array.from(words[0]!)[0] ?? "";
  const last = words.length > 1 ? (Array.from(words[words.length - 1]!)[0] ?? "") : "";
  return `${first}${last}`.toLocaleUpperCase();
}

// ---------------------------------------------------------------------------
// The repository
// ---------------------------------------------------------------------------

export interface PremiumRivalsRepository {
  myRivals(context: RepositoryContext): Promise<RivalsResponse>;
  candidates(context: RepositoryContext): Promise<CandidatesResponse>;
  /** A mate outside the shared leagues is `not_found`; a fourth rival is `full`. */
  pin(teamId: string, context: RepositoryContext): Promise<PinOutcome>;
  unpin(teamId: string, context: RepositoryContext): Promise<void>;
  /** The notification for a lead change; resolves to the value now stored (null when off or locked). */
  setNotify(enabled: boolean, context: RepositoryContext): Promise<boolean | null>;
}

/** The Postgres code a ManagerCardError was mapped from, when there is one. */
function causeCode(error: unknown): string {
  const cause = (error as { cause?: { code?: unknown } } | null)?.cause;
  return typeof cause?.code === "string" ? cause.code : "";
}

/** The BotolaGO+ Rivaux RPCs, through the `api` schema only. */
export class SupabasePremiumRivalsRepository implements PremiumRivalsRepository {
  constructor(private readonly api: CardApi | null = null) {}

  private client() {
    return untyped(this.api ?? getManagerCardApi());
  }

  myRivals(context: RepositoryContext): Promise<RivalsResponse> {
    // Null is sent, not omitted: the function is found by its full argument list.
    return read(
      this.client().rpc("get_my_rivals", { p_season: null }),
      rivalsResponseSchema,
      context,
    );
  }

  candidates(context: RepositoryContext): Promise<CandidatesResponse> {
    return read(
      this.client().rpc("get_rival_candidates", { p_season: null }),
      candidatesResponseSchema,
      context,
    );
  }

  async pin(teamId: string, context: RepositoryContext): Promise<PinOutcome> {
    try {
      const answer = await read(
        this.client().rpc("pin_rival", { p_rival_team: teamId, p_season: null }),
        z.union([off, locked, pinMember]),
        context,
      );
      return "pinned" in answer ? { kind: "pinned", count: answer.count } : { kind: "unavailable" };
    } catch (error) {
      if (error instanceof ManagerCardError) {
        if (causeCode(error) === "PT409") return { kind: "full" };
        if (error.code === "not_found") return { kind: "not_found" };
      }
      throw error;
    }
  }

  async unpin(teamId: string, context: RepositoryContext): Promise<void> {
    await read(
      this.client().rpc("unpin_rival", { p_rival_team: teamId, p_season: null }),
      z.union([off, locked, unpinMember]),
      context,
    );
  }

  async setNotify(enabled: boolean, context: RepositoryContext): Promise<boolean | null> {
    const answer = await read(
      this.client().rpc("set_rivals_notify", { p_enabled: enabled }),
      z.union([off, locked, notifyMember]),
      context,
    );
    return "notify" in answer ? answer.notify : null;
  }
}
