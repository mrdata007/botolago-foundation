import { describe, expect, it } from "vitest";
import { buildArticleHead } from "./article-meta";
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
      { rel: "canonical", href: "https://www.botolago.app/news/article%201" },
    ]);
    expect(head.meta).toContainEqual({ title: "Titre officiel — BotolaGO" });
    expect(head.meta).toContainEqual({ property: "og:type", content: "article" });
    expect(head.meta).toContainEqual({
      property: "article:published_time",
      content: article.publishedAt,
    });
    expect(head.meta).toContainEqual({ property: "og:image", content: article.heroUrl });
  });
});
