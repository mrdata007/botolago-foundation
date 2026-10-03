// Incremental article discovery.
//
// Preference order, as the architecture requires: a structured feed published
// for machines (news sitemap, sitemap, RSS, API) before any HTML listing.
// ElBotola publishes per-language Google News sitemaps, so nothing here needs
// to read its homepage markup.
//
// Discovery is incremental by construction. The source's cursor is compared
// against the listing and only unseen URLs are queued; a scheduled run over an
// unchanged listing costs one conditional request and returns nothing.

import {
  type DiscoveredItem,
  type DiscoveryResult,
  type DiscoveryState,
  type NewsSourceLanguage,
  NewsEngineError,
  type SourceConfiguration,
} from "../contracts";
import { canonicalizeArticleUrl, urlHash } from "../normalization/hashing";
import { MAX_LISTING_BYTES, type NewsHttpClient } from "../fetch/http";
import { isAllowed, type RobotsCache } from "../fetch/robots";

/** Nothing older than this is worth discovering on an incremental pass. */
const DEFAULT_MAX_AGE_DAYS = 45;
const MAX_ITEMS_PER_RUN = 400;

export interface DiscoveryOptions {
  readonly maxItems?: number;
  readonly maxAgeDays?: number;
  readonly since?: string | null;
  readonly until?: string | null;
  readonly languages?: readonly NewsSourceLanguage[];
  readonly now?: () => Date;
}

interface SitemapEntry {
  readonly loc: string;
  readonly lastmod: string | null;
  readonly newsPublishedAt: string | null;
  readonly newsTitle: string | null;
  readonly newsLanguage: string | null;
}

function decodeXmlEntities(value: string): string {
  return value
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&apos;", "'")
    .replace(/&#(\d+);/gu, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/giu, (_match, code: string) =>
      String.fromCodePoint(parseInt(code, 16)),
    )
    .replaceAll("&amp;", "&");
}

function tagValue(block: string, tag: string): string | null {
  // Namespace-agnostic: matches both `<loc>` and `<news:publication_date>`.
  const pattern = new RegExp(
    `<(?:[a-z0-9]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`,
    "iu",
  );
  const match = pattern.exec(block);
  if (!match?.[1]) return null;
  const cleaned = match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, "$1").trim();
  return cleaned ? decodeXmlEntities(cleaned) : null;
}

function blocks(xml: string, tag: string): string[] {
  const pattern = new RegExp(
    `<(?:[a-z0-9]+:)?${tag}\\b[^>]*>([\\s\\S]*?)</(?:[a-z0-9]+:)?${tag}>`,
    "giu",
  );
  const result: string[] = [];
  for (const match of xml.matchAll(pattern)) {
    if (match[1]) result.push(match[1]);
  }
  return result;
}

export function parseSitemapIndex(xml: string): string[] {
  return blocks(xml, "sitemap")
    .map((block) => tagValue(block, "loc"))
    .filter((loc): loc is string => Boolean(loc));
}

export function parseSitemapUrls(xml: string): SitemapEntry[] {
  return blocks(xml, "url").map((block) => ({
    loc: tagValue(block, "loc") ?? "",
    lastmod: tagValue(block, "lastmod"),
    newsPublishedAt: tagValue(block, "publication_date"),
    newsTitle: tagValue(block, "title"),
    newsLanguage: tagValue(block, "language"),
  }));
}

export function parseRssItems(xml: string): SitemapEntry[] {
  const rssItems = blocks(xml, "item").map((block) => ({
    loc: tagValue(block, "link") ?? tagValue(block, "guid") ?? "",
    lastmod: null,
    newsPublishedAt: tagValue(block, "pubDate") ?? tagValue(block, "date"),
    newsTitle: tagValue(block, "title"),
    newsLanguage: null,
  }));
  if (rssItems.length > 0) return rssItems;

  // Atom.
  return blocks(xml, "entry").map((block) => {
    const linkMatch = /<link\b[^>]*href="([^"]+)"/iu.exec(block);
    return {
      loc: linkMatch?.[1] ?? tagValue(block, "id") ?? "",
      lastmod: null,
      newsPublishedAt: tagValue(block, "published") ?? tagValue(block, "updated"),
      newsTitle: tagValue(block, "title"),
      newsLanguage: null,
    };
  });
}

