import { buildCanonicalArticleUrl, PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { PRIZES_ENABLED, PRONOSTICS_PROMOTED } from "@/lib/feature-flags";

export interface SitemapNewsEntry {
  readonly id: string;
  readonly language: "fr" | "ar";
  readonly publishedAt: string;
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
  "/fantasy/rules",
  "/privacy",
  "/terms",
  // Redirected to the hub while prizes are off, so listed only when they are on.
  ...(PRIZES_ENABLED ? (["/prizes", "/prizes/terms"] as const) : ([] as const)),
  // Pronostics (BG-0146): indexed only once promoted.
  ...(PRONOSTICS_PROMOTED ? (["/pronostics"] as const) : ([] as const)),
] as const;

/** The sitemap protocol's maximum number of URLs in one sitemap file. */
export const SITEMAP_MAX_URLS = 50_000;

/**
 * How many News editions fit alongside the static pages and the /news hub
 * without exceeding `SITEMAP_MAX_URLS`.
 */
export const SITEMAP_NEWS_LIMIT = SITEMAP_MAX_URLS - SITEMAP_STATIC_PATHS.length - 1;

function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * The sitemap XML.
 *
 * News is listed only when `newsEnabled` (while the flag is off, `/news` and
 * every article redirect Home, so advertising them would be wrong). Each
 * article appears once, under its canonical URL (`/news/<edition id>`), with
 * `xhtml:link` alternates for itself and for every counterpart the API
 * returned -- and the API only returns counterparts that are public now.
 */
export function buildSitemapXml(options: {
  readonly newsEnabled: boolean;
  readonly news: readonly SitemapNewsEntry[];
}): string {
  const urls: string[] = [];
  for (const path of SITEMAP_STATIC_PATHS) {
    urls.push(`  <url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}${path}`)}</loc></url>`);
  }
  if (options.newsEnabled) {
    urls.push(`  <url><loc>${escapeXml(`${PUBLIC_SITE_ORIGIN}/news`)}</loc></url>`);
    for (const entry of options.news) {
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
      // The last real change, else publication: never `updatedAt`, which a
      // bulk update moved on every article on 2026-09-24 (audit P1-4).
      const modified = entry.contentUpdatedAt ?? entry.publishedAt;
      const lastmod = Number.isNaN(Date.parse(modified))
        ? ""
        : `<lastmod>${new Date(modified).toISOString()}</lastmod>`;
      urls.push(`  <url><loc>${escapeXml(own)}</loc>${lastmod}${alternates}</url>`);
    }
  }
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
    ...urls,
    "</urlset>",
    "",
  ].join("\n");
}
