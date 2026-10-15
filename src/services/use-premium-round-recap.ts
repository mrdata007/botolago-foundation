import { useQuery, type UseQueryResult } from "@tanstack/react-query";

import { useAuth } from "@/auth/AuthProvider";
import {
  isRoundRecapMember,
  toRoundRecapView,
  type RoundRecapView,
} from "@/backend/premium/round-recap";

import { premiumRoundRecapService } from "./premium-round-recap";

export const premiumRecapKeys = {
  recap: (userId: string | null, leagueId: string | null, gameweekId: string | null) =>
    ["premium", "round-recap", userId, leagueId, gameweekId] as const,
};

/**
 * One journée of the member's team explained against their league (`api.get_round_recap`).
 * `enabled` is true only for a member: for anyone else the query never runs, so the paid read is
 * never called. `leagueId` is the league the Curva screen is showing (null lets the database pick
 * the first one); `gameweekId` is the journée asked for (null is the latest). A switched-off, locked
 * or empty answer reads as no data (null): the screen then shows its empty state.
 */
export function useRoundRecap(
  enabled: boolean,
  leagueId: string | null,
  gameweekId: string | null,
): UseQueryResult<RoundRecapView | null> {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  return useQuery({
    queryKey: premiumRecapKeys.recap(userId, leagueId, gameweekId),
    queryFn: async ({ signal }) => {
      const answer = await premiumRoundRecapService.roundRecap(
        { gameweek: gameweekId, league: leagueId },
        signal,
      );
      return isRoundRecapMember(answer) ? toRoundRecapView(answer) : null;
    },
    enabled: enabled && userId !== null,
    staleTime: 60_000,
    retry: false,
  });
}