/** Absolute same-host hrefs from a listing page, in document order. */
export function parseHtmlListingLinks(html: string, baseUrl: string): string[] {
  const base = new URL(baseUrl);
  const seen = new Set<string>();
  const links: string[] = [];
  for (const match of html.matchAll(/<a\b[^>]*href\s*=\s*["']([^"']+)["']/giu)) {
    const raw = match[1];
    if (!raw) continue;
    let resolved: URL;
    try {
      resolved = new URL(decodeXmlEntities(raw), base);
    } catch {
      continue;
    }
    if (resolved.protocol !== "https:" || resolved.hostname !== base.hostname) continue;
    const href = resolved.toString();
    if (seen.has(href)) continue;
    seen.add(href);
    links.push(href);
  }
  return links;
}

function parseTimestamp(value: string | null): string | null {
  if (!value) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
}

/**
 * Derives the source's own stable article id from the URL using the first
 * capture group of the configured pattern, falling back to the last path
 * segment. This is the idempotency key: the same article must always yield
 * the same id.
 */
export function sourceArticleIdFrom(url: string, pattern: RegExp): string {
  const match = pattern.exec(url);
  if (match?.[1]) return match[1];
  const path = new URL(url).pathname.replace(/\/+$/u, "");
  const segment = path.slice(path.lastIndexOf("/") + 1);
  return segment.replace(/\.[a-z0-9]{1,6}$/iu, "") || path || url;
}

function languageFor(
  source: SourceConfiguration,
  declared: string | null,
  discoveryUrl: string,
): NewsSourceLanguage {
  const normalizedDeclared = declared?.slice(0, 2).toLowerCase();
  if (normalizedDeclared && (source.languages as readonly string[]).includes(normalizedDeclared)) {
    return normalizedDeclared as NewsSourceLanguage;
  }
  // Per-language sitemaps encode the language in the filename.
  for (const candidate of source.languages) {
    if (new RegExp(`[-/]${candidate}[-./]`, "u").test(discoveryUrl)) return candidate;
  }
  return source.languages[0] ?? "ar";
}

export interface DiscoveryDependencies {
  readonly http: NewsHttpClient;
  readonly robots: RobotsCache;
}

/**
 * Runs one discovery pass for a source and returns the unseen items.
 *
 * Never throws for a single malformed entry: a bad URL is skipped and the
 * pass continues. It does throw when the listing itself cannot be read, which
 * the caller records as a source-level failure.
 */
