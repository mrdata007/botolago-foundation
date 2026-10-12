import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { ManagerCardError } from "@/backend/manager-card/errors";
import { chooseLeague } from "@/components/curva/people";
import { usePrivateLeagues } from "@/components/curva/use-private-leagues";
import { readRememberedLeague } from "@/components/manager-card/storage";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { useManagerCards } from "@/services/use-manager-card";
import type { League } from "@/types/fantasy";

import { buildRanking, RANKING_LIMIT, rankingTeamIds, type Ranking } from "./ranking";

export type RankingScope = "league" | "all";

export interface CurvaRankingData {
  leagues: League[];
  league: League | null;
  ranking: Ranking;
  /** The teams ranked (before the card read drops hidden ones). */
  asked: number;
  leaguesPending: boolean;
  /** The list of teams (a league's standings, or the overall board) is loading. */
  listPending: boolean;
  cardsPending: boolean;
  /** The leagues or the list of teams could not be read. */
  listError: boolean;
  /** The card read failed for a reason other than being switched off. */
  cardsError: boolean;
  /** The card read answered that the Manager Card is switched off. */
  off: boolean;
  noLeague: boolean;
  retry: () => void;
}

/**
 * What the ranking needs for one view. « Ma ligue » reads what « Les vôtres » reads (the private
 * leagues, the chosen league's standings under the league page's own key); « Tous » reads the first
 * `RANKING_LIMIT` managers of the Fantasy overall board. Both then ask the batch card read for those
 * teams, and the page ranks what comes back. Only an owner asks (`enabled`).
 */
export function useCurvaRanking(
  enabled: boolean,
  scope: RankingScope,
  wantedLeague?: string | null,
): CurvaRankingData {
  const { key } = useFantasyDataSource();
  const { status } = useAuth();
  const ownTeamId = useFantasyOwned().snapshot?.teamId ?? null;
  const leagues = usePrivateLeagues(enabled);

  // The remembered league is read after mount, so the server and the first client render agree.
  const [remembered, setRemembered] = useState<string | null>(null);
  useEffect(() => {
    setRemembered(readRememberedLeague());
  }, []);
  const league = useMemo(
    () => chooseLeague(leagues.data ?? [], wantedLeague, remembered),
    [leagues.data, wantedLeague, remembered],
  );

  const standings = useQuery({
    queryKey: key("standings", league?.id ?? "none"),
    queryFn: () => fantasyService.getLeagueStandings(league!.id),
    enabled: enabled && scope === "league" && league !== null,
    refetchInterval: 60_000,
  });
  const board = useQuery({
    queryKey: key("rankings", "curva-ranking", RANKING_LIMIT),
    queryFn: () =>
      fantasyService.getGlobalRankings({
        page: 1,
        pageSize: RANKING_LIMIT,
        sort: "overall",
        query: "",
      }),
    enabled: enabled && scope === "all" && status === "authenticated",
  });

  const ids = useMemo(() => {
    const source = scope === "league" ? (standings.data ?? []) : (board.data?.rows ?? []);
    return rankingTeamIds(
      source.map((row) => row.managerId),
      ownTeamId,
    );
  }, [scope, standings.data, board.data, ownTeamId]);
  const cards = useManagerCards(enabled && status === "authenticated" ? ids : []);
  const ranking = useMemo(() => buildRanking(cards.data ?? [], ownTeamId), [cards.data, ownTeamId]);

  const list = scope === "league" ? standings : board;
  const off = cards.error instanceof ManagerCardError && cards.error.code === "unavailable";
  return {
    leagues: leagues.data ?? [],
    league,
    ranking,
    asked: ids.length,
    leaguesPending: scope === "league" && enabled && leagues.isPending,
    listPending: scope === "league" ? league !== null && standings.isPending : board.isPending,
    cardsPending: ids.length > 0 && cards.isPending && cards.fetchStatus !== "idle",
    listError: (scope === "league" && leagues.isError) || list.isError,
    cardsError: cards.isError && !off,
    off,
    noLeague:
      scope === "league" && !leagues.isPending && !leagues.isError && leagues.data?.length === 0,
    retry: () => {
      if (scope === "league") {
        void leagues.refetch();
        void standings.refetch();
      } else {
        void board.refetch();
      }
      void cards.refetch();
    },
  };
}
