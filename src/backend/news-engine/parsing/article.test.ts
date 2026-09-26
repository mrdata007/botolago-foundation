import { describe, expect, test } from "bun:test";

import { extractJsonLdNodes, parseArticle } from "./article";

const BODY = "أعلن النادي عن التعاقد مع اللاعب. ".repeat(12);

function page(parts: { head?: string; body?: string }): string {
  return `<!doctype html><html lang="ar"><head>${parts.head ?? ""}</head><body>${parts.body ?? ""}</body></html>`;
}

describe("JSON-LD extraction", () => {
  test("flattens @graph nodes", () => {
    const html = page({
      head: `<script type="application/ld+json">{"@graph":[{"@type":"WebSite"},{"@type":"NewsArticle","headline":"X"}]}</script>`,
    });
    const nodes = extractJsonLdNodes(html);
    expect(nodes.some((node) => node["@type"] === "NewsArticle")).toBe(true);
  });

  test("ignores malformed JSON-LD without throwing", () => {
    const html = page({ head: `<script type="application/ld+json">{ not json }</script>` });
    expect(extractJsonLdNodes(html)).toEqual([]);
  });
});

describe("parseArticle", () => {
  test("prefers JSON-LD over markup", () => {
    const html = page({
      head: `<title>Wrong title</title><script type="application/ld+json">{"@type":"NewsArticle","headline":"Right title","datePublished":"2026-09-21T15:00:39Z","dateModified":"2026-09-21T16:00:00Z","author":{"name":"Reporter"},"articleSection":"بطولة","inLanguage":"ar","image":"https://images.example.com/a.jpg","articleBody":${JSON.stringify(BODY)}}</script>`,
      body: `<article><p>ignored</p></article>`,
    });
    const parsed = parseArticle(html, "https://news.example.com/a.html");
    expect(parsed.parseSource).toBe("json_ld");
    expect(parsed.title).toBe("Right title");
    expect(parsed.publishedAt).toBe("2026-09-21T15:00:39.000Z");
    expect(parsed.updatedAt).toBe("2026-09-21T16:00:00.000Z");
    expect(parsed.authorName).toBe("Reporter");
    expect(parsed.section).toBe("بطولة");
    expect(parsed.language).toBe("ar");
    expect(parsed.declaredHeroUrl).toBe("https://images.example.com/a.jpg");
  });

  test("falls back to Open Graph and then to the article container", () => {
    const html = page({
      head: `<meta property="og:title" content="OG title"><meta property="article:published_time" content="2026-09-21T10:00:00Z">`,
      body: `<article><p>${BODY}</p></article>`,
    });
    const parsed = parseArticle(html, "https://news.example.com/a.html");
    expect(parsed.title).toBe("OG title");
    expect(parsed.publishedAt).toBe("2026-09-21T10:00:00.000Z");
    expect(parsed.text.length).toBeGreaterThan(200);
  });

  test("reads reversed meta attribute order", () => {
    const html = page({
      head: `<meta content="Reversed" property="og:title">`,
      body: `<article><p>${BODY}</p></article>`,
    });
    expect(parseArticle(html, "https://news.example.com/a.html").title).toBe("Reversed");
  });

  test("never returns script or style content as article text", () => {
    const html = page({
      body: `<article><script>var secret = "leak";</script><style>.a{}</style><p>${BODY}</p></article>`,
    });
    const parsed = parseArticle(html, "https://news.example.com/a.html");
    expect(parsed.text).not.toContain("secret");
    expect(parsed.text).not.toContain(".a{}");
  });

  test("throws rather than returning a teaser as an article", () => {
    // A headline plus a description is a stub page. Publishing from it would
    // be republishing someone else's excerpt.
    const html = page({
      head: `<meta property="og:title" content="Teaser"><meta name="description" content="Short blurb">`,
      body: `<p>Too short.</p>`,
    });
    // The stable contract is the code, not the prose.
    expect(() => parseArticle(html, "https://news.example.com/a.html")).toThrow();
    try {
      parseArticle(html, "https://news.example.com/a.html");
    } catch (error) {
      expect((error as { code: string }).code).toBe("news_engine_parse_empty");
    }
  });

  test("skips short paragraphs that are navigation, not prose", () => {
    const html = page({
      body: `<p>Accueil</p><p>Sport</p><p>${BODY}</p>`,
    });
    const parsed = parseArticle(html, "https://news.example.com/a.html");
    expect(parsed.text.startsWith("Accueil")).toBe(false);
  });

  test("resolves a relative hero url and rejects a non-https one", () => {
    const relative = page({
      head: `<meta property="og:image" content="/media/a.jpg">`,
      body: `<article><p>${BODY}</p></article>`,
    });
    expect(parseArticle(relative, "https://news.example.com/a.html").declaredHeroUrl).toBe(
      "https://news.example.com/media/a.jpg",
    );

    const insecure = page({
      head: `<meta property="og:image" content="http://news.example.com/a.jpg">`,
      body: `<article><p>${BODY}</p></article>`,
    });
    expect(parseArticle(insecure, "https://news.example.com/a.html").declaredHeroUrl).toBeNull();
  });

  test("uses the fallback language when the page declares none", () => {
    const html = `<html><body><article><p>${BODY}</p></article></body></html>`;
    expect(
      parseArticle(html, "https://news.example.com/a.html", { fallbackLanguage: "fr" }).language,
    ).toBe("fr");
  });

  test("decodes html entities in the title", () => {
    const html = page({
      head: `<title>Raja &amp; Wydad</title>`,
      body: `<article><p>${BODY}</p></article>`,
    });
    expect(parseArticle(html, "https://news.example.com/a.html").title).toBe("Raja & Wydad");
  });
});