export async function discoverSource(
  source: SourceConfiguration,
  state: DiscoveryState,
  dependencies: DiscoveryDependencies,
  options: DiscoveryOptions = {},
): Promise<DiscoveryResult> {
  const now = options.now?.() ?? new Date();
  const maxItems = Math.min(options.maxItems ?? MAX_ITEMS_PER_RUN, MAX_ITEMS_PER_RUN);
  const maxAgeMs = (options.maxAgeDays ?? DEFAULT_MAX_AGE_DAYS) * 24 * 60 * 60 * 1_000;
  const oldestAllowed = options.since ? Date.parse(options.since) : now.getTime() - maxAgeMs;
  const newestAllowed = options.until ? Date.parse(options.until) : now.getTime() + 5 * 60 * 1_000;
  const wantedLanguages = options.languages ?? source.languages;

  const articlePattern = new RegExp(source.articleUrlPattern, "u");
  const limiter = dependencies.http.limiterFor(source.hostname, source.rateLimitPerMinute);

  let robotsPolicy = null as Awaited<ReturnType<RobotsCache["policyFor"]>> | null;
  if (source.respectRobots) {
    await limiter.acquire();
    robotsPolicy = await dependencies.robots.policyFor(source.hostname, source.requestTimeoutMs);
  }

  // Resolve which listing URLs to read.
  const listingUrls: string[] = [];
  const languageMap = (source.config.sitemapLanguageMap ?? null) as Record<string, string> | null;
  if (source.discoveryMethod === "news_sitemap" && languageMap) {
    for (const language of wantedLanguages) {
      const url = languageMap[language];
      if (url) listingUrls.push(url);
    }
  }
  if (listingUrls.length === 0) listingUrls.push(source.discoveryUrl);

  const collected = new Map<string, DiscoveredItem>();
  let latestPublishedAt = state.lastSeenPublishedAt ? Date.parse(state.lastSeenPublishedAt) : 0;
  let latestItemKey = state.lastSeenItemKey;
  let responseEtag: string | null = null;
  let responseLastModified: string | null = null;
  let anyModified = false;

  for (const listingUrl of listingUrls) {
    if (collected.size >= maxItems) break;
    if (robotsPolicy && !isAllowed(robotsPolicy, listingUrl)) {
      throw new NewsEngineError(
        "news_engine_listing_disallowed",
        "robots.txt disallows the configured discovery URL.",
      );
    }

    await limiter.acquire();
    const conditional = listingUrls.length === 1;
    const response = await dependencies.http.request({
      url: listingUrl,
      expectedHostname: source.hostname,
      timeoutMs: source.requestTimeoutMs,
      maxRetries: source.maxRetries,
      maxBytes: MAX_LISTING_BYTES,
      // Conditional requests only make sense against a single stable listing;
      // with several per-language feeds one ETag cannot represent them all.
      etag: conditional ? state.etag : null,
      lastModified: conditional ? state.lastModified : null,
      accept: "application/xml,text/xml,application/rss+xml,text/html;q=0.8,*/*;q=0.5",
      userAgent: (source.config.userAgent as string | undefined) ?? undefined,
    });

    if (response.notModified) continue;
    anyModified = true;
    if (conditional) {
      responseEtag = response.etag;
      responseLastModified = response.lastModified;
    }

    let entries: SitemapEntry[] = [];
    if (source.discoveryMethod === "html_listing") {
      entries = parseHtmlListingLinks(response.body, listingUrl).map((loc) => ({
        loc,
        lastmod: null,
        newsPublishedAt: null,
        newsTitle: null,
        newsLanguage: null,
      }));
    } else if (source.discoveryMethod === "rss") {
      entries = parseRssItems(response.body);
    } else {
      entries = parseSitemapUrls(response.body);
      if (entries.length === 0) {
        // A sitemap index: follow the children that match the wanted languages.
        const children = parseSitemapIndex(response.body).filter((child) =>
          wantedLanguages.some((language) => new RegExp(`[-/]${language}[-./]`, "u").test(child)),
        );
        for (const child of children.slice(0, 8)) {
          if (collected.size >= maxItems) break;
          await limiter.acquire();
          const childResponse = await dependencies.http.request({
            url: child,
            expectedHostname: source.hostname,
            timeoutMs: source.requestTimeoutMs,
            maxRetries: source.maxRetries,
            maxBytes: MAX_LISTING_BYTES,
            accept: "application/xml,text/xml,*/*;q=0.5",
            userAgent: (source.config.userAgent as string | undefined) ?? undefined,
          });
          entries.push(
            ...parseSitemapUrls(childResponse.body).map((entry) => ({
              ...entry,
              newsLanguage: entry.newsLanguage ?? languageFor(source, null, child),
            })),
          );
        }
      }
    }

    for (const entry of entries) {
      if (collected.size >= maxItems) break;
      if (!entry.loc) continue;

      let canonical: string;
      try {
        canonical = canonicalizeArticleUrl(entry.loc);
      } catch {
        continue;
      }
      if (!articlePattern.test(canonical)) continue;
      if (robotsPolicy && !isAllowed(robotsPolicy, canonical)) continue;

      const publishedAt = parseTimestamp(entry.newsPublishedAt ?? entry.lastmod);
      const publishedMs = publishedAt ? Date.parse(publishedAt) : null;
      if (publishedMs !== null && (publishedMs < oldestAllowed || publishedMs > newestAllowed)) {
        continue;
      }

      const language = languageFor(source, entry.newsLanguage, listingUrl);
      if (!wantedLanguages.includes(language)) continue;

      const hash = urlHash(canonical);
      if (collected.has(hash)) continue;

      collected.set(hash, {
        sourceArticleId: sourceArticleIdFrom(canonical, articlePattern),
        sourceUrl: canonical,
        urlHash: hash,
        sourceLanguage: language,
        sourceTitle: entry.newsTitle,
        sourcePublishedAt: publishedAt,
        sourceUpdatedAt: parseTimestamp(entry.lastmod) ?? publishedAt,
        metadata: {
          discoveredVia: source.discoveryMethod,
          listingUrl,
        },
      });

      if (publishedMs !== null && publishedMs > latestPublishedAt) {
        latestPublishedAt = publishedMs;
        latestItemKey = hash;
      }
    }
  }

  return {
    items: [...collected.values()],
    lastSeenItemKey: latestItemKey,
    lastSeenPublishedAt: latestPublishedAt > 0 ? new Date(latestPublishedAt).toISOString() : null,
    etag: responseEtag,
    lastModified: responseLastModified,
    notModified: !anyModified,
  };
}
