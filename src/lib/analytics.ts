import { ANALYTICS_ENABLED } from "@/lib/feature-flags";

/**
 * Audience measurement (BG-0146, plan §11): Plausible Analytics, without
 * cookies, storing nothing on the phone, hosted in the EU. Page views, and
 * five Pronostics events sent by name only: no properties, no identifiers.
 *
 * Page views are sent by hand (Plausible's "manual" script) so that the
 * address is cleaned before it leaves the phone:
 *   - no "#…": an invite code lives there, and a sign-in's tokens;
 *   - no query string but the campaign tags: sign-in codes and unsubscribe
 *     tokens live there, and the share links' `utm_*` tags are the only part
 *     the statistics need;
 *   - no league id: a private league's page is counted as `…/:id`;
 *   - nothing at all from the staff pages.
 */

export const PLAUSIBLE_DOMAIN = "botolago.com";
export const PLAUSIBLE_SCRIPT_SRC = "https://plausible.io/js/script.manual.js";
/** Keeps calls made before the script arrives; the script sends them on load. */
export const PLAUSIBLE_QUEUE_SCRIPT =
  "window.plausible=window.plausible||function(){(window.plausible.q=window.plausible.q||[]).push(arguments)}";

/** Switched on, in a production build: a development server never measures. */
export const ANALYTICS_ACTIVE = ANALYTICS_ENABLED && import.meta.env.PROD === true;

export type AnalyticsEvent =
  /** A guest's first prediction of a journée on this phone. */
  | "pronostics_guest_start"
  /** The same moment, when this phone also played the journée before. */
  | "pronostics_guest_start_returning"
  /** A guest has predicted every match of the journée still open. */
  | "pronostics_guest_complete"
  /** A guest taps "Créer mon compte" anywhere in Pronostics. */
  | "pronostics_signup_click"
  /** Any share: the journée, or a league's invite link. */
  | "pronostics_share";

type Plausible = (event: string, options?: { u: string }) => void;

function plausible(): Plausible | null {
  if (!ANALYTICS_ACTIVE || typeof window === "undefined") return null;
  const candidate = (window as Window & { plausible?: unknown }).plausible;
  return typeof candidate === "function" ? (candidate as Plausible) : null;
}

/** One event. Nothing on the server, while off, or without the script; never throws. */
export function track(event: AnalyticsEvent): void {
  const send = plausible();
  if (!send) return;
  try {
    send(event);
  } catch {
    // Measurement never breaks the page.
  }
}

const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LEAGUE_PAGE = new RegExp(`^(/(?:pronostics/ligues|fantasy/leagues)/)${UUID}(?=/|$)`, "i");

/** The address a page view reports, cleaned; null for a page that is not counted. */
export function pageviewUrl(href: string): string | null {
  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return null;
  }
  if (url.pathname === "/admin" || url.pathname.startsWith("/admin/")) return null;
  const kept = new URLSearchParams();
  for (const name of CAMPAIGN_PARAMS) {
    const value = url.searchParams.get(name);
    if (value) kept.set(name, value);
  }
  const query = kept.toString();
  return `${url.origin}${url.pathname.replace(LEAGUE_PAGE, "$1:id")}${query ? `?${query}` : ""}`;
}

/** A page view of the page on screen, its address cleaned first. */
export function trackPageview(): void {
  const send = plausible();
  if (!send) return;
  const u = pageviewUrl(window.location.href);
  if (!u) return;
  try {
    send("pageview", { u });
  } catch {
    // As above.
  }
}
