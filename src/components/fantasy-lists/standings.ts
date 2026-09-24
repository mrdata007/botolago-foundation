import { ui } from "@/components/ui-kit";

/**
 * Column rules for the standings tables (rankings, a league's standings).
 *
 * The figure columns — rank, gameweek, total, movement — size to their own
 * content and never wrap; the team column takes whatever is left
 * (`STANDINGS_NAME_CELL`: `w-full` plus `max-w-0`, the long-standing way to
 * let a table cell absorb the remaining width without its content being
 * allowed to widen the table). So a long team name wraps inside its column
 * instead of pushing Total off the screen, and the figures keep their width
 * whether the page is ranks 1–25 or 12 476–12 500.
 */
export const STANDINGS_NAME_CELL = "w-full max-w-0";
export const STANDINGS_FIGURE_CELL = "whitespace-nowrap";

/**
 * The rank's stat step for the widest rank on the page: the top of the board
 * is one or two digits at the medium step, but the overall board runs to five
 * ("12 483") and a public league to as many, which step down to the small one
 * so a narrow phone keeps room for the names.
 */
export function rankFigure(widestRank: number): string {
  return widestRank >= 1000 ? ui.stat.sm : ui.stat.md;
}

/**
 * How many places a manager moved. A move of a thousand places or more is
 * written compactly to two significant digits — "1,2 k", "12 k" — the column
 * has no room for "12 153"; below that the number is exact. The "your
 * position" line has the room and never compacts.
 */
export function formatMove(
  places: number,
  exact: Intl.NumberFormat,
  compact: Intl.NumberFormat,
): string {
  return places >= 1000 ? compact.format(places) : exact.format(places);
}

/** The compact formatter `formatMove` expects, for a locale. */
export function compactMoveFormat(locale: string): Intl.NumberFormat {
  return new Intl.NumberFormat(locale, { notation: "compact", maximumSignificantDigits: 2 });
}
