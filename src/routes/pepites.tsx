import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { loadFrSectionsForPath, provideFrSection } from "@/i18n/fr-sections";
import { frPepites } from "@/i18n/fr-sections/pepites";
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
  component: PepitesLayout,
});

function PepitesLayout() {
  // Imported here so the layout's chunk carries it and the HTML preloads it (`fr-sections.ts`).
  provideFrSection("pepites", frPepites);
  return <Outlet />;
}
