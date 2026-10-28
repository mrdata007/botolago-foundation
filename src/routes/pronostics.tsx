import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { loadFrSectionsForPath } from "@/i18n/fr-sections";
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
  component: () => <Outlet />,
});
