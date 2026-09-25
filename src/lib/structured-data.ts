import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import { isKickoffDateUnconfirmed, isKickoffTimeUnconfirmed } from "@/lib/match-kickoff";
import type { Match } from "@/types/domain";

/**
 * schema.org structured data beyond the articles' NewsArticle
 * (`buildArticleJsonLd`). Every value comes from the site itself or from the
 * data the page renders; a fact the site does not hold is left out rather
 * than guessed (no search box, no scores, no placeholder kick-off time).
 * Serialise with `serializeJsonLd` from `@/lib/article-meta`.
 */

export const ORGANIZATION_ID = `${PUBLIC_SITE_ORIGIN}/#organization`;
export const WEBSITE_ID = `${PUBLIC_SITE_ORIGIN}/#website`;

type JsonLd = Record<string, unknown>;

/**
 * Who publishes the site, and the site: on the home page. The logo is the
 * 180 px icon botolago.com serves. No SearchAction: the site has no search
 * URL a search engine could fill in.
 */
export function siteJsonLd(): JsonLd {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Organization",
        "@id": ORGANIZATION_ID,
        name: "BotolaGO",
        url: `${PUBLIC_SITE_ORIGIN}/`,
        logo: {
          "@type": "ImageObject",
          url: `${PUBLIC_SITE_ORIGIN}/apple-touch-icon.png`,
          width: 180,
          height: 180,
        },
      },
      {
        "@type": "WebSite",
        "@id": WEBSITE_ID,
        name: "BotolaGO",
        url: `${PUBLIC_SITE_ORIGIN}/`,
        inLanguage: ["fr", "ar"],
        publisher: { "@id": ORGANIZATION_ID },
      },
    ],
  };
}

/** The trail from the home page to a page: `path` is site-relative. */
export function breadcrumbJsonLd(
  items: readonly { readonly name: string; readonly path: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${PUBLIC_SITE_ORIGIN}${item.path}`,
    })),
  };
}

/**
 * A match as a SportsEvent. The start is given only when the provider has
 * confirmed it: a postponed match's date and the 00:00 UTC placeholder of an
 * unscheduled kick-off are not facts. The venue only when the match has one.
 */
export function sportsEventJsonLd(input: {
  readonly canonicalUrl: string;
  readonly match: Pick<Match, "kickoff" | "status" | "dateUnconfirmed" | "calledOff" | "venue">;
  readonly homeName: string;
  readonly awayName: string;
}): JsonLd {
  const { match } = input;
  const startKnown = !isKickoffDateUnconfirmed(match) && !isKickoffTimeUnconfirmed(match);
  const venue = match.venue?.fr?.trim();
  // schema.org has five event statuses and none for "in progress" or
  // "completed": EventScheduled is a match that "is taking place or has taken
  // place on the startDate as scheduled", so it covers live and finished ones.
  const eventStatus =
    match.status === "postponed"
      ? match.calledOff
        ? "https://schema.org/EventCancelled"
        : "https://schema.org/EventPostponed"
      : "https://schema.org/EventScheduled";
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${input.homeName} – ${input.awayName}`,
    url: input.canonicalUrl,
    sport: "Football",
    ...(startKnown ? { startDate: new Date(match.kickoff).toISOString() } : {}),
    eventStatus,
    homeTeam: { "@type": "SportsTeam", name: input.homeName },
    awayTeam: { "@type": "SportsTeam", name: input.awayName },
    ...(venue ? { location: { "@type": "Place", name: venue } } : {}),
  };
}
