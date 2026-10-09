import { useMemo } from "react";

/** The batch read is at most 100 teams (plan 7.2). */
export const MAX_LEAGUE_TEAMS = 100;

/**
 * The league's team ids for the batch read: the standings' own order, at most 100, and a stable
 * identity while the list is the same, so every surface of the page shares one query.
 */
export function useLeagueTeamIds(teamIds: readonly string[]): string[] {
  const key = teamIds.join(",");
  return useMemo(() => teamIds.slice(0, MAX_LEAGUE_TEAMS), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}
