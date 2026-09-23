import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { buildSitemapXml } from "./sitemap";

const FR = "9b2f0c1e-0000-4000-8000-0000000000f1";
const AR = "9b2f0c1e-0000-4000-8000-0000000000a1";

describe("sitemap.xml", () => {
  test("with News off, no News URL is advertised even if entries were passed", () => {
    const xml = buildSitemapXml({
      newsEnabled: false,
      news: [{ id: FR, language: "fr", updatedAt: "2026-09-22T10:00:00Z", translations: [] }],
    });
    expect(xml).not.toContain("/news");
    expect(xml).toContain("<loc>https://botolago.com/</loc>");
    expect(xml).toContain("<loc>https://botolago.com/fantasy/rules</loc>");
  });

  test("never lists the CMS, sign-in or personal pages", () => {
    const xml = buildSitemapXml({ newsEnabled: true, news: [] });
    for (const path of ["/admin", "/auth", "/profile", "/fantasy/team", "/mcp"]) {
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
          updatedAt: "2026-09-22T10:00:00Z",
          translations: [{ id: AR, language: "ar" }],
        },
        {
          id: AR,
          language: "ar",
          updatedAt: "2026-09-22T11:00:00Z",
          translations: [{ id: FR, language: "fr" }],
        },
        {
          id: "9b2f0c1e-0000-4000-8000-0000000000f2",
          language: "fr",
          updatedAt: "2026-09-21T10:00:00Z",
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
    expect(route).toContain("getSitemapEntries()");
    expect(route).toContain('"content-type": "application/xml; charset=utf-8"');
  });
});

describe("robots.txt and crawlable noindex pages", () => {
  const robots = readFileSync(join(import.meta.dir, "../../public/robots.txt"), "utf8");

  test("allows crawlers to read noindex directives and points at the sitemap", () => {
    for (const path of ["/admin", "/auth", "/profile"]) {
      expect(robots).not.toContain(`Disallow: ${path}`);
    }
    expect(robots).toContain("Sitemap: https://botolago.com/sitemap.xml");
    // The public site stays crawlable: no blanket disallow.
    expect(robots).not.toMatch(/^Disallow: \/\s*$/m);
  });

  test("private application areas send noindex directives", () => {
    const admin = readFileSync(join(import.meta.dir, "../routes/admin.tsx"), "utf8");
    expect(admin).toContain('meta: [{ name: "robots", content: "noindex, nofollow" }]');
    const auth = readFileSync(join(import.meta.dir, "../routes/auth.tsx"), "utf8");
    expect(auth).toContain('meta: [{ name: "robots", content: "noindex, follow" }]');
    const profile = readFileSync(join(import.meta.dir, "../routes/profile.tsx"), "utf8");
    expect(profile).toContain('{ name: "robots", content: "noindex, follow" }');
  });

  test("public sitemap pages declare matching canonical URLs", () => {
    const canonicalByPath: Record<string, string> = {
      "/": "${PUBLIC_SITE_ORIGIN}/",
      "/matches": "${PUBLIC_SITE_ORIGIN}/matches",
      "/fantasy": "FANTASY_HUB_URL",
      "/fantasy/rules": "RULES_URL",
      "/privacy": "PRIVACY_URL",
      "/terms": "TERMS_URL",
    };
    const routeByPath: Record<string, string> = {
      "/": "index.tsx",
      "/matches": "matches.index.tsx",
      "/fantasy": "fantasy.index.tsx",
      "/fantasy/rules": "fantasy.rules.tsx",
      "/privacy": "privacy.tsx",
      "/terms": "terms.tsx",
    };

    for (const [path, canonical] of Object.entries(canonicalByPath)) {
      const source = readFileSync(join(import.meta.dir, "../routes", routeByPath[path]), "utf8");
      expect(source, `${path} should declare its sitemap canonical`).toContain(canonical);
    }

    const fantasyLayout = readFileSync(join(import.meta.dir, "../routes/fantasy.tsx"), "utf8");
    expect(fantasyLayout).not.toContain('rel: "canonical"');
    const newsLayout = readFileSync(join(import.meta.dir, "../routes/news.tsx"), "utf8");
    expect(newsLayout).toContain('match.routeId === "/news/$articleId"');
    expect(newsLayout).toContain("links: isArticlePage ? [] :");
  });
});
