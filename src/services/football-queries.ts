import { queryOptions } from "@tanstack/react-query";
import type { FootballLanguage } from "@/backend/football/contracts";
import { footballService, type FootballSeason } from "@/services/football";

/**
 * The football reads a route loader warms and its page then reads, built in
 * one place so the two always ask under the same key: a loader that warmed a
 * slightly different key would fetch for nothing and leave the page to fetch
 * again. Other pages still declare some of these keys inline, with the same
 * shape (`["football", "seasons", language]` and so on); a key changed here
 * must change there too.
 *
 * The functions take no abort signal, like the pages' own declarations: a
 * read the reader walks away from still lands in the cache for their return.
 */

export function seasonsQuery(language: FootballLanguage) {
  return queryOptions({
    queryKey: ["football", "seasons", language],
    queryFn: () => footballService.getSeasons(language),
  });
}

/** Every club in the catalogue (`getClubs`): crests and names for lists and pickers. */
export function clubsQuery(language: FootballLanguage) {
  return queryOptions({
    queryKey: ["football", "clubs", language],
    queryFn: () => footballService.getClubs(language),
  });
}

/** The season's table (`getStandings`), shared by Classement, Home, a club and a match. */
export function standingsQuery(
  season: Pick<FootballSeason, "id" | "competitionId"> | undefined,
  language: FootballLanguage,
) {
  return queryOptions({
    queryKey: ["football", "standings", season?.id, language],
    // Only run with a season: callers that may not have one yet say
    // `enabled: season !== undefined`.
    queryFn: () => footballService.getStandings(season!, language),
  });
}

/** One club's profile: name, crest, city, colours. */
export function clubQuery(clubId: string, language: FootballLanguage) {
  return queryOptions({
    queryKey: ["football", "club", clubId, language],
    queryFn: () => footballService.getClub(clubId, language),
  });
}

/** One club's matches in one season (the club page and Home's "Mes clubs"). */
export function clubMatchesQuery(
  clubId: string,
  season: Pick<FootballSeason, "id" | "startsOn"> | undefined,
  language: FootballLanguage,
) {
  return queryOptions({
    queryKey: ["football", "club-matches", clubId, season?.id ?? "none", language],
    queryFn: () => footballService.getClubSeasonMatches(clubId, season ?? null, language),
  });
}

/** Everything the match page shows except the table (`getMatchDetailPage`). */
export function matchDetailQuery(matchId: string, language: FootballLanguage) {
  return queryOptions({
    queryKey: ["football", "match-detail", matchId, language],
    queryFn: () => footballService.getMatchDetailPage(matchId, language),
  });
}
