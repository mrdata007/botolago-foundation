import { buildCanonicalArticleUrl, PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { buildClubSlugMap, clubPath } from "@/lib/club-slug";
import { PEPITES_PROMOTED, PRIZES_ENABLED, PRONOSTICS_PROMOTED } from "@/lib/feature-flags";

export interface SitemapNewsEntry {
  readonly id: string;
  readonly language: "fr" | "ar";
  readonly publishedAt: string;
  /** The edition's title; absent before migration 20261027150000. */
  readonly title?: string | null;
  /** When the text last really changed; absent before migration 20260924200600. */
  readonly contentUpdatedAt?: string | null;
  readonly translations: readonly { readonly id: string; readonly language: "fr" | "ar" }[];
}

/**
 * Public pages that are the same for every visitor. Personal pages (profile,
 * the manager's own team, auth) and the CMS are deliberately absent, and are
 * disallowed in robots.txt as well.
 */
export const SITEMAP_STATIC_PATHS = [
  "/",
  "/matches",
  "/matches/standings",
  "/clubs",
  "/fantasy",
  // The landing page: what Fantasy is, for a visitor who has never played.
  "/jouer",
  // Not /fantasy/players or /fantasy/fixtures: Search Console reported them as
  // duplicates (the lists load in the browser, so their server HTML is the
  // Fantasy frame alone). They stay reachable and indexable through links.
  "/fantasy/top-players",
  "/fantasy/rankings",
  "/fantasy/rules",
  "/fantasy/help",
  "/privacy",
  "/terms",
  // How to delete an account (the store listings' deletion URL).
  "/suppression-compte",
  // Redirected to the hub while prizes are off, so listed only when they are on.
  ...(PRIZES_ENABLED ? (["/prizes", "/prizes/terms"] as const) : ([] as const)),
  // Pronostics (BG-0146): indexed only once promoted.
  ...(PRONOSTICS_PROMOTED ? (["/pronostics"] as const) : ([] as const)),
  ...(PEPITES_PROMOTED
    ? (["/pepites", "/pepites/classement", "/pepites/methode"] as const)
    : ([] as const)),
] as const;

/** The sitemap protocol's maximum number of URLs in one sitemap file. */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * What /sitemap.xml promises: an article that stops being public is gone from
 * it within five minutes, and a newly published one appears within five.
 */
export const SITEMAP_FRESHNESS_SECONDS = 300;

/**
 * How old the News entries can be when the route reads them.
 * `api.news_sitemap_entries` serves a snapshot that the pg_cron job
 * `news-sitemap-refresh` recomputes every minute, but only while it is at most
 * this old; past that (the job paused, failing or gone) it computes the entries
 * live instead (migration 20260926003050, `interval '120 seconds'`, kept equal
 * to this by src/lib/sitemap.test.ts). Two minutes rather than one, so a single
 * late or skipped run does not send every request to the live computation.
 */
export const SITEMAP_SNAPSHOT_MAX_AGE_SECONDS = 120;

/**
 * Cache-Control for a good sitemap. A shared cache (the host's edge) may keep
 * it for what is left of the freshness budget once the snapshot's own age is
 * counted (three minutes); a browser for a minute (browsers count the Age a
 * shared cache reports, so they never extend it). `stale-if-error` (RFC 5861)
 * lets a shared cache that honours it keep serving this good copy for a day
 * while the route answers 503: the same last good copy a crawler keeps after a
 * 503 (past the five minutes: during an outage, availability wins). Browsers
 * and crawlers ignore `s-maxage` and `stale-if-error`, so where nothing honours
 * them they change nothing.
 */
export const SITEMAP_CACHE_CONTROL = [
  "public",
  "max-age=60",
  `s-maxage=${SITEMAP_FRESHNESS_SECONDS - SITEMAP_SNAPSHOT_MAX_AGE_SECONDS}`,
  "stale-if-error=86400",
].join(", ");

/**
 * The most club pages listed. Botola Pro has sixteen clubs; the margin covers
 * the fallback to the whole club catalogue and is reserved out of the News
 * budget so the file never passes `SITEMAP_MAX_URLS`.
 */
export const SITEMAP_CLUB_LIMIT = 100;

/**
 * How many News editions are read for the sitemaps. Each month's file holds
 * only its own, so this bounds the read, not a file; it was set when every
 * article shared one file with the other pages, and still leaves room for
 * them under `SITEMAP_MAX_URLS`.
 */
export const SITEMAP_NEWS_LIMIT =
  SITEMAP_MAX_URLS - SITEMAP_STATIC_PATHS.length - 1 - SITEMAP_CLUB_LIMIT;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * `/sitemap.xml` is a sitemap index (SEO brief, 2026-10-27), pointing at one
 * file per kind of page under `/sitemaps/<name>.xml`:
 *
 * - `static`: the public pages that are the same for every visitor (and
 *   `/news` while News is on);
 * - `clubs`: the club pages of the directory's season;
 * - `matches`: every fixture of the current season and the one before;
 * - `news-recent`: the Google News file, titled articles of the last 48 hours;
 * - `news-YYYY-MM`: the articles published that month (UTC).
 *
 * Search Console then reports each kind apart, a slow News read no longer
 * holds the club and match pages back, and no file comes near the protocol's
 * 50,000 URLs.
 */
export const SITEMAP_SECTIONS = ["static", "clubs", "matches"] as const;
export type SitemapSection = (typeof SITEMAP_SECTIONS)[number];

/** How many fixtures the match sitemap lists at most (two seasons are ~480). */
export const SITEMAP_MATCH_LIMIT = 5_000;

/** The Google News sitemap lists only articles from the last 48 hours (Google's rule). */
export const NEWS_RECENT_SITEMAP_NAME = "news-recent";
export const NEWS_RECENT_WINDOW_MS = 48 * 60 * 60 * 1000;
/** Google News: at most 1,000 `<url>` per news sitemap. */
export const NEWS_RECENT_MAX_URLS = 1_000;

const NEWS_MONTH = /^news-(\d{4})-(0[1-9]|1[0-2])$/;

export function sitemapUrl(name: string): string {
  return `${PUBLIC_SITE_ORIGIN}/sitemaps/${name}.xml`;
}

/** The month an article is filed under, `news-YYYY-MM` (UTC), or `null` for a bad date. */
export function newsSitemapName(entry: Pick<SitemapNewsEntry, "publishedAt">): string | null {
  const ms = Date.parse(entry.publishedAt);
  if (Number.isNaN(ms)) return null;
  return `news-${new Date(ms).toISOString().slice(0, 7)}`;
}

/**
 * What a `/sitemaps/<file>` name asks for: one of the sections, or a news
 * month, or `null` for anything else (a 404).
 */
export function parseSitemapName(
  file: string,
):
  | { kind: "section"; section: SitemapSection }
  | { kind: "news"; name: string }
  | { kind: "news-recent" }
  | null {
  const name = file.replace(/\.xml$/, "");
  if (name === file) return null;
  if (name === NEWS_RECENT_SITEMAP_NAME) return { kind: "news-recent" };
  if ((SITEMAP_SECTIONS as readonly string[]).includes(name)) {
    return { kind: "section", section: name as SitemapSection };
  }
  return NEWS_MONTH.test(name) ? { kind: "news", name } : null;
}

function entryLastmod(entry: SitemapNewsEntry): string | null {
  // The last real change, else publication: never `updatedAt`, which a
  // bulk update moved on every article on 2026-09-24 (audit P1-4).
  const modified = entry.contentUpdatedAt ?? entry.publishedAt;
  const ms = Date.parse(modified);
  return Number.isNaN(ms) ? null : new Date(ms).toISOString();
}

/**
 * The index: the sections, then one file per month that has an article
 * (newest first), each month with the latest change of its articles.
 */
export function buildSitemapIndexXml(options: {
  readonly newsEnabled: boolean;
  readonly news: readonly SitemapNewsEntry[];
  /** The clock for the Google News window; tests pass a fixed one. */
  readonly now?: Date;
}): string {
  const months = new Map<string, string | null>();
  if (options.newsEnabled) {
    for (const entry of options.news) {
      const name = newsSitemapName(entry);
      if (!name) continue;
      const modified = entryLastmod(entry);
      const known = months.get(name);
      if (!months.has(name) || (modified && (!known || modified > known))) {
        months.set(name, modified);
      }
    }
  }
  const recent = options.newsEnabled ? recentNewsEntries(options.news, options.now) : [];
  const items = [
    ...SITEMAP_SECTIONS.map((name) => ({ name, lastmod: null as string | null })),
    // The Google News file, listed while News is on even when it is empty.
    ...(options.newsEnabled
      ? [
          {
            name: NEWS_RECENT_SITEMAP_NAME as string,
            lastmod: recent[0] ? new Date(Date.parse(recent[0].publishedAt)).toISOString() : null,
          },
        ]
      : []),
    ...[...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([name, lastmod]) => ({ name, lastmod })),
  ];
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...items.map(
      ({ name, lastmod }) =>
        `  <sitemap><loc>${escapeXml(sitemapUrl(name))}</loc>${
          lastmod ? `<lastmod>${lastmod}</lastmod>` : ""
        }</sitemap>`,
    ),
    "</sitemapindex>",
    "",
  ].join("\n");
}

