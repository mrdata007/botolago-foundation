import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";

import { useI18n } from "@/i18n/provider";
import { footballService } from "@/services/football";

import type { ListedClub } from "./pepites-format";

/**
 * The app's club catalogue by team id: each club's crest (SportsMonks,
 * cleared for in-app display) and the short code the rest of the app prints
 * on a crest disc. A Pépites team is an `app.teams` row, so the ids match.
 *
 * The same query (key and reader) as the top bar's search, Home and the
 * Fantasy lists, so the catalogue is usually in the cache already. It is
 * read in the browser only, never in a server render: a failed catalogue
 * read must not turn a Pépites page into a 503 (`ssrAvailability`). Until it
 * arrives, or for a club it does not list, a disc shows the club's colour and
 * initials, in the same box, so nothing moves when a crest lands.
 */
export function useClubCatalogue(): ReadonlyMap<string, ListedClub> {
  const { lang } = useI18n();
  const query = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
    staleTime: 10 * 60_000,
  });
  return useMemo(
    () => new Map((query.data ?? []).map((club) => [club.id, club] as const)),
    [query.data],
  );
}
