import { currentRelease } from "./operational-errors";

/** The hosts that serve the public site (not Lovable's editor preview). */
const PRODUCTION_HOSTS = new Set(["botolago.com", "www.botolago.com"]);

/** `Cross-Origin-Opener-Policy` of every page of the public site. */
export const SITE_OPENER_POLICY = "same-origin-allow-popups";

function supabaseOrigin(): string | undefined {
  const value = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  try {
    return value ? new URL(value).origin : undefined;
  } catch {
    return undefined;
  }
}

/**
 * The Content Security Policy the site is measured against, sent as
 * `Content-Security-Policy-Report-Only` (nothing is blocked; a browser only
 * logs what the policy would have refused). It lists what the pages really
 * load, so a later enforcing policy can start from it:
 *
 * - scripts: the site's own files, the inline ones the head carries (theme,
 *   splash and native-app flags, the Seline stub, the JSON-LD blocks) and
 *   Seline's script; styles: own files and inline `style` attributes.
 *   `'unsafe-eval'` is there for one reason: zod's startup probe
 *   (`try { Function("") }`, in the validation chunk) is a CSP violation even
 *   though it is caught, and a report-only policy would log it on every page
 *   as a console error. Measured against the built site (Playwright, 14 pages,
 *   French and Arabic) it is the only thing the policy flags. An enforcing
 *   policy can drop it: zod then falls back to its non-eval path;
 * - connections: the site, the Supabase project (REST, RPC, Auth, Storage and
 *   Edge Functions, plus Realtime over wss) and Seline's collector;
 * - images: the site, Storage, `data:`/`blob:` pictures (the card renderer and
 *   share images) and any https picture, because an article's photograph may
 *   come from the publisher's own address (`MediaLocation.sourceUrl`);
 * - fonts: self-hosted only; no plugin objects; `base` and form targets stay on
 *   the site. `frame-ancestors` is the enforced header beside it.
 *
 * `supabase` is the project's origin; without one the policy names the host
 * family instead of a project.
 */
export function contentSecurityPolicyReportOnly(
  supabase: string | undefined = supabaseOrigin(),
): string {
  const project = supabase ?? "https://*.supabase.co";
  const realtime = project.replace(/^https:/, "wss:");
  return [
    "default-src 'self'",
    "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.seline.com",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src 'self' ${project} ${realtime} https://api.seline.com`,
    "media-src 'self' blob: https:",
    "worker-src 'self' blob:",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join("; ");
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
    if ((response.headers.get("content-type") ?? "").toLowerCase().includes("text/html")) {
      values["cross-origin-opener-policy"] = SITE_OPENER_POLICY;
      values["content-security-policy-report-only"] = contentSecurityPolicyReportOnly();
    }
  }
  return setHeaders(response, values);
}
