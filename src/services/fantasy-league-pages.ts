// FANT-03 — a league's standings, a page at a time.
//
// `api.fantasy_league_standings` returns at most 100 rows and takes a keyset
// position (`p_after_rank`, `p_after_team_id`), but it does not say whether
// more follow. The screen used to read the first 100 and stop, so the 101st
// member of a league could not be found. A page that comes back full is
// followed by another read from the position of its last row; a page that
// comes back short is the end.
//
// The position is built from the shown rank. For a private league that is the
// rank the position uses. For a public league with accounts hidden from the
// public board above it, the shown rank is lower than the stored one, so the
// next page starts a little early and repeats a few rows: they are dropped
// here by team id (`mergeLeagueStandingsPages`), and a page that adds nothing
// new ends the list rather than looping. Rows are never skipped.
// Known limit: when 100 or more hidden accounts sit above a page, a whole page is
// repeats, adds nothing new, and the list ends early (the member count above it
// stays the server's, so the shortfall shows).

import type { LeagueStanding } from "@/types/fantasy";

/** The most rows one read of a league's standings returns (the RPC's own limit). */
export const LEAGUE_PAGE_SIZE = 100;

export interface LeagueStandingCursor {
  readonly rank: number;
  readonly teamId: string;
}

export interface LeagueStandingsPage {
  readonly rows: LeagueStanding[];
  /** The league's member count as the server holds it, which can exceed the rows ranked. */
  readonly memberCount: number;
  /** Where the next read starts; null when this page was the last. */
  readonly nextCursor: LeagueStandingCursor | null;
}

/** The position after a page's last row, or null when the page was not full. */
export function nextLeagueCursor(
  rows: readonly LeagueStanding[],
  pageSize = LEAGUE_PAGE_SIZE,
): LeagueStandingCursor | null {
  const last = rows[rows.length - 1];
  return last && rows.length >= pageSize ? { rank: last.rank, teamId: last.managerId } : null;
}

export interface MergedLeagueStandings {
  readonly rows: LeagueStanding[];
  readonly memberCount: number;
  /** The position to read next, or null when the list is complete. */
  readonly nextCursor: LeagueStandingCursor | null;
}

/** The pages read so far as one list, in the server's order, each team once. */
export function mergeLeagueStandingsPages(
  pages: readonly LeagueStandingsPage[],
): MergedLeagueStandings {
  const seen = new Set<string>();
  const rows: LeagueStanding[] = [];
  let addedByLast = 0;
  pages.forEach((page, index) => {
    let added = 0;
    for (const row of page.rows) {
      if (seen.has(row.managerId)) continue;
      seen.add(row.managerId);
      rows.push(row);
      added += 1;
    }
    if (index === pages.length - 1) addedByLast = added;
  });
  const last = pages[pages.length - 1];
  return {
    rows,
    memberCount: last?.memberCount ?? 0,
    nextCursor: last && addedByLast > 0 ? last.nextCursor : null,
  };
}

/**
 * How often the open standings re-read themselves, by how many pages are shown.
 * A refresh of an infinite query re-reads every page loaded, one after the
 * other, so it slows down as the reader loads more instead of stopping: scores
 * and ranks of a league over 100 members would otherwise stay stale until the
 * screen is left (the first page alone refreshes every minute, as before).
 * Past five pages (500 members) the reader still gets a fresh read when they
 * return to the window.
 */
export function leagueStandingsRefetchInterval(pageCount: number): number | false {
  if (pageCount <= 1) return 60_000;
  if (pageCount <= 5) return 5 * 60_000;
  return false;
}
