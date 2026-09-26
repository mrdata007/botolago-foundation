import { describe, expect, test } from "bun:test";

import {
  discoverSource,
  parseHtmlListingLinks,
  parseRssItems,
  parseSitemapIndex,
  parseSitemapUrls,
  sourceArticleIdFrom,
} from "./discover";
import { NewsHttpClient, type FetchLike } from "../fetch/http";
import { RobotsCache } from "../fetch/robots";
import type { DiscoveryState, SourceConfiguration } from "../contracts";

const ARTICLE_PATTERN =
  "^https://news\\.example\\.com/article/([0-9]{4}-[0-9]{2}-[0-9]{2}-[0-9]+)\\.html$";

const source: SourceConfiguration = {
  id: "source-1",
  slug: "example",
  name: "Example",
  hostname: "news.example.com",
  publisherId: null,
  sourceKind: "publisher",
  languages: ["ar", "fr"],
  discoveryMethod: "news_sitemap",
  discoveryUrl: "https://news.example.com/sitemap.xml",
  articleUrlPattern: ARTICLE_PATTERN,
  allowedMediaHosts: [],
  priority: 10,
  pollIntervalSeconds: 1800,
  rateLimitPerMinute: 120,
  maxConcurrency: 2,
  requestTimeoutMs: 5_000,
  maxRetries: 0,
  parserVersion: "v1",
  articleFetchApproved: true,
  respectRobots: true,
  config: {},
};

const emptyState: DiscoveryState = {
  lastSeenItemKey: null,
  lastSeenPublishedAt: null,
  lastSuccessfulDiscoveryAt: null,
  etag: null,
  lastModified: null,
  consecutiveFailures: 0,
};

function sitemapXml(entries: Array<{ loc: string; lastmod?: string }>): string {
  const urls = entries
    .map(
      (entry) =>
        `<url><loc>${entry.loc}</loc>${entry.lastmod ? `<lastmod>${entry.lastmod}</lastmod>` : ""}</url>`,
    )
    .join("");
  return `<?xml version="1.0"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${urls}</urlset>`;
}

function respond(body: string, headers: Record<string, string> = {}): Response {
  return new Response(body, {
    status: 200,
    headers: { "content-type": "application/xml", ...headers },
  });
}

interface StubOptions {
  readonly robots?: string;
  readonly sitemap?: string;
  readonly onRequest?: (url: string) => void;
}

function stubFetch(options: StubOptions): FetchLike {
  return async (input) => {
    const url = String(input);
    options.onRequest?.(url);
    if (url.endsWith("/robots.txt")) {
      return new Response(options.robots ?? "User-agent: *\nAllow: /", {
        status: 200,
        headers: { "content-type": "text/plain" },
      });
    }
    if (url.includes("sitemap")) return respond(options.sitemap ?? sitemapXml([]));
    return new Response("not found", { status: 404 });
  };
}

function buildDependencies(fetchImpl: FetchLike) {
  const http = new NewsHttpClient({
    fetch: fetchImpl,
    sleep: async () => undefined,
    jitter: () => 0.5,
  });
  return { http, robots: new RobotsCache(http, "BotolaGO-NewsEngine/1.0") };
}

describe("sitemap and feed parsing", () => {
  test("reads urls, lastmod and news metadata", () => {
    const xml = `<urlset><url><loc>https://a/1</loc><lastmod>2026-09-21</lastmod><news:news><news:publication_date>2026-09-21T10:00:00Z</news:publication_date><news:title>Titre</news:title><news:language>fr</news:language></news:news></url></urlset>`;
    const [entry] = parseSitemapUrls(xml);
    expect(entry?.loc).toBe("https://a/1");
    expect(entry?.lastmod).toBe("2026-09-21");
    expect(entry?.newsPublishedAt).toBe("2026-09-21T10:00:00Z");
    expect(entry?.newsTitle).toBe("Titre");
    expect(entry?.newsLanguage).toBe("fr");
  });

  test("reads a sitemap index", () => {
    const xml = `<sitemapindex><sitemap><loc>https://a/news-ar-1.xml</loc></sitemap><sitemap><loc>https://a/news-fr-1.xml</loc></sitemap></sitemapindex>`;
    expect(parseSitemapIndex(xml)).toEqual(["https://a/news-ar-1.xml", "https://a/news-fr-1.xml"]);
  });

  test("reads RSS and Atom", () => {
    const rss = `<rss><channel><item><title>A</title><link>https://a/1</link><pubDate>Mon, 21 Sep 2026 10:00:00 GMT</pubDate></item></channel></rss>`;
    expect(parseRssItems(rss)[0]?.loc).toBe("https://a/1");
    const atom = `<feed><entry><title>A</title><link href="https://a/2"/><published>2026-09-21T10:00:00Z</published></entry></feed>`;
    expect(parseRssItems(atom)[0]?.loc).toBe("https://a/2");
  });

  test("decodes CDATA and entities", () => {
    const xml = `<urlset><url><loc><![CDATA[https://a/1?x=1&amp;y=2]]></loc></url></urlset>`;
    expect(parseSitemapUrls(xml)[0]?.loc).toBe("https://a/1?x=1&y=2");
  });

  test("html listing keeps only same-host https links", () => {
    const html = `<a href="/article/1.html">a</a><a href="https://other.example/x">b</a><a href="http://news.example.com/y">c</a>`;
    expect(parseHtmlListingLinks(html, "https://news.example.com/latest")).toEqual([
      "https://news.example.com/article/1.html",
    ]);
  });

  test("derives a stable source id from the url pattern", () => {
    const pattern = new RegExp(ARTICLE_PATTERN, "u");
    expect(
      sourceArticleIdFrom("https://news.example.com/article/2026-09-21-907.html", pattern),
    ).toBe("2026-09-21-907");
  });
});

