import { currentRelease } from "./operational-errors";

/** The hosts that serve the public site (not Lovable's editor preview). */
const PRODUCTION_HOSTS = new Set(["botolago.com", "www.botolago.com"]);

/**
 * Public HTML may sit at the host's edge for a minute and be served stale for
 * five while it refreshes, so a burst of visitors costs one render. Browsers
 * still revalidate (`max-age=0`).
 *
 * Safe because the server render is anonymous and identical for everyone: the
 * Supabase session lives in `localStorage` (never a cookie, never read by the
 * server), the language is chosen in the browser, the only CSP the server sets
 * is the static `frame-ancestors 'self'` (no per-request nonce), and the
 * document carries no per-visitor value.
 */
export const PUBLIC_HTML_CACHE_CONTROL =
  "public, max-age=0, s-maxage=60, stale-while-revalidate=300";

/** What the cache rule needs to know about the request. */
export interface PublicCacheRequest {
  method: string;
  /** True when the request carries an `Authorization` header. */
  hasAuthorization?: boolean;
}

/** Paths that are never shared-cached even if their response looks public. */
const UNCACHED_PATHS =
  /^\/(curva|plus|suppression-compte|unsubscribe|dev|mcp|api|_serverFn|\.lovable|\.well-known|journee)(\/|$|\.)/;

function isSharedCacheable(
  response: Response,
  path: string,
  request?: PublicCacheRequest,
): boolean {
  if (!request) return false;
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return false;
  if (request.hasAuthorization) return false;
  if (response.status !== 200) return false;
  if (response.headers.has("cache-control") || response.headers.has("set-cookie")) return false;
  if (response.headers.has("x-botolago-unavailable")) return false;
  if (!(response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
    return false;
  }
  return !UNCACHED_PATHS.test(path);
}

function setHeaders(response: Response, values: Record<string, string>): Response {
  try {
    for (const [name, value] of Object.entries(values)) response.headers.set(name, value);
    return response;
  } catch {
    // Immutable headers (a fetched or redirect response): copy them.
    const headers = new Headers(response.headers);
    for (const [name, value] of Object.entries(values)) headers.set(name, value);
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }
}

/**
 * Headers every response of the site carries.
 *
 * - `x-botolago-release`: the commit that served it, so "is the fix live?" is
 *   one `curl -I` away and the production watchdog can compare it with
 *   `main`. On 2026-09-24 the live login page was days behind `main` and
 *   nothing showed it.
 * - On botolago.com only, `frame-ancestors 'self'` and `X-Frame-Options`: no
 *   other site may frame the pages (the audit framed /auth/login and /admin
 *   from another origin). Not on other hosts, because Lovable's editor
 *   frames its preview of the app from lovable.dev.
 */
export function withSiteHeaders(
  response: Response,
  requestUrl: string,
  release = currentRelease(),
  request?: PublicCacheRequest,
): Response {
  const values: Record<string, string> = { "x-botolago-release": release };
  let host = "";
  let path = "";
  try {
    const url = new URL(requestUrl);
    host = url.hostname.toLowerCase();
    path = url.pathname;
  } catch {
    // Not an absolute URL: no host-specific headers.
  }
  // Personalized responses and auth redirects must never enter a shared cache.
  // The Fantasy hub itself (`/fantasy`) reads the visitor's team and leagues.
  if (
    /^\/(auth|admin|profile|notifications|settings|pronostics\/ligues)(\/|$)/.test(path) ||
    (/^\/fantasy(\/|$)/.test(path) && !["/fantasy/rules", "/fantasy/prizes"].includes(path))
  ) {
    values["cache-control"] = "private, no-store";
  } else if (isSharedCacheable(response, path, request)) {
    values["cache-control"] = PUBLIC_HTML_CACHE_CONTROL;
  }
  if (PRODUCTION_HOSTS.has(host)) {
    values["content-security-policy"] = "frame-ancestors 'self'";
    values["x-frame-options"] = "SAMEORIGIN";
  }
  return setHeaders(response, values);
}
