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
 * A club as a SportsTeam. Only identity the public club page actually knows
 * is emitted: name, canonical page, sport, optional city and optional crest.
 */
export function sportsTeamJsonLd(input: {
  readonly canonicalUrl: string;
  readonly name: string;
  readonly city?: string | null;
  readonly logoUrl?: string | null;
  /** Other names the club goes by (its full name, when `name` is the short one). */
  readonly alternateNames?: readonly (string | null | undefined)[];
}): JsonLd {
  const city = input.city?.trim();
  const logo = input.logoUrl?.trim();
  const alternateName = [
    ...new Set(
      (input.alternateNames ?? [])
        .map((value) => value?.trim())
        .filter((value): value is string => Boolean(value) && value !== input.name),
    ),
  ];
  return {
    "@context": "https://schema.org",
    "@type": "SportsTeam",
    name: input.name,
    ...(alternateName.length ? { alternateName } : {}),
    url: input.canonicalUrl,
    sport: "Football",
    ...(city ? { location: { "@type": "City", name: city } } : {}),
    ...(logo ? { logo } : {}),
  };
}

/**
 * A player as a Person who plays for a club. Only what the player page holds:
 * the name, the page, his position as `jobTitle`, an approved photo and the
 * club. Nationality and date of birth are not stored, so they are not emitted.
 */
export function personJsonLd(input: {
  readonly canonicalUrl: string;
  readonly name: string;
  readonly jobTitle?: string | null;
  readonly imageUrl?: string | null;
  readonly team?: { readonly name: string; readonly url: string } | null;
}): JsonLd {
  const jobTitle = input.jobTitle?.trim();
  const image = input.imageUrl?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "Person",
    name: input.name,
    url: input.canonicalUrl,
    ...(jobTitle ? { jobTitle } : {}),
    ...(image ? { image } : {}),
    ...(input.team
      ? {
          memberOf: {
            "@type": "SportsTeam",
            name: input.team.name,
            url: input.team.url,
            sport: "Football",
          },
        }
      : {}),
  };
}

/** A side of a match, as far as the page knows it. */
export interface EventTeam {
  readonly name: string;
  /** The club page (`/clubs/<id>`), absolute. */
  readonly url?: string | null;
  readonly logoUrl?: string | null;
}

/** Who runs Botola Pro (and Botola 2): the professional league. */
export const BOTOLA_ORGANIZER = {
  "@type": "SportsOrganization",
  name: "Ligue Nationale de Football Professionnel (LNFP)",
  alternateName: "LNFP",
} as const;

/**
 * How long a match is taken to last for `endDate`: 90 minutes, the 15 of
 * half-time and ten of stoppage. schema.org wants an end and a match has no
 * other one to give before it is played; the start is what is a fact.
 */
export const MATCH_DURATION_MS = 115 * 60_000;

function eventTeamJsonLd(team: EventTeam): JsonLd {
  const url = team.url?.trim();
  const logo = team.logoUrl?.trim();
  return {
    "@type": "SportsTeam",
    name: team.name,
    ...(url ? { url } : {}),
    ...(logo ? { logo } : {}),
  };
}

/**
 * A match as a SportsEvent. The start is given only when the provider has
 * confirmed it: a postponed match's date and the 00:00 UTC placeholder of an
 * unscheduled kick-off are not facts.
 *
 * `location` is always there: Google counts an event without one as invalid
 * (Search Console, 2026-10-27: four invalid items, all for that). It is the
 * stadium when the match has one; for a league match without one it is still
 * truthfully "in Morocco" (the address's country), and never a stadium the
 * data does not name. A league match also names its organiser, the LNFP;
 * a cup or international match does not, since the data does not say who
 * runs it.
 */
export function sportsEventJsonLd(input: {
  readonly canonicalUrl: string;
  readonly match: Pick<Match, "kickoff" | "status" | "dateUnconfirmed" | "calledOff" | "venue">;
  readonly home: EventTeam;
  readonly away: EventTeam;
  /** Whether the match belongs to a league season (Botola), not a cup. */
  readonly league?: boolean;
  readonly description?: string | null;
  /** Fallback share picture when neither club has a crest. */
  readonly imageUrl?: string | null;
}): JsonLd {
  const { match, home, away } = input;
  const startKnown = !isKickoffDateUnconfirmed(match) && !isKickoffTimeUnconfirmed(match);
  const start = Date.parse(match.kickoff);
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
  const location: JsonLd | null =
    venue || input.league
      ? {
          "@type": "Place",
          name: venue || "Maroc",
          ...(input.league ? { address: { "@type": "PostalAddress", addressCountry: "MA" } } : {}),
        }
      : null;
  const homeTeam = eventTeamJsonLd(home);
  const awayTeam = eventTeamJsonLd(away);
  const images = [home.logoUrl, away.logoUrl, input.imageUrl]
    .map((url) => url?.trim())
    .filter((url): url is string => Boolean(url));
  const description = input.description?.trim();
  return {
    "@context": "https://schema.org",
    "@type": "SportsEvent",
    name: `${home.name} – ${away.name}`,
    url: input.canonicalUrl,
    sport: "Football",
    ...(startKnown && Number.isFinite(start)
      ? {
          startDate: new Date(start).toISOString(),
          endDate: new Date(start + MATCH_DURATION_MS).toISOString(),
        }
      : {}),
    eventStatus,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    homeTeam,
    awayTeam,
    competitor: [homeTeam, awayTeam],
    performer: [homeTeam, awayTeam],
    ...(location ? { location } : {}),
    ...(input.league ? { organizer: BOTOLA_ORGANIZER } : {}),
    ...(images.length ? { image: [...new Set(images)] } : {}),
    ...(description ? { description } : {}),
  };
}

/**
 * A page's visible questions and answers as `FAQPage` data. Google requires
 * the marked-up text to be the text on the page, so the caller builds `items`
 * from the same dictionary entries it renders; each answer is plain text.
 */
export function faqPageJsonLd(
  items: readonly { readonly question: string; readonly answer: string }[],
): JsonLd {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: items.map((item) => ({
      "@type": "Question",
      name: item.question,
      acceptedAnswer: { "@type": "Answer", text: item.answer },
    })),
  };
}
