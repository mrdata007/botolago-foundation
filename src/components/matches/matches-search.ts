import type { FootballSeason } from "@/services/football";

/**
 * The season the Matches tabs are showing, carried in the URL
 * (`?season=<id>`) so switching between Calendrier and Classement keeps it:
 * each tab is its own page, and each would otherwise open on the current
 * season. Only a past season travels — the current one is each tab's
 * default, so its links stay clean. An id no season has is ignored by the
 * page and it opens on the current season.
 */
export interface MatchesSearch {
  readonly season?: string;
}

export function validateMatchesSearch(search: Record<string, unknown>): MatchesSearch {
  return typeof search.season === "string" && search.season ? { season: search.season } : {};
}

/** The search a tab change carries: the season shown, unless it is the current one. */
export function seasonSearch(
  season: Pick<FootballSeason, "id" | "isCurrent"> | undefined,
): MatchesSearch {
  return season && !season.isCurrent ? { season: season.id } : {};
}
