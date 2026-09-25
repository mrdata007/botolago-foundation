import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { ANALYTICS_ENABLED } from "@/lib/feature-flags";

/**
 * Audience measurement (BG-0146, plan §11): Seline, chosen by the owner on
 * 2026-09-25 in place of Plausible. No cookie and no identifier on the phone,
 * hosted in the EU. Page views, and five Pronostics events sent by name only:
 * no properties, no identifiers.
 *
 * The script is told not to count pages on its own (`data-auto-page-view`
 * off): it would send each address whole, query string included. Page views
 * are sent from here instead, the address cleaned before it leaves the phone:
 *   - no "#…": an invite code lives there, and a sign-in's tokens;
 *   - no query string but the campaign tags: sign-in codes and unsubscribe
 *     tokens live there, and the share links' `utm_*` tags are the only part
 *     the statistics need;
 *   - no league id: a private league's page is counted as `…/*`;
 *   - nothing at all from the staff pages.
 *
 * An event carries the address it was sent from, and that part is Seline's:
 * the path and query string, never the "#…". The league pages are the only
 * ones where an event can fire with an id in the path, so the script masks
 * them the same way (`SELINE_MASK_PATTERNS`).
 *
 * Only botolago.com is measured: a preview deployment or a local production
 * build loads the script but sends nothing.
 */

export const SELINE_SCRIPT_SRC = "https://cdn.seline.com/seline.js";
/** The site's token, from the Seline project. It is public: every page carries it. */
export const SELINE_TOKEN = "041a77dce92a51b";
/**
 * Paths reported in their place, first match wins. A named page masks to
 * itself, so only the league ids fall through to `*` (one path segment).
 */
export const SELINE_MASK_PATTERNS =
  "[/pronostics/ligues/rejoindre, /pronostics/ligues/*, /fantasy/leagues/join, /fantasy/leagues/*]";
/**
 * Keeps calls made before the script arrives; the script replays its `queue`
 * on load, then takes the name over.
 */
export const SELINE_QUEUE_SCRIPT =
  "window.seline=window.seline||{queue:[],track:function(){window.seline.queue.push({method:'track',args:[].slice.call(arguments)})},page:function(){window.seline.queue.push({method:'page',args:[].slice.call(arguments)})}}";

/** Switched on, in a production build: a development server never measures. */
export const ANALYTICS_ACTIVE = ANALYTICS_ENABLED && import.meta.env.PROD === true;

const MEASURED_HOST = new URL(PUBLIC_SITE_ORIGIN).hostname;

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

type Seline = { track: (event: string) => void; page: (path: string) => void };

function seline(): Seline | null {
  if (!ANALYTICS_ACTIVE || typeof window === "undefined") return null;
  if (window.location.hostname !== MEASURED_HOST) return null;
  const candidate = (window as Window & { seline?: Partial<Seline> }).seline;
  return typeof candidate?.track === "function" && typeof candidate.page === "function"
    ? (candidate as Seline)
    : null;
}

/** One event. Nothing on the server, while off, or without the script; never throws. */
export function track(event: AnalyticsEvent): void {
  const send = seline();
  if (!send) return;
  try {
    send.track(event);
  } catch {
    // Measurement never breaks the page.
  }
}

const CAMPAIGN_PARAMS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"];
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const LEAGUE_PAGE = new RegExp(`^(/(?:pronostics/ligues|fantasy/leagues)/)${UUID}(?=/|$)`, "i");

/** The path a page view reports, cleaned; null for a page that is not counted. */
export function pageviewPath(href: string): string | null {
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
  return `${url.pathname.replace(LEAGUE_PAGE, "$1*")}${query ? `?${query}` : ""}`;
}

/** A page view of the page on screen, its address cleaned first. */
export function trackPageview(): void {
  const send = seline();
  if (!send) return;
  const path = pageviewPath(window.location.href);
  if (!path) return;
  try {
    send.page(path);
  } catch {
    // As above.
  }
}
