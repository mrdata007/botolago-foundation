/**
 * A page's code, fetched when the reader shows they are about to open it
 * (FE-L1): the pointer resting on its link, a finger touching it, or the
 * keyboard focusing it. The tap then lands on a page whose code is here.
 *
 * Code only, never data. The router's own `defaultPreload: "intent"` also runs
 * the page's loader, and on the live site that read the database for every
 * link the mouse crossed: pointing at one match card asked for seven of its
 * sections, and moving across the home page made 24 requests. The data is
 * still read when the page is opened, as before. Same mechanism as the
 * sections' warm-up (`section-warmup.ts`).
 */
import type { WarmupRouter } from "./section-warmup";

/** How long the pointer must rest on a link before its code is fetched. */
export const INTENT_DELAY_MS = 50;

/** The part of a link this module reads. */
export interface LinkLike {
  readonly href: string;
  readonly target: string;
  hasAttribute(name: string): boolean;
}

/**
 * The path of the page a link opens on this site, or null for a link that
 * leaves the site, opens another tab or window, or downloads a file.
 */
export function intentPath(link: LinkLike | null, origin: string): string | null {
  if (!link || (link.target && link.target !== "_self") || link.hasAttribute("download")) {
    return null;
  }
  try {
    const url = new URL(link.href, origin);
    return url.origin === origin ? url.pathname : null;
  } catch {
    return null;
  }
}

/**
 * Fetches the code of the routes a path matches, once per path; a failure
 * (offline, a deploy that renamed the files) lets the next intent try again.
 */
export function preloadCode(router: WarmupRouter, path: string, done: Set<string>): void {
  if (done.has(path)) return;
  done.add(path);
  const [routes] = router.getMatchedRoutes(path);
  for (const route of routes) {
    Promise.resolve(router.loadRouteChunk(route as never)).catch(() => done.delete(path));
  }
}
