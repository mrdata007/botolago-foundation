import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import {
  isLeagueContextMember,
  toLeagueSeries,
  type LeagueSeries,
} from "@/backend/premium/league-context";

import { premiumLeagueContextService } from "./premium-league-context";

export const premiumLeagueKeys = {
  context: (userId: string | null, leagueId: string | null, rivalTeam: string | null) =>
    ["premium", "league-context", userId, leagueId, rivalTeam] as const,
};

/**
 * The league's figures set against a member (the league averages, bests, ranks, captain and
 * transfer averages, ratings ranks, and the rival's side in a duel). `enabled` is true only for a
 * member who has a league to name: for anyone else the query never runs, so the paid read is never
 * called. `leagueId` is the league the Curva screen is showing; `rivalTeam` the league mate of a
 * duel. A switched-off, locked or no-league answer reads as no data (null): the screens then write
 * « — » for the league's figures and keep the rest.
 */
export function useLeagueContext(
  enabled: boolean,
  leagueId: string | null,
  rivalTeam: string | null = null,
): UseQueryResult<LeagueSeries | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumLeagueKeys.context(userId, leagueId, rivalTeam),
    queryFn: async ({ signal }) => {
      const answer = await premiumLeagueContextService.leagueContext(
        { league: leagueId, rivalTeam },
        signal,
      );
      return isLeagueContextMember(answer) ? toLeagueSeries(answer) : null;
    },
    enabled: enabled && userId !== null && leagueId !== null,
    staleTime: 60_000,
    retry: false,
  });
}