describe("discoverSource", () => {
  test("queues only urls matching the source's article pattern", async () => {
    const xml = sitemapXml([
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
      { loc: "https://news.example.com/tag/botola", lastmod: "2026-09-21" },
      { loc: "https://news.example.com/article/bad.html", lastmod: "2026-09-21" },
    ]);
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items).toHaveLength(1);
    expect(result.items[0]?.sourceArticleId).toBe("2026-09-21-1");
  });

  test("refuses a listing that robots.txt disallows", async () => {
    const dependencies = buildDependencies(
      stubFetch({ robots: "User-agent: *\nDisallow: /sitemap.xml" }),
    );
    await expect(discoverSource(source, emptyState, dependencies, {})).rejects.toThrow(
      "robots.txt disallows",
    );
  });

  test("skips individual articles that robots.txt disallows", async () => {
    const xml = sitemapXml([
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
    ]);
    const dependencies = buildDependencies(
      stubFetch({
        robots: "User-agent: *\nAllow: /sitemap.xml\nDisallow: /article/",
        sitemap: xml,
      }),
    );
    const result = await discoverSource(source, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items).toHaveLength(0);
  });

  test("drops articles older than the age window", async () => {
    const xml = sitemapXml([
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
      { loc: "https://news.example.com/article/2020-01-01-9.html", lastmod: "2020-01-01" },
    ]);
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items.map((item) => item.sourceArticleId)).toEqual(["2026-09-21-1"]);
  });

  test("honours an explicit since/until window for backfill", async () => {
    const xml = sitemapXml([
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
      { loc: "https://news.example.com/article/2026-08-01-2.html", lastmod: "2026-08-01" },
    ]);
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      since: "2026-07-01",
      until: "2026-08-15",
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items.map((item) => item.sourceArticleId)).toEqual(["2026-08-01-2"]);
  });

  test("a 304 listing costs one request and returns nothing", async () => {
    const requests: string[] = [];
    const fetchImpl: FetchLike = async (input) => {
      const url = String(input);
      requests.push(url);
      if (url.endsWith("/robots.txt")) {
        return new Response("User-agent: *\nAllow: /", { status: 200 });
      }
      return new Response(null, { status: 304 });
    };
    const dependencies = buildDependencies(fetchImpl);
    const result = await discoverSource(source, { ...emptyState, etag: '"abc"' }, dependencies, {});
    expect(result.notModified).toBe(true);
    expect(result.items).toHaveLength(0);
    expect(requests.filter((url) => url.includes("sitemap"))).toHaveLength(1);
  });

  test("deduplicates the same article appearing twice in one listing", async () => {
    const xml = sitemapXml([
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
      {
        loc: "https://news.example.com/article/2026-09-21-1.html?utm_source=x",
        lastmod: "2026-09-21",
      },
    ]);
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items).toHaveLength(1);
  });

  test("a malformed entry does not abort the listing", async () => {
    const xml = sitemapXml([
      { loc: "not a url", lastmod: "2026-09-21" },
      { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
    ]);
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items).toHaveLength(1);
  });

  test("respects the item cap", async () => {
    const xml = sitemapXml(
      Array.from({ length: 30 }, (_value, index) => ({
        loc: `https://news.example.com/article/2026-09-21-${index}.html`,
        lastmod: "2026-09-21",
      })),
    );
    const dependencies = buildDependencies(stubFetch({ sitemap: xml }));
    const result = await discoverSource(source, emptyState, dependencies, {
      maxItems: 5,
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(result.items).toHaveLength(5);
  });

  test("reads the per-language sitemaps when the source declares them", async () => {
    const requested: string[] = [];
    const languageSource: SourceConfiguration = {
      ...source,
      config: {
        sitemapLanguageMap: {
          ar: "https://news.example.com/sitemap-news-ar.xml",
          fr: "https://news.example.com/sitemap-news-fr.xml",
        },
      },
    };
    const dependencies = buildDependencies(
      stubFetch({
        sitemap: sitemapXml([
          { loc: "https://news.example.com/article/2026-09-21-1.html", lastmod: "2026-09-21" },
        ]),
        onRequest: (url) => requested.push(url),
      }),
    );
    await discoverSource(languageSource, emptyState, dependencies, {
      now: () => new Date("2026-09-21T18:00:00Z"),
    });
    expect(requested).toContain("https://news.example.com/sitemap-news-ar.xml");
    expect(requested).toContain("https://news.example.com/sitemap-news-fr.xml");
  });
});
