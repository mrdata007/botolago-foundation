import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

/**
 * The address of the page a person is looking at, fit to hand to someone
 * else: no `#fragment` (an invite code or a sign-in token can live there) and
 * no campaign tags. The tags describe how the SHARER arrived (`utm_medium=whatsapp`
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
  for (const key of [...url.searchParams.keys()]) {
    if (key.toLowerCase().startsWith("utm_")) url.searchParams.delete(key);
  }
  return url.toString();
}
