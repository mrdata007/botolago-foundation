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
