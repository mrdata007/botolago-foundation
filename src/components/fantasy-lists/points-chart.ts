import type { FantasyPlayerGameweekHistoryEntryDto } from "@/backend/fantasy/contracts";

/** One bar of the player page's "recent gameweeks" chart. */
export interface PointsBar {
  gameweekId: string;
  sequence: number;
  points: number;
  minutesPlayed: number;
  provisional: boolean;
  opponents: FantasyPlayerGameweekHistoryEntryDto["opponents"];
  /**
   * Bar height as a share of the plot, 0–100. The best week of the window is
   * 100; a week that scored nothing — or lost points — is 0 and is drawn as
   * the baseline stub, so no bar ever implies a score it does not have.
   */
  heightPct: number;
}

/** The smallest height a scoring bar is drawn at, so a 1-point week stays visible. */
export const MIN_BAR_PCT = 8;

/**
 * The last `count` gameweeks of a player's history, oldest first, scaled to
 * the best of them.
 *
 * The RPC returns the whole season oldest-first, but the order is sorted here
 * rather than trusted, because the chart reads left-to-right in time (and
 * right-to-left in Arabic, where the grid mirrors). Scaling is to the window,
 * not the season: the chart compares these weeks with each other.
 */
export function recentPointsBars(
  history: readonly FantasyPlayerGameweekHistoryEntryDto[],
  count = 6,
): PointsBar[] {
  const recent = [...history]
    .sort((a, b) => a.gameweekSequence - b.gameweekSequence)
    .slice(-Math.max(0, count));
  const best = Math.max(0, ...recent.map((entry) => entry.points));
  return recent.map((entry) => ({
    gameweekId: entry.gameweekId,
    sequence: entry.gameweekSequence,
    points: entry.points,
    minutesPlayed: entry.minutesPlayed,
    provisional: entry.state === "provisional",
    opponents: entry.opponents,
    heightPct:
      entry.points <= 0 || best <= 0
        ? 0
        : Math.max(MIN_BAR_PCT, Math.round((entry.points / best) * 100)),
  }));
}
