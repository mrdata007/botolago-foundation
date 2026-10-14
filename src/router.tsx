import { dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { PENDING_MIN_MS, PENDING_MS, PendingScreen } from "@/components/shell/PendingScreen";
import { viewTransitionOption } from "@/lib/page-transition";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { createAppQueryClient } from "@/services/query-client";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = createAppQueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // A change of page cross-fades or slides in (src/lib/page-transition.ts,
    // styles.css). Browsers without view transitions, or without transition
    // types, change page as before.
    defaultViewTransition: viewTransitionOption(),
    defaultPreloadStaleTime: 0,
    // A page that is not ready shortly after the tap shows the app's frame and
    // loading placeholders instead of leaving the old page up, looking frozen
    // (docs/engineering/SECTION_LOADING.md). Routes with their own
    // `pendingComponent` (the admin screens) keep it.
    defaultPendingComponent: PendingScreen,
    defaultPendingMs: PENDING_MS,
    defaultPendingMinMs: PENDING_MIN_MS,
    // The data a public page's loader warmed on the server (`prefetchForSsr`)
    // travels with the HTML and seeds the browser's cache before its first
    // render, so the first render is the page the server sent. Only queries
    // marked for it: the detail pages already carry theirs as loader data.
    dehydrate: () =>
      ({
        queryClientState: dehydrate(queryClient, SSR_DEHYDRATE_OPTIONS),
      }) as never,
    hydrate: (dehydrated: { queryClientState?: DehydratedState }) => {
      if (dehydrated?.queryClientState) hydrate(queryClient, dehydrated.queryClientState);
    },
  });

  return router;
};
