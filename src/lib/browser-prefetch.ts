import { isServerRender } from "./ssr-prefetch";

/**
 * Starts a page's reads from its route loader, in the browser, and does not
 * wait for them: the browser-side counterpart of `prefetchForSsr`.
 *
 * A loader runs when a link is about to be followed (the router preloads on
 * intent, `src/router.tsx`) and again on the navigation itself, before the
 * page's code has even arrived. Reads started here are in flight, or in the
 * cache, by the time the page's queries ask for them, so the page renders
 * with its data instead of rendering, then asking, then waiting. Loaders
 * start them with `ensureQueryData`, which fetches only what the cache does
 * not hold and shares a read already on its way: a copy already there, even
 * an old one, is left for the page to show and its own query to refresh, as
 * it always did, so nothing is read earlier or more often than before.
 *
 * Nothing waits on them, so a navigation is never held up by them; and a read
 * that fails is left to the page, whose own query asks again on mount and
 * shows its usual error state. On the server this does nothing: the server
 * render warms what it needs with `prefetchForSsr`.
 */
export function prefetchInBrowser(start: () => Promise<unknown>): void {
  if (isServerRender()) return;
  Promise.resolve()
    .then(start)
    .catch(() => {
      // The page's own query reports and retries a failed read.
    });
}
