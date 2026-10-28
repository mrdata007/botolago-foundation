/**
 * Links to botolago.com opened in the phone app (ST-2).
 *
 * Once the store identifiers are in `public/.well-known/` (Android's
 * `assetlinks.json`, Apple's `apple-app-site-association`), a botolago.com
 * link tapped on a phone with the app opens the app instead of the browser.
 * The app shows the live site, so all it needs is the page: this turns the
 * link the phone hands over into the address to open in the app.
 */

/** The hosts whose links the app answers for. */
export const APP_LINK_HOSTS = new Set(["botolago.com", "www.botolago.com"]);

/**
 * The in-app address (path, query and fragment) of a link the phone handed to
 * the app, or null for a link the app does not answer for.
 */
export function appLinkPath(link: string): string | null {
  let url: URL;
  try {
    url = new URL(link);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !APP_LINK_HOSTS.has(url.hostname.toLowerCase())) return null;
  return `${url.pathname}${url.search}${url.hash}`;
}

/**
 * Apple's file for the app links, served at
 * /.well-known/apple-app-site-association (`src/routes/[.]well-known.apple-app-site-association.ts`):
 * every page of botolago.com opens in the app with this Team ID and bundle id.
 * The Team ID is the owner's to give (Apple Developer > Membership); the
 * bundle id is the app id of capacitor.config.ts.
 */
export const APPLE_APP_SITE_ASSOCIATION = {
  applinks: {
    details: [
      {
        appIDs: ["TODO_OWNER_APPLE_TEAM_ID.botolago.com"],
        components: [{ "/": "/*", comment: "Every page of botolago.com opens in the app." }],
      },
    ],
  },
} as const;
