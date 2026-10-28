import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { matchDayLabel, clubSearchName } from "@/lib/seo-titles";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import type { Club, LocalizedString, Match } from "@/types/domain";

/**
 * The two rivalry pages (SEO brief 3.4, 2026-10-27): `/derby-casablanca`
 * (Wydad – Raja) and `/classico-wac-far` (Wydad – AS FAR).
 *
 * Each page is the next meeting and the past results between two clubs, from
 * the fixtures the club pages already read. Nothing here is history written by
 * hand: no titles, no records, no attendance. The intro only says who the two
 * clubs are and what the page lists.
 *
 * The clubs are found by stable identity, never a UUID (those differ between
 * the databases): `app.clubs.slug` is the club's name plus a hash
 * ("wydad-casablanca-80a3fb8202ae"), so its stem identifies it; a club whose
 * slug does not carry the stem is found by its name.
 */

export type RivalryKey = "derby-casablanca" | "classico-wac-far";

interface ClubIdentity {
  /** The slug without its trailing hash. */
  readonly slugStem: string;
  /** Every one of these must match the club's lower-cased, unaccented names. */
  readonly nameAll: readonly RegExp[];
}

const WYDAD: ClubIdentity = {
  slugStem: "wydad-casablanca",
  nameAll: [/\bwydad\b/],
};
const RAJA: ClubIdentity = {
  slugStem: "raja-casablanca",
  nameAll: [/\braja\b/, /casablanca|club athletic|\bca\b|\brca\b/],
};
const FAR: ClubIdentity = {
  slugStem: "far-rabat",
  nameAll: [/\bfar\b|forces armees royales/],
};

export interface Rivalry {
  readonly key: RivalryKey;
  readonly path: `/${RivalryKey}`;
  /** Listed first, as the title names them. */
  readonly clubs: readonly [ClubIdentity, ClubIdentity];
  readonly title: LocalizedString;
  readonly h1: LocalizedString;
  /** The breadcrumb's last step. */
  readonly crumb: LocalizedString;
}

export const RIVALRIES: Readonly<Record<RivalryKey, Rivalry>> = {
  "derby-casablanca": {
    key: "derby-casablanca",
    path: "/derby-casablanca",
    clubs: [WYDAD, RAJA],
    title: {
      fr: "Derby de Casablanca : Wydad – Raja, prochain match et résultats | BotolaGO",
      ar: "ديربي الدار البيضاء: الوداد – الرجاء، المباراة القادمة والنتائج | BotolaGO",
    },
    h1: { fr: "Derby Wydad – Raja", ar: "ديربي الوداد والرجاء" },
    crumb: { fr: "Derby de Casablanca", ar: "ديربي الدار البيضاء" },
  },
  "classico-wac-far": {
    key: "classico-wac-far",
    path: "/classico-wac-far",
    clubs: [WYDAD, FAR],
    title: {
      fr: "Classico WAC – FAR : Wydad – AS FAR, prochain match et résultats | BotolaGO",
      ar: "كلاسيكو الوداد – الجيش الملكي: المباراة القادمة والنتائج | BotolaGO",
    },
    h1: { fr: "Classico Wydad – AS FAR", ar: "كلاسيكو الوداد والجيش الملكي" },
    crumb: { fr: "Classico WAC – FAR", ar: "كلاسيكو الوداد – الجيش الملكي" },
  },
};

export function rivalryByKey(key: string): Rivalry | undefined {
  return Object.hasOwn(RIVALRIES, key) ? RIVALRIES[key as RivalryKey] : undefined;
}

function plain(value: string | null | undefined): string {
  return (value ?? "")
    .normalize("NFD")
    .replace(/\p{M}+/gu, "")
    .toLowerCase();
}

/** Whether a club is the one an identity names: its slug stem first, else its name. */
export function isClubIdentity(club: Club, identity: ClubIdentity): boolean {
  const slug = plain(club.slug);
  if (slug) {
    if (slug === identity.slugStem) return true;
    if (new RegExp(`^${identity.slugStem}-[0-9a-f]{6,}$`).test(slug)) return true;
  }
  const names = [club.name.fr, club.shortName.fr, club.name.ar, club.shortName.ar]
    .map(plain)
    .join(" | ");
  return identity.nameAll.every((pattern) => pattern.test(names));
}

