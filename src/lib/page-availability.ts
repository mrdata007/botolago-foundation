import { FootballError } from "@/backend/football/errors";
import { NewsError } from "@/backend/news/errors";

/**
 * What a public page's loader tells the crawler when it could not read its
 * data.
 *
 * Until 2026-09-24 the article, match and club loaders caught every failure
 * and returned `null`: an article then answered 200 with `noindex` (9 of 24
 * timed fetches during the audit's slow-database window), a missing match 200
 * with "Chargement…", a missing club 200 with "Club introuvable". A search
 * engine drops a page that says `noindex` and keeps a soft 404, which is the
 * wrong way round. Now:
 *
 *   - the thing does not exist (or is not public): `notFound()` -> HTTP 404;
 *   - the database or network failed: `{ unavailable: true }` -> HTTP 503
 *     with `Retry-After`, no `noindex`, so the page keeps its place and the
 *     crawler comes back;
 *   - otherwise the page renders with its data.
 *
 * The status is applied in `src/server.ts` (`withPageStatus`): the router
 * decides 200/404/500 itself, so the route marks the response with
 * UNAVAILABLE_HEADER and the server entry turns the mark into a 503.
 */
export const UNAVAILABLE_HEADER = "x-botolago-unavailable";
export const RETRY_AFTER_SECONDS = 120;

export interface Unavailable {
  readonly unavailable: true;
}

export const UNAVAILABLE: Unavailable = { unavailable: true };

export function isUnavailable(value: unknown): value is Unavailable {
  return typeof value === "object" && value !== null && (value as Unavailable).unavailable === true;
}

/** The failures that mean "there is no such public page", not "try later". */
export function isMissingContent(error: unknown): boolean {
  if (error instanceof NewsError) return error.code === "article_not_found";
  if (error instanceof FootballError) {
    return error.code === "fixture_not_found" || error.code === "team_not_found";
  }
  return false;
}

/** A route's `headers` for a loader outcome: the 503 mark, or nothing. */
export function unavailableHeaders(loaderData: unknown): Record<string, string> | undefined {
  if (!isUnavailable(loaderData)) return undefined;
  return {
    [UNAVAILABLE_HEADER]: "1",
    "Retry-After": String(RETRY_AFTER_SECONDS),
    "Cache-Control": "no-store",
  };
}

/** Server entry: a response the page marked unavailable becomes a 503. */
export function withPageStatus(response: Response): Response {
  if (response.headers.get(UNAVAILABLE_HEADER) !== "1" || response.status !== 200) {
    return response;
  }
  const headers = new Headers(response.headers);
  headers.delete(UNAVAILABLE_HEADER);
  return new Response(response.body, {
    status: 503,
    statusText: "Service Unavailable",
    headers,
  });
}
