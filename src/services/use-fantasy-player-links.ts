import { useQuery } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";

/**
 * The page a football player's name opens: `/fantasy/players/$playerId`, by the
 * Fantasy player id (U1). Line-ups and club squads know the football player id
 * only, so this reads the Fantasy pool's map of one to the other and answers
 * `null` for a player the pool does not list, whose name then stays plain text.
 *
 * Reads only the given teams' players (a line-up's two clubs or one club), not the
 * whole pool. It never blocks or fails the screen: while it loads, or if the Fantasy read
 * fails (no open season, offline), every name is plain text. Held ten minutes;
 * the pool changes by the gameweek, not by the minute.
 */
export function useFantasyPlayerLinks(teamIds: readonly string[], enabled = true) {
  const query = useQuery({
    queryKey: ["fantasy", "football-player-links", [...new Set(teamIds)].sort()],
    queryFn: () => fantasyService.getFootballPlayerLinks(teamIds),
    enabled: enabled && teamIds.length > 0,
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
  });
  const links = query.data;
  return (footballPlayerId: string): string | null => links?.[footballPlayerId] ?? null;
}