/** The two clubs of a rivalry among a list, or `null` when either is missing. */
export function findRivalryClubs(
  rivalry: Rivalry,
  clubs: readonly Club[],
): readonly [Club, Club] | null {
  const [first, second] = rivalry.clubs.map((identity) => {
    // A slug match wins over a name match, so a lookalike never shadows the club.
    const bySlug = clubs.filter((club) => {
      const slug = plain(club.slug);
      return slug === identity.slugStem || slug.startsWith(`${identity.slugStem}-`);
    });
    if (bySlug.length === 1) return bySlug[0];
    const byName = clubs.filter((club) => isClubIdentity(club, identity));
    return byName.length === 1 ? byName[0] : undefined;
  });
  return first && second && first.id !== second.id ? [first, second] : null;
}

export interface RivalryMeetings {
  /** The meeting still to play, soonest first; the first is "the next match". */
  readonly upcoming: readonly Match[];
  /** Finished meetings with a score, newest first. */
  readonly results: readonly Match[];
}

/** Sorts a club's fixtures against the other club into what is next and what is past. */
export function splitMeetings(
  matches: readonly Match[],
  a: string,
  b: string,
  now: number,
): RivalryMeetings {
  const between = matches.filter(
    (match) =>
      (match.homeClubId === a && match.awayClubId === b) ||
      (match.homeClubId === b && match.awayClubId === a),
  );
  const time = (match: Match) => Date.parse(match.kickoff);
  const upcoming = between
    .filter(
      (match) =>
        (match.status === "scheduled" || match.status === "live") &&
        (match.status === "live" || time(match) >= now),
    )
    .sort((x, y) => time(x) - time(y));
  const results = between
    .filter(
      (match) =>
        match.status === "finished" &&
        match.homeScore !== undefined &&
        match.awayScore !== undefined,
    )
    .sort((x, y) => time(y) - time(x));
  return { upcoming, results };
}

/** Wins of each club and draws across finished meetings, from their scores alone. */
export function tallyMeetings(
  results: readonly Match[],
  a: string,
  b: string,
): { aWins: number; draws: number; bWins: number } {
  let aWins = 0;
  let draws = 0;
  let bWins = 0;
  for (const match of results) {
    if (match.homeScore === undefined || match.awayScore === undefined) continue;
    if (match.homeScore === match.awayScore) draws += 1;
    else {
      const winner = match.homeScore > match.awayScore ? match.homeClubId : match.awayClubId;
      if (winner === a) aWins += 1;
      else if (winner === b) bWins += 1;
    }
  }
  return { aWins, draws, bWins };
}

/** The meta description, from the clubs' names and, when there is one, the next meeting. */
export function rivalrySeoDescription(
  clubs: readonly [Club, Club],
  next: Match | undefined,
): string {
  const [a, b] = clubs;
  const names = `${clubSearchName(a)} – ${clubSearchName(b)}`;
  const day = next ? matchDayLabel(next) : null;
  const upcoming = day ? ` Prochain match le ${day}.` : "";
  return (
    `${names} : le prochain match, les résultats des dernières rencontres et le détail ` +
    `de chaque match en Botola Pro.${upcoming}`
  ).slice(0, 300);
}

/** Breadcrumb data for a rivalry page. */
export function rivalryJsonLd(rivalry: Rivalry): Record<string, unknown>[] {
  return [
    breadcrumbJsonLd([
      { name: "Accueil", path: "/" },
      { name: "Matchs", path: "/matches" },
      { name: rivalry.crumb.fr, path: rivalry.path },
    ]),
  ];
}

export function rivalryCanonical(rivalry: Rivalry): string {
  return `${PUBLIC_SITE_ORIGIN}${rivalry.path}`;
}

/** The query the route's loader warms and the page reads, so both share the server's data. */
export const rivalryQueryKey = (key: RivalryKey, lang: string) =>
  ["football", "rivalry", key, lang] as const;
