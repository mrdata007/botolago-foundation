import { describe, expect, test } from "bun:test";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import type { NewsLanguage, NewsRepository } from "@/backend/news/contracts";
import { NewsError } from "@/backend/news/errors";
import { getArticleWithLanguageFallback, presentArticle, selectNewsDataMode } from "./news";

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

  test("opens an Arabic-only edition UUID for a French viewer without relabeling its content", async () => {
    const mock = new MockNewsRepository();
    const feed = await mock.getFeed({ language: "ar", limit: 1 });
    const arabicEdition = await mock.getArticle(feed.items[0]!.id, "ar");
    const calls: NewsLanguage[] = [];
    const repository: Pick<NewsRepository, "getArticle"> = {
      async getArticle(identifier, language, requestContext) {
        expect(identifier).toBe(arabicEdition.id);
        expect(requestContext).toBe(context);
        calls.push(language);
        if (language === "fr") throw new NewsError("article_not_found", "No French edition.");
        return arabicEdition;
      },
    };

    const result = await getArticleWithLanguageFallback(
      repository,
      arabicEdition.id,
      "fr",
      context,
    );
    const article = presentArticle(result);

    expect(calls).toEqual(["fr", "ar"]);
    expect(result).toBe(arabicEdition);
    expect(article.language).toBe("ar");
    expect(article.title.fr).toBe(arabicEdition.title);
    expect(article.bodyHtml).toBe(arabicEdition.bodyHtml);
  });

  test.each([
    ["network", new TypeError("fetch failed")],
    ["mapped network", new NewsError("data_unavailable", "fetch failed")],
    ["authorization", new NewsError("unauthorized", "Access denied.")],
  ])("surfaces %s failures without retrying another locale", async (_label, failure) => {
    let calls = 0;
    const repository: Pick<NewsRepository, "getArticle"> = {
      async getArticle() {
        calls += 1;
        throw failure;
      },
    };

    await expect(
      getArticleWithLanguageFallback(
        repository,
        "b1d6f58d-218f-4912-abdb-f3e5eddfd977",
        "fr",
        context,
      ),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
  });

  test("keeps language-specific slug misses in the requested locale", async () => {
    let calls = 0;
    const failure = new NewsError("article_not_found", "No matching slug.");
    const repository: Pick<NewsRepository, "getArticle"> = {
      async getArticle() {
        calls += 1;
        throw failure;
      },
    };

    await expect(
      getArticleWithLanguageFallback(repository, "missing-french-slug", "fr", context),
    ).rejects.toBe(failure);
    expect(calls).toBe(1);
  });

  test("stops after the other locale also reports an edition UUID missing", async () => {
    const calls: NewsLanguage[] = [];
    const failure = new NewsError("article_not_found", "No matching edition.");
    const repository: Pick<NewsRepository, "getArticle"> = {
      async getArticle(_identifier, language) {
        calls.push(language);
        throw failure;
      },
    };

    await expect(
      getArticleWithLanguageFallback(
        repository,
        "b1d6f58d-218f-4912-abdb-f3e5eddfd977",
        "ar",
        context,
      ),
    ).rejects.toBe(failure);
    expect(calls).toEqual(["ar", "fr"]);
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
});
