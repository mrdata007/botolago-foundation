import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { preloadCardRenderer } from "@/components/manager-card/use-card-renderer";
import { shouldRedirectFromGradins } from "@/services/manager-card-status";

/**
 * `/gradins` and everything under it (the Manager Card section). Two layers decide whether it
 * exists (`src/lib/feature-flags.ts`): the build, and the database status the root route read
 * during the server render. While either says no, every Gradins address goes to Fantasy before any
 * loader runs, so nothing of the section is ever drawn. Never indexed, never in a shared cache.
 *
 * Every page under it draws cards, so the layout starts the renderer's chunk and fonts as it
 * mounts, in parallel with the page's data (the card box appears when the data does, and the card
 * should not wait a further chunk and font load behind it).
 */
export const Route = createFileRoute("/gradins")({
  beforeLoad: ({ context }) => {
    if (shouldRedirectFromGradins(context.queryClient)) {
      throw redirect({ to: "/fantasy", replace: true });
    }
  },
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: GradinsLayout,
});

function GradinsLayout() {
  useEffect(() => {
    preloadCardRenderer();
  }, []);
  return <Outlet />;
}
