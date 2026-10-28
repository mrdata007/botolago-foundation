import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { loadFrSectionsForPath, provideFrSection } from "@/i18n/fr-sections";
import { frPredictions } from "@/i18n/fr-sections/predictions";
import { PRONOSTICS_ENABLED } from "@/lib/feature-flags";

/**
 * `/pronostics` and everything under it. While the page is switched off (see
 * `PRONOSTICS_ENABLED`) it redirects Home before any loader runs, the way
 * `/news` and `/prizes` do. The database's own switch (`mode`) decides what an
 * open page actually shows.
 */
function redirectWhilePronosticsAreHidden(): void {
  if (!PRONOSTICS_ENABLED) throw redirect({ to: "/", replace: true });
}

export const Route = createFileRoute("/pronostics")({
  beforeLoad: redirectWhilePronosticsAreHidden,
  // The French copy of this section (`src/i18n/fr-sections.ts`), loaded before the page renders.
  loader: ({ location }) => loadFrSectionsForPath(location.pathname),
  component: PronosticsLayout,
});

function PronosticsLayout() {
  // Imported here so the layout's chunk carries it and the HTML preloads it (`fr-sections.ts`).
  provideFrSection("predictions", frPredictions);
  return <Outlet />;
}
