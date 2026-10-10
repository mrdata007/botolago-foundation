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
  head: () => ({
    // The card's own face, fetched with the page instead of when `eclat.css` declares it.
    links: [
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/instrument-serif-latin-400-normal.woff2",
        crossOrigin: "anonymous",
      },
    ],
  }),
  headers: () => ({ "Cache-Control": "private, no-store" }),
  component: GradinsLayout,
});

/**
 * Started when this layout's code is evaluated, not when it mounts: the code is only fetched once
 * the route has matched and `beforeLoad` let the section through, and it is evaluated before the
 * router finishes loading the page's own chunk and hydrates, so the renderer's chunk and the card's
 * faces start a whole hydration earlier than an effect would start them. Only this component
 * refers to it, so it travels with the layout's lazy chunk and with the section off nothing runs.
 */
const cardRendererStarted: true = (preloadCardRenderer(), true);

function GradinsLayout() {
  useEffect(() => {
    preloadCardRenderer(); // idempotent; covers a layout whose module was evaluated on the server
  }, []);
  return cardRendererStarted ? <Outlet /> : null;
}
