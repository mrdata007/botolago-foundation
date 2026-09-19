import { describe, expect, it } from "vitest";
import { buildArticleHead, buildArticleJsonLd, buildCanonicalArticleUrl } from "./article-meta";
import type { ArticleDetailDto } from "@/backend/news/contracts";

function detail(overrides: Partial<ArticleDetailDto> = {}): ArticleDetailDto {
  return {
    id: "article-1",
    storyId: "story-1",
    language: "fr",
    slug: "titre-officiel",
    title: "Titre officiel",
    subtitle: null,
    summary: "Résumé officiel",
    publishedAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:00.000Z",
    readingTimeMinutes: 4,
    hero: {
      id: "hero-1",
      sourceUrl: "https://media.example.test/article.jpg",
      storagePath: null,
      alt: "Alt",
      caption: null,
      credit: null,
      width: 1600,
      height: 1000,
      mimeType: "image/jpeg",
    },
    author: { id: "author-1", slug: "author", name: "Amine El Idrissi" },
    publisher: { id: "pub-1", slug: "botolago", name: "BotolaGO" },
    primaryCategory: { id: "cat-1", slug: "mercato", name: "Mercato" },
    tags: [],
    teamIds: [],
    competitionIds: [],
    placement: null,
    isSaved: false,
    bodyHtml: "<p>Contenu</p>",
    bodyFormat: "rich_text",
    seo: { title: null, description: null },
    taxonomies: [],
    competitions: [],
    teams: [],
    players: [],
    ...overrides,
  } as ArticleDetailDto;
}

describe("buildCanonicalArticleUrl", () => {
  it("encodes the identifier into a stable botolago.com URL", () => {
    expect(buildCanonicalArticleUrl("article 1")).toBe("https://botolago.com/news/article%201");
  });
});

describe("article metadata", () => {
  it("emits article-specific social, canonical, image, and publication metadata", () => {
    const article = detail();
    const head = buildArticleHead(article, "article 1");

    expect(head.links).toEqual([
      { rel: "canonical", href: "https://botolago.com/news/article%201" },
    ]);
    expect(head.meta).toContainEqual({ title: "Titre officiel — BotolaGO" });
    expect(head.meta).toContainEqual({ property: "og:type", content: "article" });
    expect(head.meta).toContainEqual({
      property: "article:published_time",
      content: article.publishedAt,
    });
    expect(head.meta).toContainEqual({
      property: "og:image",
      content: "https://media.example.test/article.jpg",
    });
    expect(head.meta).not.toContainEqual(
      expect.objectContaining({ property: "article:modified_time" }),
    );
  });

  it("reads the CURRENTLY RENDERED language's title/summary, not French, for an Arabic edition", () => {
    const arabic = detail({
      language: "ar",
      title: "عنوان رسمي",
      summary: "ملخص رسمي",
      subtitle: null,
    });
    const head = buildArticleHead(arabic, "article-ar");

    expect(head.meta).toContainEqual({ title: "عنوان رسمي — BotolaGO" });
    expect(head.meta).toContainEqual({ name: "description", content: "ملخص رسمي" });
    expect(head.meta).toContainEqual({ property: "og:locale", content: "ar_MA" });
  });

  it("prefers the DTO's own seo.title/seo.description when present", () => {
    const article = detail({ seo: { title: "SEO title", description: "SEO description" } });
    const head = buildArticleHead(article, "article-1");
    expect(head.meta).toContainEqual({ title: "SEO title — BotolaGO" });
    expect(head.meta).toContainEqual({ name: "description", content: "SEO description" });
  });

  it("surfaces a distinct modified time only when updatedAt differs from publishedAt", () => {
    const updated = detail({ updatedAt: "2026-08-03T09:00:00.000Z" });
    const head = buildArticleHead(updated, "article-1");
    expect(head.meta).toContainEqual({
      property: "article:modified_time",
      content: "2026-08-03T09:00:00.000Z",
    });
  });

  it("falls back to a generic BotolaGO head when no article loaded, and adds no JSON-LD", () => {
    const head = buildArticleHead(null, "missing");
    expect(head.meta).toContainEqual({ title: "Actualités — BotolaGO — BotolaGO" });
    expect(head).not.toHaveProperty("scripts");
  });

  it("attaches a NewsArticle JSON-LD script built only from real DTO fields", () => {
    const article = detail();
    const head = buildArticleHead(article, "article-1");
    expect(head.scripts).toHaveLength(1);
    const script = head.scripts![0];
    expect(script.tag).toBe("script");
    expect(script.attrs).toEqual({ type: "application/ld+json" });
    const jsonLd = JSON.parse(script.children!);
    expect(jsonLd["@type"]).toBe("NewsArticle");
    expect(jsonLd.headline).toBe("Titre officiel");
    expect(jsonLd.datePublished).toBe(article.publishedAt);
    expect(jsonLd.author).toEqual({ "@type": "Person", name: "Amine El Idrissi" });
    expect(jsonLd.publisher).toEqual({ "@type": "Organization", name: "BotolaGO" });
    expect(jsonLd.image).toEqual(["https://media.example.test/article.jpg"]);
  });
});

describe("buildArticleJsonLd", () => {
  it("never fabricates an author when the DTO has neither an author nor a publisher name", () => {
    const article = detail({ author: null, publisher: null });
    const jsonLd = buildArticleJsonLd(article, "https://botolago.com/news/x")!;
    expect(jsonLd.author).toBeUndefined();
    // Publisher still resolves to BotolaGO's own real identity, not a fabricated name.
    expect(jsonLd.publisher).toEqual({ "@type": "Organization", name: "BotolaGO" });
  });

  it("omits the image field when the article has no hero media", () => {
    const article = detail({ hero: null });
    const jsonLd = buildArticleJsonLd(article, "https://botolago.com/news/x")!;
    expect(jsonLd.image).toBeUndefined();
  });
});
