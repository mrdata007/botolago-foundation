import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import {
  buildSitemapXml,
  SITEMAP_CACHE_CONTROL,
  SITEMAP_FRESHNESS_SECONDS,
  SITEMAP_NEWS_LIMIT,
  SITEMAP_SNAPSHOT_MAX_AGE_SECONDS,
  type SitemapNewsEntry,
} from "./sitemap";

const FR = "9b2f0c1e-0000-4000-8000-0000000000f1";
const AR = "9b2f0c1e-0000-4000-8000-0000000000a1";

describe("sitemap.xml", () => {
  test("with News off, no News URL is advertised even if entries were passed", () => {
    const xml = buildSitemapXml({
      newsEnabled: false,
      news: [{ id: FR, language: "fr", publishedAt: "2026-09-22T10:00:00Z", translations: [] }],
    });
    expect(xml).not.toContain("/news");
    expect(xml).toContain("<loc>https://botolago.com/</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/rules</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/players</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/top-players</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/fixtures</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/rankings</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/help</loc>");
    expect(xml).toContain("<loc>https://botolago.com/matches/standings</loc>");
  });

  test("lists the clubs directory, the way into every club page", () => {
    const xml = buildSitemapXml({ newsEnabled: false, news: [] });
    expect(xml).toContain("<loc>https://botolago.com/clubs</loc>");
  });

  test("never lists the CMS, sign-in or personal pages", () => {
    const xml = buildSitemapXml({ newsEnabled: true, news: [] });
    for (const path of ["/admin", "/auth", "/profile", "/fantasy/team", "/mcp", "/unsubscribe"]) {
      expect(`${path}: ${xml.includes(`botolago.com${path}`)}`).toBe(`${path}: false`);
    }
  });

  test("each article appears once at its canonical URL, with alternates only for public counterparts", () => {
    const xml = buildSitemapXml({
      newsEnabled: true,
      news: [
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
      ],
    });
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

  test("the route serves XML, reads only the sitemap RPC and only while News is enabled", () => {
    const route = readFileSync(join(import.meta.dir, "../routes/sitemap[.]xml.ts"), "utf8");
    expect(route).toContain('if (NEWS_ENABLED && getNewsDataMode() === "supabase")');
    // Every public article that fits, not the RPC's default page of 5,000:
    // the licensed archive alone is ~15,700 editions.
    expect(route).toContain("getSitemapEntries(SITEMAP_NEWS_LIMIT)");
    expect(route).toContain('"content-type": "application/xml; charset=utf-8"');
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
    const xml = buildSitemapXml({
      newsEnabled: true,
      news: [
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
      ],
    });
    expect(xml).toContain(`${FR}</loc><lastmod>2023-05-14T18:30:00.000Z</lastmod>`);
    expect(xml).toContain(`${AR}</loc><lastmod>2026-09-21T16:45:00.000Z</lastmod>`);
    expect(xml).toContain("0000000000f3</loc><lastmod>2026-09-19T08:00:00.000Z</lastmod>");
    expect(xml).not.toContain("2026-09-24");
  });

  test("a failed News read is a 503, not a sitemap without the articles", () => {
    const route = readFileSync(join(import.meta.dir, "../routes/sitemap[.]xml.ts"), "utf8");
    expect(route).toContain("status: 503");
    expect(route).toContain('"retry-after": "300"');
    expect(route).not.toContain("news = [];\n          }");
    // The failure itself is never cached anywhere.
    expect(route).toContain('"cache-control": "no-store"');
  });

  test("a good sitemap is cacheable within the five-minute promise, and outlives an outage", () => {
    const route = readFileSync(join(import.meta.dir, "../routes/sitemap[.]xml.ts"), "utf8");
    expect(route).toContain('"cache-control": SITEMAP_CACHE_CONTROL');

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

  test("a full sitemap never exceeds the protocol's 50,000 URLs", () => {
    const entry = (i: number): SitemapNewsEntry => ({
      id: `9b2f0c1e-0000-4000-8000-${i.toString().padStart(12, "0")}`,
      language: "fr",
      publishedAt: "2026-09-21T10:00:00.000Z",
      translations: [],
    });
    const news = Array.from({ length: SITEMAP_NEWS_LIMIT }, (_, i) => entry(i));
    const xml = buildSitemapXml({ newsEnabled: true, news });
    expect(xml.match(/<url>/g)).toHaveLength(50_000);
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
