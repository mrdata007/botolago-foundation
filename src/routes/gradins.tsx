import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";

import { shouldRedirectFromGradins } from "@/services/manager-card-status";

/**
 * `/gradins` and everything under it (the Manager Card section). Two layers decide whether it
 * exists (`src/lib/feature-flags.ts`): the build, and the database status the root route read
 * during the server render. While either says no, every Gradins address goes to Fantasy before any
 * loader runs, so nothing of the section is ever drawn. Never indexed, never in a shared cache.
 */
export const Route = createFileRoute("/gradins")({
  beforeLoad: ({ context }) => {
    if (shouldRedirectFromGradins(context.queryClient)) {
      throw redirect({ to: "/fantasy", replace: true });
    }
  },
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: () => <Outlet />,
});
