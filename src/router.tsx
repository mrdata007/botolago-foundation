import { dehydrate, hydrate, type DehydratedState } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { loadFrSectionsForPath } from "@/i18n/fr-sections";
import { PENDING_MIN_MS, PENDING_MS, PendingScreen } from "@/components/shell/PendingScreen";
import { viewTransitionOption } from "@/lib/page-transition";
import { armTabSlide } from "@/lib/tab-slide";
import { SSR_DEHYDRATE_OPTIONS } from "@/lib/ssr-prefetch";
import { createAppQueryClient } from "@/services/query-client";
import { preloadLanguage } from "@/i18n/provider";
import { requestLanguage } from "@/i18n/request-language";
import type { Language } from "@/types/domain";
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
    //
    // The language the server drew the page in travels too (FE-H1): when it is
    // Arabic, the browser loads the Arabic words before it takes the page
    // over, so its first render is the server's Arabic page, not French.
    dehydrate: () =>
      ({
        queryClientState: dehydrate(queryClient, SSR_DEHYDRATE_OPTIONS),
        lang: requestLanguage(),
      }) as never,
    // Waited for before React hydrates: the words the server drew the page
    // with have to be here for the first render to be the page the server
    // sent. The French copy of the section the address belongs to
    // (`src/i18n/fr-sections.ts`; a page outside the sections waits for
    // nothing), and the Arabic words when the page is Arabic (FE-H1).
    hydrate: async (dehydrated: { queryClientState?: DehydratedState; lang?: Language }) => {
      if (dehydrated?.queryClientState) hydrate(queryClient, dehydrated.queryClientState);
      await Promise.all([
        // Once more when the first request fails: a section that never arrives
        // would hydrate the page in key names.
        loadFrSectionsForPath(window.location.pathname).catch(() =>
          loadFrSectionsForPath(window.location.pathname),
        ),
        dehydrated?.lang ? preloadLanguage(dehydrated.lang) : undefined,
      ]);
    },
  });

  // Slide (src/lib/tab-slide.ts): a move between two bar sections arms the
  // direction the next page frame slides in from. Browser only.
  if (typeof window !== "undefined") {
    router.subscribe("onBeforeNavigate", ({ fromLocation, toLocation }) =>
      armTabSlide(fromLocation?.pathname, toLocation.pathname),
    );
  }

  return router;
};
