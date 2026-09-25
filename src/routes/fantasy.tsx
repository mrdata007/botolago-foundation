import { createFileRoute, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect } from "react";

import { useI18n } from "@/i18n/provider";
import { FANTASY_PLAYER_ROUTE_ID, fantasyShownCopy, shownHeadTitle } from "@/lib/fantasy-meta";

export const Route = createFileRoute("/fantasy")({
  head: () => ({
    meta: [
      { title: "Fantasy — BotolaGO" },
      {
        name: "description",
        content:
          "BotolaGO Fantasy : composez votre équipe Botola Pro, faites vos transferts et suivez vos points chaque journée.",
      },
      { property: "og:title", content: "Fantasy — BotolaGO" },
      {
        property: "og:description",
        content:
          "BotolaGO Fantasy : composez votre équipe Botola Pro, faites vos transferts et suivez vos points chaque journée.",
      },
    ],
  }),
  component: FantasyLayout,
});

/**
 * The Fantasy layout never gates its children and adds no overlay of its own.
 *
 * Every screen resolves its own availability / authentication / team state
 * through `useFantasyScreen`, so a slow or failed backend request can only
 * ever degrade the one screen that depends on it, with a finite loading state
 * and an explicit retry. The reference screens carry no welcome or import
 * dialogs, so none are mounted here. The one arrival dialog there is -- the
 * prize welcome, while prizes are switched on -- belongs to the hub
 * (`fantasy.index.tsx`), not to every Fantasy screen.
 *
 * What it does for every screen is the reader's own title. Each page's
 * `head()` serves the French title and description, which is what the server
 * renders (`src/lib/fantasy-meta.ts`). After mount, this sets them in the
 * reader's language for the page shown -- the deepest match, so a player's
 * page beneath the players list is named after its player -- as the legal
 * pages and Pronostics do.
 *
 * The router puts a head's French back in the tab each time that head
 * changes. Usually the head and this layout change in the same render and
 * the effect runs after both, but not always: a route with a pending screen
 * is shown before its head has run (`shownHeadTitle`). So the effect also
 * follows the title the head gave the router, and sets the reader's again
 * after it. A Fantasy page's title and description change together, so the
 * title is enough to follow for both.
 */
function FantasyLayout() {
  const { t, tr } = useI18n();
  const routeId = useRouterState({ select: (state) => state.matches.at(-1)?.routeId });
  const player = useRouterState({
    select: (state) => {
      const shown = state.matches.at(-1);
      return shown?.routeId === FANTASY_PLAYER_ROUTE_ID ? shown.loaderData?.player.name : undefined;
    },
  });
  const headTitle = useRouterState({ select: (state) => shownHeadTitle(state.matches) });
  const copy = fantasyShownCopy(routeId, player ? tr(player) : null, t);
  const title = copy?.title;
  const description = copy?.description;

  // `head()` has no reader language; the reader's own title is set after
  // mount, and again whenever the router puts the head's French back.
  useEffect(() => {
    if (typeof window === "undefined" || !title || !description) return;
    window.document.title = title;
    const meta = window.document.querySelector('meta[name="description"]');
    if (meta) meta.setAttribute("content", description);
  }, [title, description, headTitle]);

  return <Outlet />;
}
