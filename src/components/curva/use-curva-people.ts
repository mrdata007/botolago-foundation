import { useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";

import { useAuth } from "@/auth/AuthProvider";
import { readRememberedLeague } from "@/components/manager-card/storage";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { useFantasyOwned } from "@/services/fantasy-owned-provider";
import { fantasyService } from "@/services/fantasy-runtime";
import { useManagerCards } from "@/services/use-manager-card";
import type { League } from "@/types/fantasy";

import { buildRows, cardTeamIds, chooseLeague, type PeopleRow } from "./people";
import { usePrivateLeagues } from "./use-private-leagues";

export interface CurvaPeople {
  leagues: League[];
  leaguesPending: boolean;
  leaguesError: boolean;
  league: League | null;
  rows: PeopleRow[];
  /** The league's standings are still loading. */
  standingsPending: boolean;
  standingsError: boolean;
  /** The batch card read failed: rows still show, with a dash for the card. */
  cardsError: boolean;
  /** The batch card read is still going: rows show their names and no card yet. */
  cardsPending: boolean;
  ownTeamId: string | null;
  retry: () => void;
  retryCards: () => void;
}

/**
 * Everything « Les vôtres » needs, for one league: the private leagues, the chosen one's
 * standings (the league page's query and key, so the two screens share an answer), and the
 * batch read of the members' cards. `wanted` is the league the address names; without it the
 * league this phone remembered, else the first. Only an owner asks (`enabled`).
 */
export function useCurvaPeople(enabled: boolean, wanted?: string | null): CurvaPeople {
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
    () => chooseLeague(leagues.data ?? [], wanted, remembered),
    [leagues.data, wanted, remembered],
  );
  const standings = useQuery({
    queryKey: key("standings", league?.id ?? "none"),
    queryFn: () => fantasyService.getLeagueStandings(league!.id),
    enabled: enabled && league !== null,
    refetchInterval: 60_000,
  });
  const ids = useMemo(
    () => cardTeamIds(standings.data ?? [], ownTeamId),
    [standings.data, ownTeamId],
  );
  const cards = useManagerCards(enabled && status === "authenticated" ? ids : []);
  const rows = useMemo(
    () => buildRows(standings.data ?? [], cards.data ?? [], ownTeamId),
    [standings.data, cards.data, ownTeamId],
  );
  return {
    leagues: leagues.data ?? [],
    leaguesPending: enabled && leagues.isPending,
    leaguesError: leagues.isError,
    league,
    rows,
    standingsPending: league !== null && standings.isPending,
    standingsError: standings.isError,
    cardsError: cards.isError,
    cardsPending: ids.length > 0 && cards.isPending && cards.fetchStatus !== "idle",
    ownTeamId,
    retry: () => {
      void leagues.refetch();
      void standings.refetch();
    },
    retryCards: () => void cards.refetch(),
  };
}
