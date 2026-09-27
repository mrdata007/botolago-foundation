import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { PEPITES_ENABLED } from "@/lib/feature-flags";

/**
 * `/admin/pepites` and `/admin/pepites/donnees`: only in a build where Pépites
 * is on, like its public pages. Each child route checks its own permission
 * on the server.
 */
function redirectWhilePepitesAreHidden(): void {
  if (!PEPITES_ENABLED) throw redirect({ to: "/admin", replace: true });
}

export const Route = createFileRoute("/admin/pepites")({
  ssr: false,
  beforeLoad: redirectWhilePepitesAreHidden,
  component: () => <Outlet />,
});
