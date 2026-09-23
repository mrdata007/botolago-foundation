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
