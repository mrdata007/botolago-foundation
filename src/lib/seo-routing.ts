/**
 * Answers the server gives before the router sees a request, for search
 * engines (SEO brief, 2026-10-27).
 *
 * 1. A path with a route template left in it (`/clubs/$clubId`, also as
 *    `%24clubId`) is a 404. Google crawled `/clubs/$clubId`, a link built
 *    without its params, and the router answered it with a 307 to itself
 *    (`Location: /clubs/%24clubId`), a redirect loop. No page of the site has
 *    a segment that starts with `$`, so none is lost.
 *
 * 2. The addresses people type for the table answer a 301 to the page that
 *    holds it, `/matches/standings`: "classement" is one of the most searched
 *    intents, and `/classement` and `/standings` were 404s. `/matches/standings`
 *    stays the canonical page because it is the one already indexed and every
 *    link in the app points at it.
 *
 * 3. `/calendrier` is a 301 to `/matches` and `/botola-pro` a 301 to `/`.
 */

/** Permanent moves: request path (no trailing slash) → canonical path. */
export const PERMANENT_REDIRECTS: Readonly<Record<string, string>> = {
  "/classement": "/matches/standings",
  "/standings": "/matches/standings",
  "/matches/classement": "/matches/standings",
  // The calendar is the Matches page; "Botola Pro" has no page of its own
  // beyond the home page (SEO brief 3.4, 2026-10-27).
  "/calendrier": "/matches",
  "/botola-pro": "/",
};

/** Whether a path still holds an unfilled route parameter (`$name` or `%24name`). */
export function hasUnfilledRouteParam(pathname: string): boolean {
  return pathname.split("/").some((segment) => /^(\$|%24)/i.test(segment));
}

export function earlySeoResponse(requestUrl: string): Response | null {
  let url: URL;
  try {
    url = new URL(requestUrl);
  } catch {
    return null;
  }
  if (hasUnfilledRouteParam(url.pathname)) {
    return new Response("Page introuvable", {
      status: 404,
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-robots-tag": "noindex",
        "cache-control": "public, max-age=3600",
      },
    });
  }
  const path = url.pathname.length > 1 ? url.pathname.replace(/\/+$/, "") : url.pathname;
  const target = PERMANENT_REDIRECTS[path.toLowerCase()];
  if (target) {
    return new Response(null, {
      status: 301,
      headers: { location: `${target}${url.search}`, "cache-control": "public, max-age=86400" },
    });
  }
  return null;
}
