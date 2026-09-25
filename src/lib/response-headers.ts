import { currentRelease } from "./operational-errors";

/** The hosts that serve the public site (not Lovable's editor preview). */
const PRODUCTION_HOSTS = new Set(["botolago.com", "www.botolago.com"]);

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
  }
  if (PRODUCTION_HOSTS.has(host)) {
    values["content-security-policy"] = "frame-ancestors 'self'";
    values["x-frame-options"] = "SAMEORIGIN";
  }
  return setHeaders(response, values);
}
