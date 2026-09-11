import { describe, expect, it } from "vitest";
import { buildArticleHead, PUBLIC_SITE_ORIGIN } from "./article-meta";
import type { Article } from "@/types/domain";

const article: Article = {
  id: "article-1",
  title: { fr: "Titre officiel", ar: "عنوان رسمي" },
  excerpt: { fr: "Résumé officiel", ar: "ملخص رسمي" },
  category: "latest",
  clubIds: [],
  authorName: { fr: "BotolaGO", ar: "BotolaGO" },
  publishedAt: "2026-08-02T12:00:00.000Z",
  readMinutes: 4,
  heroGradient: "linear-gradient(#000,#111)",
  heroUrl: "https://media.example.test/article.jpg",
};

describe("article metadata", () => {
  it("emits article-specific social, canonical, image, and publication metadata", () => {
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
    expect(head.meta).toContainEqual({ property: "og:image", content: article.heroUrl });
  });

  it("uses the verified public origin rather than the legacy or preview domain", () => {
    expect(PUBLIC_SITE_ORIGIN).toBe("https://botolago.com");
    const head = buildArticleHead(article, article.id);
    expect(head.meta).toContainEqual({
      property: "og:url",
      content: head.links[0].href,
    });
    expect(new URL(head.links[0].href).origin).toBe("https://botolago.com");
  });

  it("encodes URL-like article identifiers without changing the sharing origin", () => {
    const identifier = "https://other.example/a?token=x#fragment";
    const head = buildArticleHead(article, identifier);
    const canonical = new URL(head.links[0].href);
    expect(canonical.origin).toBe("https://botolago.com");
    expect(canonical.pathname).toBe(`/news/${encodeURIComponent(identifier)}`);
    expect(canonical.search).toBe("");
    expect(canonical.hash).toBe("");
  });

  it("encodes Arabic article identifiers", () => {
    const identifier = "أخبار البطولة";
    const head = buildArticleHead(article, identifier);
    expect(head.links[0].href).toBe(`https://botolago.com/news/${encodeURIComponent(identifier)}`);
  });

  it("keeps missing-article metadata safe without inventing an image or publication date", () => {
    for (const missing of [null, undefined]) {
      const head = buildArticleHead(missing, "missing");
      expect(head.links[0].href).toBe("https://botolago.com/news/missing");
      expect(head.meta.some((entry) => "property" in entry && entry.property === "og:image")).toBe(false);
      expect(head.meta.some((entry) => "property" in entry && entry.property === "article:published_time")).toBe(false);
    }
  });
});
