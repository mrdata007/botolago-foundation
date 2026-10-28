import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getNewsRepository } from "@/services/news";
import { footballService } from "@/services/football";
import type { Club } from "@/types/domain";
import { presentNewsTeam, publicNewsContext } from "./news-data";

/**
 * The clubs a News screen draws, in the reader's language.
 *
 * The news API's team filter carries one name per club, in Latin letters, in
 * both languages (it has no Arabic names), so the Arabic UI showed "Amal
 * Tiznit" on chips and tags beside Arabic headlines. The football directory
 * (the Clubs page's) has the translated names, so where it knows a club its
 * `name` and `shortName` replace the news ones; the news row keeps everything
 * else (crest, colours, id), and a club the directory no longer lists (one
 * that has left the league, which old stories still name) keeps its news name.
 */
export function overlayClubNames(
  newsClubs: readonly Club[],
  directoryClubs: readonly Club[],
): Club[] {
  const byId = new Map(directoryClubs.map((club) => [club.id, club]));
  return newsClubs.map((club) => {
    const named = byId.get(club.id);
    return named ? { ...club, name: named.name, shortName: named.shortName } : club;
  });
}

/** The clubs of the current season only, for the filter row. */
export function currentSeasonClubs(
  newsClubs: readonly Club[],
  directory: { season: unknown; clubs: readonly Club[] } | undefined,
): Club[] {
  if (!directory?.season) return [];
  const current = new Set(directory.clubs.map((club) => club.id));
  return newsClubs.filter((club) => current.has(club.id));
}

export function useNewsClubs(lang: "fr" | "ar") {
  // Presented here rather than by `newsService.getTeamFilters`, whose
  // presenter turns a missing club colour into a literal navy that the club
  // palette would paint on every club (see `presentNewsTeam`).
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters-v2", lang],
    queryFn: async () =>
      (await getNewsRepository().getTeamFilters(lang, publicNewsContext())).map(presentNewsTeam),
  });
  // The Clubs page's query, so one read between the two screens.
  const directoryQ = useQuery({
    queryKey: ["football", "club-directory", lang],
    queryFn: ({ signal }) => footballService.getClubDirectory(lang, signal),
  });
  const clubs = useMemo(
    () =>
      directoryQ.data
        ? overlayClubNames(clubsQ.data ?? [], directoryQ.data.clubs)
        : (clubsQ.data ?? []),
    [clubsQ.data, directoryQ.data],
  );
  const chips = useMemo(() => currentSeasonClubs(clubs, directoryQ.data), [clubs, directoryQ.data]);
  return { clubsQ, directoryQ, clubs, chips };
}
