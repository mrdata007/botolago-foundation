import { createFileRoute } from "@tanstack/react-router";

import { LeaguePage } from "@/components/predictions/leagues/LeaguePage";
import { dictionaries } from "@/i18n/dictionaries";

/** `/pronostics/ligues/$leagueId`: a league's Pronostics ranking. Members only, never indexed. */
export const Route = createFileRoute("/pronostics/ligues/$leagueId")({
  head: () => ({
    meta: [
      { title: dictionaries.fr["predictions.meta_title"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: LeagueRoute,
});

function LeagueRoute() {
  const { leagueId } = Route.useParams();
  return <LeaguePage leagueId={leagueId} />;
}