function urlset(urls: readonly string[]): string {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}

const pageUrl = (path: string) =>
  `  <url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></url>`;

/** The static pages, and the /news hub while News is on. */
export function buildStaticSitemapXml(options: { readonly newsEnabled: boolean }): string {
  return urlset([
    ...SITEMAP_STATIC_PATHS.map(pageUrl),
    ...(options.newsEnabled ? [pageUrl("/news")] : []),
  ]);
}

/**
 * Each club page once, at its canonical URL: the readable slug address
 * (`/clubs/rsb-berkane`, see `@/lib/club-slug`), else the id for a club whose
 * French names have no Latin letters. `clubs` must be the French catalogue.
 */
export function buildClubsSitemapXml(
  clubs: readonly {
    readonly id: string;
    readonly name: { readonly fr: string };
    readonly shortName: { readonly fr: string };
  }[],
): string {
  const slugs = buildClubSlugMap(clubs);
  return urlset(
    [...new Set(clubs.map((club) => slugs.get(club.id) ?? club.id))]
      .slice(0, SITEMAP_CLUB_LIMIT)
      .map((ref) => pageUrl(clubPath(ref))),
  );
}

/** Each match page once, at its canonical URL (`/matches/<id>`, no `?tab`). */
export function buildMatchesSitemapXml(matchIds: readonly string[]): string {
  return urlset(
    [...new Set(matchIds)]
      .slice(0, SITEMAP_MATCH_LIMIT)
      .map((id) => pageUrl(`/matches/${encodeURIComponent(id)}`)),
  );
}

