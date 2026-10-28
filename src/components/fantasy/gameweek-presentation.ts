import type { TranslationKey } from "@/i18n/dictionaries";
import type { FantasyGameweekStatus, FantasyPointsState, Gameweek } from "@/types/domain";

export type GameweekStatusTone = "neutral" | "accent" | "live" | "warning" | "final";

export interface GameweekPresentation {
  badgeKey: TranslationKey;
  detailKey?: TranslationKey;
  showCountdown: boolean;
  pointsRoute: boolean;
  pollIntervalMs: number | false;
  tone: GameweekStatusTone;
}

export function getGameweekPresentation(
  status: FantasyGameweekStatus,
  pointsState: FantasyPointsState,
): GameweekPresentation {
  switch (status) {
    case "scheduled":
      return {
        badgeKey: "fantasy.gameweek.status.scheduled",
        showCountdown: true,
        pointsRoute: false,
        pollIntervalMs: false,
        tone: "neutral",
      };
    case "open":
      return {
        badgeKey: "fantasy.gameweek.status.open",
        showCountdown: true,
        pointsRoute: false,
        pollIntervalMs: false,
        tone: "accent",
      };
    case "locked":
      return {
        badgeKey: "fantasy.gameweek.status.locked",
        detailKey: "fantasy.gameweek.detail.locked",
        showCountdown: false,
        pointsRoute: false,
        pollIntervalMs: false,
        tone: "warning",
      };
    case "live":
      return {
        badgeKey: "fantasy.gameweek.status.live",
        detailKey: "fantasy.gameweek.detail.live",
        showCountdown: false,
        pointsRoute: true,
        pollIntervalMs: pointsState === "provisional" ? 30_000 : false,
        tone: "live",
      };
    case "provisional":
      return {
        badgeKey: "fantasy.gameweek.status.provisional",
        detailKey: "fantasy.gameweek.detail.provisional",
        showCountdown: false,
        pointsRoute: true,
        pollIntervalMs: 30_000,
        tone: "live",
      };
    case "finalizing":
      return {
        badgeKey: "fantasy.gameweek.status.finalizing",
        detailKey: "fantasy.gameweek.detail.finalizing",
        showCountdown: false,
        pointsRoute: true,
        pollIntervalMs: 30_000,
        tone: "warning",
      };
    case "finalized":
    case "corrected":
      return {
        badgeKey: "fantasy.gameweek.status.final",
        detailKey: "fantasy.gameweek.detail.final",
        showCountdown: false,
        pointsRoute: true,
        pollIntervalMs: false,
        tone: "final",
      };
    case "cancelled":
      return {
        badgeKey: "fantasy.gameweek.status.cancelled",
        detailKey: "fantasy.gameweek.detail.cancelled",
        showCountdown: false,
        pointsRoute: false,
        pollIntervalMs: false,
        tone: "neutral",
      };
  }
}

/**
 * Once a gameweek's deadline has passed, the next deadline a manager can
 * still act on: the next gameweek's, while it lies ahead. Null before the
 * deadline, and when there is no next gameweek yet. A manager who joined
 * after a deadline plays from that next gameweek, and nothing else on the
 * Fantasy home names its deadline.
 */
export function nextDeadlineAfter(
  gameweek: Pick<Gameweek, "number" | "deadline" | "enrolment">,
  now: number,
): { number: number; deadline: string } | null {
  const next = gameweek.enrolment;
  if (!next || next.number === gameweek.number) return null;
  if (!(Date.parse(gameweek.deadline) <= now)) return null;
  if (!(Date.parse(next.deadline) > now)) return null;
  return { number: next.number, deadline: next.deadline };
}

/** Where a round stands once its own deadline is behind it. */
export type RoundPhase = "in_progress" | "finished" | "cancelled";

/**
 * What the hub's deadline card leads with.
 *
 *   - `open`: the round's deadline is still ahead; the card is about it.
 *   - `next_open`: that deadline has passed and the server names a later round
 *     whose deadline is still ahead; the card leads with the later round and
 *     the one that passed becomes a sub-line (`current`).
 *   - `awaiting_next`: the deadline has passed and no later deadline is
 *     published (`lead` is null). The card says so in words: no date, no
 *     countdown.
 *
 * `live` is true only while a match of `current`'s round is in play.
 */
export type DeadlineHeadline =
  | {
      state: "open";
      lead: { number: number; deadline: string };
      current: null;
      live: false;
    }
  | {
      state: "next_open";
      lead: { number: number; deadline: string };
      current: { number: number; phase: RoundPhase };
      live: boolean;
    }
  | {
      state: "awaiting_next";
      lead: null;
      current: { number: number; phase: RoundPhase };
      live: boolean;
    };

/** The statuses in which the server has closed the round's team changes. */
const CLOSED_STATUSES: ReadonlySet<FantasyGameweekStatus> = new Set([
  "locked",
  "live",
  "provisional",
  "finalizing",
  "finalized",
  "corrected",
  "cancelled",
]);

function phaseOf(status: FantasyGameweekStatus | undefined): RoundPhase {
  if (status === "finalized" || status === "corrected") return "finished";
  if (status === "cancelled") return "cancelled";
  return "in_progress";
}

/**
 * Which deadline the Fantasy hub's card leads with, from the server's
 * gameweek and the clock. Both deadlines are the server's own, passed through
 * untouched: nothing here computes, moves or invents one.
 *
 * A round counts as past its deadline when its date has passed OR the server
 * has already moved it out of `scheduled`/`open` (locked, live, final,
 * cancelled): the lifecycle's word is not overruled by a device clock that
 * runs behind.
 *
 * `liveRounds` is the round number of every match the app's live list holds
 * right now, or `null` while that list is unknown (loading or failed). A match
 * without a round number (0) is counted for the round, since the live strip
 * lists only Botola Pro matches in play. An unknown list is never a live dot.
 */
export function deadlineHeadline({
  gameweek,
  now,
  liveRounds,
}: {
  gameweek: Pick<Gameweek, "number" | "deadline" | "status" | "enrolment">;
  now: number;
  liveRounds: readonly number[] | null;
}): DeadlineHeadline {
  const dated = Date.parse(gameweek.deadline) <= now;
  const closed = dated || (gameweek.status !== undefined && CLOSED_STATUSES.has(gameweek.status));
  if (!closed) {
    return {
      state: "open",
      lead: { number: gameweek.number, deadline: gameweek.deadline },
      current: null,
      live: false,
    };
  }
  const phase = phaseOf(gameweek.status);
  const current = { number: gameweek.number, phase };
  const live =
    phase === "in_progress" &&
    liveRounds !== null &&
    liveRounds.some((round) => round === gameweek.number || round === 0);
  const next = gameweek.enrolment;
  if (next && next.number > gameweek.number && Date.parse(next.deadline) > now) {
    return {
      state: "next_open",
      lead: { number: next.number, deadline: next.deadline },
      current,
      live,
    };
  }
  return { state: "awaiting_next", lead: null, current, live };
}
