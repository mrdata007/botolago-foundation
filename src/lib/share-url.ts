import { withoutSensitiveQuery } from "@/lib/auth-callback";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

/** Click identifiers other sites append to a link; they describe the sharer's visit, not the page. */
const CLICK_IDS = new Set(["fbclid", "gclid", "dclid", "msclkid", "igshid", "twclid"]);

/**
 * The address of the page a person is looking at, fit to hand to someone
 * else: no `#fragment` (an invite code or a sign-in token can live there) and
 * no campaign tags, no click identifiers and no credential or one-time-code
 * keys (`code`, `token`, `access_token`…, the same list a sign-in return drops).
 * The tags describe how the SHARER arrived (`utm_medium=whatsapp`
 * from the link they were sent); passed on, they would credit the next visit
 * to the first share. A query that selects what is shown (a round, a tab, a
 * comparison) is kept.
 */
export function shareablePageUrl(
  href: string,
  fallbackOrigin: string = PUBLIC_SITE_ORIGIN,
): string {
  let url: URL;
  try {
    url = new URL(href, fallbackOrigin);
  } catch {
    return fallbackOrigin;
  }
  url.hash = "";
  // Credential and one-time-code keys, written as they were (no re-encoding).
  url.search = withoutSensitiveQuery(url.search);
  for (const key of [...url.searchParams.keys()]) {
    const lower = key.toLowerCase();
    if (lower.startsWith("utm_") || CLICK_IDS.has(lower)) url.searchParams.delete(key);
  }
  return url.toString();
}
