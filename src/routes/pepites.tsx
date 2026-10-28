import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { loadFrSectionsForPath } from "@/i18n/fr-sections";
import { PEPITES_ENABLED } from "@/lib/feature-flags";

/**
 * `/pepites` and everything under it. While Pépites is switched off in the
 * build (`PEPITES_ENABLED`, on only in a local preview) it redirects Home
 * before any loader runs, like `/pronostics`. The database's own switch
 * (`mode`) then decides what an open page shows, for every reader.
 */
function redirectWhilePepitesAreHidden(): void {
  if (!PEPITES_ENABLED) throw redirect({ to: "/", replace: true });
}

export const Route = createFileRoute("/pepites")({
  beforeLoad: redirectWhilePepitesAreHidden,
  // The French copy of this section (`src/i18n/fr-sections.ts`), loaded before the page renders.
  loader: ({ location }) => loadFrSectionsForPath(location.pathname),
  component: () => <Outlet />,
});
