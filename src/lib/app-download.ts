import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

/**
 * Where the phone app is downloaded: the two store pages, the short address
 * the QR code holds, and which store a phone belongs to.
 *
 * The store addresses are the only thing to change when the app is
 * published. Until one is set it stays `null`: the download page then shows
 * that store's badge as "coming soon" without a link, and `/app` sends the
 * phone to the download page instead of a store page that does not exist.
 *
 * - App Store: `https://apps.apple.com/app/id<number>`, the number App Store
 *   Connect gives the app (App Information, "Apple ID").
 * - Google Play: `https://play.google.com/store/apps/details?id=botolago.com`,
 *   the app id from `capacitor.config.ts`; it opens once the listing is live.
 */
export const APP_STORE_URL: string | null = null;
export const GOOGLE_PLAY_URL: string | null = null;

/** The download page itself. */
export const DOWNLOAD_PAGE_PATH = "/telecharger";

/**
 * The short address in the QR code. It is not a store page but a redirect
 * (`src/routes/app.ts`), so a printed code keeps working whatever the store
 * addresses become.
 */
export const APP_SHORT_PATH = "/app";
export const APP_SHORT_URL = `${PUBLIC_SITE_ORIGIN}${APP_SHORT_PATH}`;

export type AppStore = "ios" | "android";

export interface StoreLinks {
  readonly ios: string | null;
  readonly android: string | null;
}

export const STORE_LINKS: StoreLinks = { ios: APP_STORE_URL, android: GOOGLE_PLAY_URL };

/**
 * Which store a browser's user agent belongs to, or `null` for a computer or
 * anything unknown. iPadOS Safari reports itself as a Mac, so an iPad that
 * does so lands on the download page, which shows both badges.
 */
export function storeForUserAgent(userAgent: string | null | undefined): AppStore | null {
  if (!userAgent) return null;
  if (/\b(iPhone|iPad|iPod)\b/i.test(userAgent)) return "ios";
  if (/\bAndroid\b/i.test(userAgent)) return "android";
  return null;
}

/**
 * Where `/app` sends a visitor: their phone's store when its address is set,
 * the download page otherwise.
 */
export function appRedirectTarget(
  userAgent: string | null | undefined,
  links: StoreLinks = STORE_LINKS,
): string {
  const store = storeForUserAgent(userAgent);
  return (store && links[store]) || DOWNLOAD_PAGE_PATH;
}
