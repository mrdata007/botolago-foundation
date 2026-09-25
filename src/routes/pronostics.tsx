import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

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
  component: () => <Outlet />,
});
