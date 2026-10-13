import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import { presentArticle, selectNewsDataMode } from "./news";

const context = { actorId: null, requestId: "news-test" } as const;

describe("News frontend repository cutover", () => {
  test("fails closed when production mode is not configured", () => {
    expect(() => selectNewsDataMode(undefined, true)).toThrow("VITE_NEWS_DATA_MODE=supabase");
    expect(() => selectNewsDataMode("mock", true)).toThrow("VITE_NEWS_DATA_MODE=supabase");
    expect(selectNewsDataMode(undefined, false)).toBe("mock");
    expect(selectNewsDataMode("supabase", true)).toBe("supabase");
  });

  test("preserves deterministic bilingual mock contracts", async () => {
    const repository = new MockNewsRepository();
    const french = await repository.getFeed({ language: "fr", limit: 10 }, context);
    const arabic = await repository.getFeed({ language: "ar", limit: 10 }, context);
    expect(french.items[0]?.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(french.items[0]?.title).not.toBe(arabic.items[0]?.title);
  });

  test("provides article detail and related content without route joins", async () => {
    const repository = new MockNewsRepository();
    const feed = await repository.getFeed({ language: "fr", limit: 10 }, context);
    const detail = await repository.getArticle(feed.items[0]!.id, "fr", context);
    expect(detail.bodyHtml).toContain("<p>");
    expect(Array.isArray(await repository.getRelated(detail.id, 6, context))).toBe(true);
  });

  test("maps news storage media and editorial alt text into presentation", async () => {
    const repository = new MockNewsRepository();
    const feed = await repository.getFeed({ language: "fr", limit: 1 }, context);
    const dto = feed.items[0]!;
    const article = presentArticle(
      {
        ...dto,
        hero: {
          id: "90000000-0000-4000-8000-000000000001",
          sourceUrl: null,
          storagePath: "news/articles/derby hero.webp",
          alt: "Supporters dans les tribunes",
          caption: null,
          credit: null,
          width: 1600,
          height: 1000,
          mimeType: "image/webp",
        },
      },
      "https://botolago-test.supabase.co",
    );

    expect(article.heroUrl).toBe(
      "https://botolago-test.supabase.co/storage/v1/object/public/news-media/news/articles/derby%20hero.webp",
    );
    expect(article.heroAlt).toBe("Supporters dans les tribunes");
  });

  test("uses the resolved article UUID for related-content reads", () => {
    const source = readFileSync(new URL("../routes/news.$articleId.tsx", import.meta.url), "utf8");
    expect(source).toContain("const relatedArticleId = articleQ.data?.id");
    expect(source).toContain("newsService.getRelated(relatedArticleId!, lang)");
    expect(source).not.toContain("newsService.getRelated(articleId, lang)");
    expect(source).toContain('error.code === "article_not_found"');
    expect(source).toContain('to="/news"');
  });
});
