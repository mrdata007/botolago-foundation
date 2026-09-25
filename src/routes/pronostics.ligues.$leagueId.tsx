import { createFileRoute } from "@tanstack/react-router";

import { LeaguePage } from "@/components/predictions/leagues/LeaguePage";
import { fr } from "@/i18n/dictionary-fr";

/** `/pronostics/ligues/$leagueId`: a league's Pronostics ranking. Members only, never indexed. */
export const Route = createFileRoute("/pronostics/ligues/$leagueId")({
  head: () => ({
    meta: [{ title: fr["predictions.meta_title"] }, { name: "robots", content: "noindex" }],
  }),
  component: LeagueRoute,
});

function LeagueRoute() {
  const { leagueId } = Route.useParams();
  return <LeaguePage leagueId={leagueId} />;
}
