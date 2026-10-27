import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildClubsSitemapXml,
  buildMatchesSitemapXml,
  buildNewsSitemapXml,
  buildSitemapIndexXml,
  buildStaticSitemapXml,
  parseSitemapName,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_CLUB_LIMIT,
  SITEMAP_FRESHNESS_SECONDS,
  SITEMAP_MAX_URLS,
  SITEMAP_NEWS_LIMIT,
  SITEMAP_SNAPSHOT_MAX_AGE_SECONDS,
  type SitemapNewsEntry,
} from "./sitemap";

const read = (path: string) => readFileSync(join(import.meta.dir, path), "utf8");
const INDEX_ROUTE = "../routes/sitemap[.]xml.ts";
const FILES_ROUTE = "../routes/sitemaps.$file.ts";
const RESPONSES = "./sitemap-responses.ts";

const FR = "9b2f0c1e-0000-4000-8000-0000000000f1";
const AR = "9b2f0c1e-0000-4000-8000-0000000000a1";

const club = (id: string, short: string) => ({
  id,
  name: { fr: short },
  shortName: { fr: short },
});

describe("sitemap.xml", () => {
  test("with News off, no News URL is advertised even if entries were passed", () => {
    const news = [
      { id: FR, language: "fr" as const, publishedAt: "2026-09-22T10:00:00Z", translations: [] },
    ];
    expect(buildSitemapIndexXml({ newsEnabled: false, news })).not.toContain("news-");
    const xml = buildStaticSitemapXml({ newsEnabled: false });
    expect(xml).not.toContain("/news");
    expect(xml).toContain("<loc>https://botolago.com/</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/rules</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/top-players</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/rankings</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/help</loc>");
    expect(xml).toContain("<loc>https://botolago.com/matches/standings</loc>");
    expect(buildStaticSitemapXml({ newsEnabled: true })).toContain(
      "<loc>https://botolago.com/news</loc>",
    );
  });

  // Search Console (2026-10-27) reported these two as duplicates: their
  // lists load in the browser, so the server's HTML is the Fantasy frame alone.
  test("leaves out the Fantasy lists Search Console calls duplicates", () => {
    const xml = buildStaticSitemapXml({ newsEnabled: true });
    expect(xml).not.toContain("<loc>https://botolago.com/fantasy/players</loc>");
    expect(xml).not.toContain("<loc>https://botolago.com/fantasy/fixtures</loc>");
  });

  test("lists the clubs directory, the way into every club page", () => {
    const xml = buildStaticSitemapXml({ newsEnabled: false });
    expect(xml).toContain("<loc>https://botolago.com/clubs</loc>");
  });

  test("never lists the CMS, sign-in or personal pages", () => {
    const xml = buildStaticSitemapXml({ newsEnabled: true });
    for (const path of ["/admin", "/auth", "/profile", "/fantasy/team", "/mcp", "/unsubscribe"]) {
      expect(`${path}: ${xml.includes(`botolago.com${path}`)}`).toBe(`${path}: false`);
    }
  });

  test("the index lists the sections, then each News month newest first with its latest change", () => {
    const xml = buildSitemapIndexXml({
      newsEnabled: true,
      news: [
        { id: FR, language: "fr", publishedAt: "2026-09-22T10:00:00Z", translations: [] },
        {
          id: AR,
          language: "ar",
          publishedAt: "2026-09-02T10:00:00Z",
          contentUpdatedAt: "2026-09-25T08:00:00Z",
          translations: [],
        },
        { id: "x", language: "fr", publishedAt: "2026-10-01T00:30:00Z", translations: [] },
        { id: "y", language: "fr", publishedAt: "not a date", translations: [] },
      ],
    });
    expect(xml).toContain('<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">');
    const locs = [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      "https://botolago.com/sitemaps/static.xml",
      "https://botolago.com/sitemaps/clubs.xml",
      "https://botolago.com/sitemaps/matches.xml",
      "https://botolago.com/sitemaps/news-2026-10.xml",
      "https://botolago.com/sitemaps/news-2026-09.xml",
    ]);
    expect(xml).toContain(
      "<loc>https://botolago.com/sitemaps/news-2026-09.xml</loc><lastmod>2026-09-25T08:00:00.000Z</lastmod>",
    );
  });

  test("a sitemap file name is a section or a News month, nothing else", () => {
    expect(parseSitemapName("static.xml")).toEqual({ kind: "section", section: "static" });
    expect(parseSitemapName("matches.xml")).toEqual({ kind: "section", section: "matches" });
    expect(parseSitemapName("news-2026-10.xml")).toEqual({ kind: "news", name: "news-2026-10" });
    for (const bad of ["static", "news-2026-13.xml", "news-26-10.xml", "../x.xml", "admin.xml"]) {
      expect(`${bad}: ${parseSitemapName(bad)}`).toBe(`${bad}: null`);
    }
  });

  test("a News month lists only that month's articles", () => {
    const news: SitemapNewsEntry[] = [
      { id: FR, language: "fr", publishedAt: "2026-09-30T23:30:00Z", translations: [] },
      { id: AR, language: "ar", publishedAt: "2026-10-01T00:30:00Z", translations: [] },
    ];
    const october = buildNewsSitemapXml(news, "news-2026-10");
    expect(october).toContain(`/news/${AR}</loc>`);
    expect(october).not.toContain(`/news/${FR}</loc>`);
  });

  test("each article appears once at its canonical URL, with alternates only for public counterparts", () => {
    const xml = buildNewsSitemapXml([
      {
        id: FR,
        language: "fr",
        publishedAt: "2026-09-22T10:00:00Z",
        translations: [{ id: AR, language: "ar" }],
      },
      {
        id: AR,
        language: "ar",
        publishedAt: "2026-09-22T11:00:00Z",
        translations: [{ id: FR, language: "fr" }],
      },
      {
        id: "9b2f0c1e-0000-4000-8000-0000000000f2",
        language: "fr",
        publishedAt: "2026-09-21T10:00:00Z",
        translations: [],
      },
    ]);
    expect(xml.match(new RegExp(`<loc>https://botolago.com/news/${FR}</loc>`, "g"))).toHaveLength(
      1,
    );
    expect(xml).toContain(
      `<loc>https://botolago.com/news/${FR}</loc><lastmod>2026-09-22T10:00:00.000Z</lastmod><xhtml:link rel="alternate" hreflang="fr" href="https://botolago.com/news/${FR}"/><xhtml:link rel="alternate" hreflang="ar" href="https://botolago.com/news/${AR}"/>`,
    );
    // A single-language article carries no alternates.
    expect(xml).toContain(
      "<loc>https://botolago.com/news/9b2f0c1e-0000-4000-8000-0000000000f2</loc><lastmod>2026-09-21T10:00:00.000Z</lastmod></url>",
    );
    expect(xml).toContain('xmlns:xhtml="http://www.w3.org/1999/xhtml"');
  });

  test("the routes serve XML, read only the sitemap RPC and only while News is enabled", () => {
    const responses = read(RESPONSES);
    expect(responses).toContain(
      'if (!NEWS_ENABLED || getNewsDataMode() !== "supabase") return [];',
    );
    // Every public article that fits, not the RPC's default page of 5,000:
    // the licensed archive alone is ~15,700 editions.
    expect(responses).toContain("getSitemapEntries(SITEMAP_NEWS_LIMIT)");
    expect(responses).toContain('"content-type": "application/xml; charset=utf-8"');
    expect(read(INDEX_ROUTE)).toContain("readSitemapNews()");
    expect(read(FILES_ROUTE)).toContain("readSitemapNews()");
    // A News month while News is off is a 404, never an article list.
    expect(read(FILES_ROUTE)).toContain('wanted.kind === "news" && !NEWS_ENABLED');
  });

  test("the latest api.news_sitemap_entries in the migrations stays set-based", () => {
    // 20260924200600 was written before 20260924163000's set-based rewrite and
    // renumbered after it, so it quietly put the per-edition helper calls
    // back: 8.4 s on production against the 3 s anon timeout, and a 503
    // sitemap. The migration that defines the function last is what runs.
    // Since 20260926003050 the public function serves a snapshot and leaves
    // the query to app_private.news_sitemap_compute, so the query's checks
    // follow it there, and the public function must still call no helper.
    const directory = join(import.meta.dir, "../../supabase/migrations");
    const perRowHelper = /news_is_public\(|news_content_updated_at\(|news_story_is_publishable\(/;
    const latestBody = (marker: string) => {
      const latest = readdirSync(directory)
        .filter((name) => name.endsWith(".sql"))
        .sort()
        .filter((name) => readFileSync(join(directory, name), "utf8").includes(marker))
        .at(-1);
      expect(latest).toBeDefined();
      const source = readFileSync(join(directory, latest!), "utf8");
      return source.slice(source.indexOf(marker)).split("\n$$;")[0]!;
    };

    const api = latestBody("create or replace function api.news_sitemap_entries(");
    expect(api).not.toMatch(perRowHelper);
    const query = api.includes("app_private.news_sitemap_compute(")
      ? latestBody("create or replace function app_private.news_sitemap_compute(")
      : api;
    expect(query).not.toMatch(perRowHelper);
    expect(query).toContain("'contentUpdatedAt'");
  });

  test("the database serves a snapshot only as old as the cache budget allows", () => {
    // The live fallback in api.news_sitemap_entries is what keeps the
    // five-minute promise while the refresh job is paused: its threshold must
    // be the age SITEMAP_CACHE_CONTROL is computed from.
    const directory = join(import.meta.dir, "../../supabase/migrations");
    const marker = "create or replace function api.news_sitemap_entries(";
    const latest = readdirSync(directory)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .filter((name) => readFileSync(join(directory, name), "utf8").includes(marker))
      .at(-1)!;
    const source = readFileSync(join(directory, latest), "utf8");
    const body = source.slice(source.indexOf(marker)).split("\n$$;")[0]!;
    expect(body).toContain(
      `snapshot.computed_at < statement_timestamp() - interval '${SITEMAP_SNAPSHOT_MAX_AGE_SECONDS} seconds'`,
    );
    expect(body).toContain("return app_private.news_sitemap_compute(wanted);");
  });

  test("lastmod is the last real change, else publication, never bookkeeping", () => {
    const xml = buildNewsSitemapXml([
      // Published in 2023, never edited: the 2026-09-24 bulk update moved
      // its updated_at, which the sitemap no longer reads at all.
      {
        id: FR,
        language: "fr",
        publishedAt: "2023-05-14T18:30:00Z",
        contentUpdatedAt: "2023-05-14T18:30:00Z",
        translations: [],
      },
      // Edited after publishing: the edit is the lastmod.
      {
        id: AR,
        language: "ar",
        publishedAt: "2026-09-20T09:00:00Z",
        contentUpdatedAt: "2026-09-21T16:45:00Z",
        translations: [],
      },
      // An API build before the migration: publication.
      {
        id: "9b2f0c1e-0000-4000-8000-0000000000f3",
        language: "fr",
        publishedAt: "2026-09-19T08:00:00Z",
        translations: [],
      },
    ]);
    expect(xml).toContain(`${FR}</loc><lastmod>2023-05-14T18:30:00.000Z</lastmod>`);
    expect(xml).toContain(`${AR}</loc><lastmod>2026-09-21T16:45:00.000Z</lastmod>`);
    expect(xml).toContain("0000000000f3</loc><lastmod>2026-09-19T08:00:00.000Z</lastmod>");
    expect(xml).not.toContain("2026-09-24");
  });

  test("a failed read is a 503, not a sitemap without the pages", () => {
    const responses = read(RESPONSES);
    expect(responses).toContain("status: 503");
    expect(responses).toContain('"retry-after": "300"');
    // The failure itself is never cached anywhere.
    expect(responses).toContain('"cache-control": "no-store"');
    for (const route of [read(INDEX_ROUTE), read(FILES_ROUTE)]) {
      expect(route).toContain('if (news === "failed") return sitemapUnavailable();');
    }
    // The club and match files answer 503 too when the football read fails.
    expect(read(FILES_ROUTE).match(/return sitemapUnavailable\(\);/g)).toHaveLength(3);
  });

  test("a good sitemap is cacheable within the five-minute promise, and outlives an outage", () => {
    expect(read(RESPONSES)).toContain('"cache-control": SITEMAP_CACHE_CONTROL');

    const directives = new Map(
      SITEMAP_CACHE_CONTROL.split(",").map((part) => {
        const [name, value] = part.trim().split("=");
        return [name, value === undefined ? true : Number(value)] as const;
      }),
    );
    expect(directives.get("public")).toBe(true);
    for (const forbidden of ["private", "no-store", "no-cache", "stale-while-revalidate"]) {
      expect(`${forbidden}: ${directives.has(forbidden)}`).toBe(`${forbidden}: false`);
    }
    const shared = directives.get("s-maxage") as number;
    const browser = directives.get("max-age") as number;
    // The oldest snapshot the database serves plus the longest a cache may
    // keep it: an unpublished article is gone within the promise.
    expect(SITEMAP_FRESHNESS_SECONDS).toBe(300);
    expect(SITEMAP_SNAPSHOT_MAX_AGE_SECONDS + shared).toBeLessThanOrEqual(
      SITEMAP_FRESHNESS_SECONDS,
    );
    expect(SITEMAP_SNAPSHOT_MAX_AGE_SECONDS + browser).toBeLessThanOrEqual(
      SITEMAP_FRESHNESS_SECONDS,
    );
    expect(shared).toBeGreaterThan(0);
    // A shared cache may serve its last good copy while the route answers 503.
    expect(directives.get("stale-if-error") as number).toBeGreaterThanOrEqual(3600);
  });

  test("no sitemap file exceeds the protocol's 50,000 URLs", () => {
    const entry = (i: number): SitemapNewsEntry => ({
      id: `9b2f0c1e-0000-4000-8000-${i.toString().padStart(12, "0")}`,
      language: "fr",
      publishedAt: "2026-09-21T10:00:00.000Z",
      translations: [],
    });
    const news = Array.from({ length: SITEMAP_NEWS_LIMIT }, (_, i) => entry(i));
    expect(SITEMAP_NEWS_LIMIT).toBeLessThanOrEqual(SITEMAP_MAX_URLS);
    expect(buildNewsSitemapXml(news).match(/<url>/g)!.length).toBeLessThanOrEqual(SITEMAP_MAX_URLS);
    // More clubs than the cap: the extra ones are dropped.
    const clubs = Array.from({ length: SITEMAP_CLUB_LIMIT + 5 }, (_, i) =>
      club(`club-${i}`, `Club ${i}`),
    );
    expect(buildClubsSitemapXml(clubs).match(/<url>/g)).toHaveLength(SITEMAP_CLUB_LIMIT);
  });

  test("lists each club page once, at its readable slug URL", () => {
    const berkane = club("7b2e23bc-450f-4a1e-9d0c-111111111111", "RSB Berkane");
    const xml = buildClubsSitemapXml([
      berkane,
      berkane,
      club("0257feb3-4c16-431d-a58b-5faf060576ad", "Maghreb Fès"),
    ]);
    expect(xml.match(/<loc>https:\/\/botolago\.com\/clubs\/rsb-berkane<\/loc>/g)).toHaveLength(1);
    expect(xml).toContain("<loc>https://botolago.com/clubs/maghreb-fes</loc>");
    expect(xml).not.toContain("7b2e23bc");
  });

  test("falls back to the id for a club with no Latin name, and keeps duplicates apart", () => {
    const arabic = club("11111111-1111-4111-8111-111111111111", "الرجاء");
    const xml = buildClubsSitemapXml([
      arabic,
      club("22222222-2222-4222-8222-222222222222", "Twin FC"),
      club("33333333-3333-4333-8333-333333333333", "Twin FC"),
    ]);
    expect(xml).toContain(`/clubs/${arabic.id}</loc>`);
    expect(xml).toContain("/clubs/twin-fc-22222222</loc>");
    expect(xml).toContain("/clubs/twin-fc-33333333</loc>");
  });

  // Match pages are the largest source of search impressions and the server's
  // HTML links to none of them: the sitemap is how a crawler finds them.
  test("lists each match page once, at its canonical URL with no ?tab", () => {
    const id = "7127321b-0000-4000-8000-000000000001";
    const xml = buildMatchesSitemapXml([id, id]);
    expect(
      xml.match(new RegExp(`<loc>https://botolago.com/matches/${id}</loc>`, "g")),
    ).toHaveLength(1);
    expect(xml).not.toContain("?tab");
  });

  test("the club and match files read the directory and the season's fixtures", () => {
    const route = read(FILES_ROUTE);
    expect(route).toContain('footballService.getClubDirectory("fr")');
    expect(route).toContain('footballService.getSitemapMatches("fr")');
  });
});

describe("robots.txt and admin noindex", () => {
  const robots = readFileSync(join(import.meta.dir, "../../public/robots.txt"), "utf8");

  test("disallows the CMS, sign-in and personal pages, and points at the sitemap", () => {
    for (const rule of ["Disallow: /admin", "Disallow: /auth", "Disallow: /profile"]) {
      expect(robots).toContain(rule);
    }
    expect(robots).toContain("Sitemap: https://botolago.com/sitemap.xml");
    // The public site stays crawlable: no blanket disallow.
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
  });

  test("every Admin route (the CMS included) sends noindex, nofollow", () => {
    const admin = readFileSync(join(import.meta.dir, "../routes/admin.tsx"), "utf8");
    expect(admin).toContain('meta: [{ name: "robots", content: "noindex, nofollow" }]');
  });
});
