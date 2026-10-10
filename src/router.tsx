import { dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { defaultViewTransition } from "@/lib/page-transition";
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
    // styles.css). Browsers without view transitions change page as before.
    defaultViewTransition,
    // A link starts loading its page when the reader shows they are about to
    // follow it -- the pointer resting on it, keyboard focus, or a finger
    // touching it -- rather than on the click: the page's code and its
    // loader's data (a match, a club, a player) are on their way, or in, by
    // the time the click lands. Loaders read through the query cache, so a
    // second touch of the same link costs nothing while its data is fresh.
    // The Admin routes opt out (`preload: false`).
    defaultPreload: "intent",
    // Every preload asks the loader, and the loader asks React Query, which
    // decides from its own freshness rules whether anything is fetched.
    defaultPreloadStaleTime: 0,
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
