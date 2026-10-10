import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import type { MyCardDto } from "@/backend/manager-card/contracts";
import { clubSpotlight } from "@/components/home/my-clubs";
import { useI18n } from "@/i18n/provider";
import { defaultSeason, footballService } from "@/services/football";
import type { Club } from "@/types/domain";

import { resolveClub } from "./club-resolve";
import { sameClub, type PeopleRow } from "./people";

/**
 * « Votre club »: the app's club for the card's club, the club's next match (the club page's own
 * query, under its own key, so a visit to the club page finds it cached), and the people of the
 * reader's league who support the same club.
 */
export function useClubBlock(
  card: MyCardDto,
  clubs: readonly Club[],
  leagueName: string | null,
  rows: readonly PeopleRow[],
) {
  const { lang } = useI18n();
  const club = useMemo(() => resolveClub(clubs, card.club), [clubs, card.club]);
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
    staleTime: 5 * 60_000,
    enabled: club !== null,
  });
  const season = useMemo(
    () => (seasonsQ.data ? defaultSeason(seasonsQ.data) : undefined),
    [seasonsQ.data],
  );
  const matchesQ = useQuery({
    queryKey: ["football", "club-matches", club?.id ?? "none", season?.id ?? "none", lang],
    queryFn: () => footballService.getClubSeasonMatches(club!.id, season ?? null, lang),
    enabled: club !== null && seasonsQ.isSuccess,
  });
  const spotlight =
    club && matchesQ.data ? clubSpotlight(matchesQ.data.matches, club.id) : undefined;
  const clubById = (id: string): Club | undefined =>
    matchesQ.data?.clubs.find((c) => c.id === id) ?? clubs.find((c) => c.id === id);
  const mates = useMemo(() => {
    if (!leagueName) return null;
    const names = sameClub(rows, card.club?.id ?? null).map((row) => row.name);
    return names.length > 0 ? { league: leagueName, names } : null;
  }, [leagueName, rows, card.club?.id]);
  return {
    club,
    spotlight,
    spotlightFailed: seasonsQ.isError || matchesQ.isError,
    retry: () => {
      void seasonsQ.refetch();
      void matchesQ.refetch();
    },
    clubById,
    mates,
  };
}
