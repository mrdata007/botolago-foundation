import type { QueryKey } from "@tanstack/react-query";

/**
 * True when two keys of a season's table — `["football", "standings",
 * seasonId, language]`, the key every table is read under (`getStandings`) —
 * name the same season, whatever their language. The Classement tab's
 * `placeholderData` goes by it, as the calendar's goes by
 * `isSameMatchDayQuery`: the table stays on screen through a switch of
 * language instead of turning back into the skeleton, which it can because
 * its ranks are the same in both (`buildStandings`); another season's table
 * never stands in under the season just picked.
 */
export function isSameStandingsQuery(a: QueryKey, b: QueryKey): boolean {
  const LANGUAGE = 3;
  return a.length === b.length && a.every((part, index) => index === LANGUAGE || part === b[index]);
}