/**
 * The articles, each once under its canonical URL (`/news/<edition id>`), with
 * `xhtml:link` alternates for itself and for every counterpart the API
 * returned -- and the API only returns counterparts that are public now.
 * `month` (`news-YYYY-MM`) keeps only that month's.
 */
export function buildNewsSitemapXml(news: readonly SitemapNewsEntry[], month?: string): string {
  const urls: string[] = [];
  for (const entry of news) {
    if (month && newsSitemapName(entry) !== month) continue;
    const own = buildCanonicalArticleUrl(entry.id);
    const alternates =
      entry.translations.length === 0
        ? ""
        : [{ id: entry.id, language: entry.language }, ...entry.translations]
            .map(
              (edition) =>
                `<xhtml:link rel="alternate" hreflang="${edition.language}" href="${escapeXml(
                  buildCanonicalArticleUrl(edition.id),
                )}"/>`,
            )
            .join("");
    const modified = entryLastmod(entry);
    const lastmod = modified ? `<lastmod>${modified}</lastmod>` : "";
    urls.push(`  <url><loc>${escapeXml(own)}</loc>${lastmod}${alternates}</url>`);
  }
  return urlset(urls);
}

/**
 * The entries that belong in the Google News sitemap: published within the
 * last 48 hours (and not in the future), with a non-blank title, newest first,
 * at most 1,000. An entry without a title (an API build before migration
 * 20261027150000) is left out: Google News requires one, and none is invented.
 */
export function recentNewsEntries(
  news: readonly SitemapNewsEntry[],
  now: Date = new Date(),
): readonly SitemapNewsEntry[] {
  const to = now.getTime();
  const from = to - NEWS_RECENT_WINDOW_MS;
  return news
    .filter((entry) => {
      const ms = Date.parse(entry.publishedAt);
      return !Number.isNaN(ms) && ms >= from && ms <= to && Boolean(entry.title?.trim());
    })
    .sort((a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt))
    .slice(0, NEWS_RECENT_MAX_URLS);
}

/**
 * The Google News sitemap (`/sitemaps/news-recent.xml`): `news:news` with the
 * publication name and language, the publication date and the title. Always a
 * valid `urlset`, empty when nothing was published in the window.
 */
export function buildNewsRecentSitemapXml(
  news: readonly SitemapNewsEntry[],
  now: Date = new Date(),
): string {
  const urls = recentNewsEntries(news, now).map((entry) => {
    const published = new Date(Date.parse(entry.publishedAt)).toISOString();
    return `  <url><loc>${escapeXml(buildCanonicalArticleUrl(entry.id))}</loc><news:news><news:publication><news:name>BotolaGO</news:name><news:language>${entry.language}</news:language></news:publication><news:publication_date>${published}</news:publication_date><news:title>${escapeXml(entry.title!.trim())}</news:title></news:news></url>`;
  });
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:news="http://www.google.com/schemas/sitemap-news/0.9">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
