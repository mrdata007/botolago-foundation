import type { Gameweek } from "@/types/domain";
import type { LeagueStanding } from "@/types/fantasy";

/** A board of this many managers or fewer is small enough to invite friends to grow. */
export const SMALL_BOARD_MAX = 20;

/** How many rows "Autour de vous" shows on each side of the manager. */
export const AROUND_RADIUS = 2;

/**
 * Whether this gameweek's points are still provisional, so a gameweek score of
 * 0 means "not published yet" rather than "scored nothing". The signal is the
 * gameweek's own (`status` and `pointsState`, as `getCurrentGameweek` reads
 * them); the rankings API carries no per-row flag. Once the gameweek is final
 * a 0 is a real 0.
 */
export function gameweekPointsWaiting(
  gameweek: Pick<Gameweek, "status" | "pointsState"> | null | undefined,
): boolean {
  if (!gameweek || gameweek.pointsState !== "provisional") return false;
  return (
    gameweek.status === "live" ||
    gameweek.status === "provisional" ||
    gameweek.status === "finalizing"
  );
}

/** A row's gameweek figure is replaced by "En attente" only for a 0 while points wait. */
export function showsWaiting(waiting: boolean, gameweekScore: number): boolean {
  return waiting && gameweekScore === 0;
}

/**
 * The rows next to the manager, from one page of the board: up to `radius` on
 * each side, the manager included. Empty when the manager is not on the page.
 * Neighbours beyond the page edge are not invented, so near a page boundary
 * there are fewer.
 */
export function rowsAround(
  rows: readonly LeagueStanding[],
  managerId: string,
  radius = AROUND_RADIUS,
): LeagueStanding[] {
  const at = rows.findIndex((row) => row.managerId === managerId);
  if (at < 0) return [];
  return rows.slice(Math.max(0, at - radius), at + radius + 1);
}

/**
 * Whether "Autour de vous" earns its place: the manager is ranked, is not
 * searching, and their row is not already in the table being shown.
 */
export function showsAround({
  myManagerId,
  searching,
  shownRows,
}: {
  myManagerId: string | undefined;
  searching: boolean;
  shownRows: readonly LeagueStanding[];
}): boolean {
  if (!myManagerId || searching) return false;
  return !shownRows.some((row) => row.managerId === myManagerId);
}
