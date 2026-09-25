import { predictionsService } from "@/services/predictions";

/**
 * Shared with the league page's header, which reads the same season answer.
 * A private league's members are for its members only, so the answer is kept
 * per account: another account on the same phone never reads this one's.
 */
export function leagueStandingsQuery(leagueId: string, roundNumber: number | null, uid: string) {
  return {
    queryKey: ["predictions", "league", leagueId, roundNumber ?? "season", uid] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      predictionsService.leagueStandings(leagueId, roundNumber, signal),
    staleTime: 5 * 60_000,
  };
}
