import { predictionsService } from "@/services/predictions";

/** Shared with the league page's header, which reads the same season answer. */
export function leagueStandingsQuery(leagueId: string, roundNumber: number | null) {
  return {
    queryKey: ["predictions", "league", leagueId, roundNumber ?? "season"] as const,
    queryFn: ({ signal }: { signal?: AbortSignal }) =>
      predictionsService.leagueStandings(leagueId, roundNumber, signal),
    staleTime: 5 * 60_000,
  };
}
