import { describe, expect, test } from "bun:test";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import type { NewsLanguage, NewsRepository } from "@/backend/news/contracts";
import { NewsError } from "@/backend/news/errors";
import {
  getArticleWithLanguageFallback,
  getNewsEdition,
  newsArticlesForCategory,
  presentArticle,
  selectNewsDataMode,
  selectNewsLead,
} from "./news";

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

describe("Available news editions", () => {
  const now = Date.parse("2026-09-14T20:00:00Z");

  async function fixtures() {
    const mock = new MockNewsRepository();
    const french = {
      ...(await mock.getFeed({ language: "fr", limit: 1 })).items[0]!,
      publishedAt: "2026-07-28T12:00:00Z",
    };
    const arabic = {
      ...(await mock.getFeed({ language: "ar", limit: 1 })).items[0]!,
      publishedAt: "2026-09-14T18:18:00Z",
    };
    const languages: NewsLanguage[] = [];
    const repository: Pick<NewsRepository, "getFeed" | "getHomeModules"> = {
      async getFeed(input) {
        languages.push(input.language);
        return { items: [input.language === "fr" ? french : arabic], nextCursor: null };
      },
      async getHomeModules(language) {
        return { lead: null, latest: [], featured: [], generatedAt: new Date(now).toISOString() };
      },
    };
    return { french, arabic, languages, repository };
  }

  test("keeps a French reader on the French edition even when the Arabic feed is fresher", async () => {
    const { repository, french, arabic, languages } = await fixtures();
    expect(Date.parse(arabic.publishedAt)).toBeGreaterThan(Date.parse(french.publishedAt));

    const edition = await getNewsEdition(repository, "fr", "auto", context, now);

    // The other language is still read, so its failures surface and the
    // fallback below costs no extra round trip.
    expect(languages).toEqual(["fr", "ar"]);
    expect(edition.language).toBe("fr");
    expect(edition.articles.map((article) => article.id)).toEqual([french.id]);
    expect(edition.lead?.language).toBe("fr");
    expect(edition.lead?.title.fr).toBe(french.title);
    expect(edition.lead?.publishedAt).toBe(french.publishedAt);
  });

  test("keeps an Arabic reader on the Arabic edition even when the French feed is fresher", async () => {
    const { repository, french, arabic, languages } = await fixtures();
    french.publishedAt = "2026-09-14T19:30:00Z";
    expect(Date.parse(french.publishedAt)).toBeGreaterThan(Date.parse(arabic.publishedAt));

    const edition = await getNewsEdition(repository, "ar", "auto", context, now);

    expect(languages).toEqual(["ar", "fr"]);
    expect(edition.language).toBe("ar");
    expect(edition.articles.map((article) => article.id)).toEqual([arabic.id]);
    expect(edition.lead?.language).toBe("ar");
    expect(edition.lead?.title.fr).toBe(arabic.title);
    expect(edition.lead?.publishedAt).toBe(arabic.publishedAt);
  });

  test("falls back to the other language only when the reader's own feed is empty", async () => {
    const french = await fixtures();
    french.repository.getFeed = async (input) => {
      french.languages.push(input.language);
      return { items: input.language === "fr" ? [] : [french.arabic], nextCursor: null };
    };
    const frenchEdition = await getNewsEdition(french.repository, "fr", "auto", context, now);
    expect(frenchEdition.language).toBe("ar");
    expect(frenchEdition.articles.map((article) => article.id)).toEqual([french.arabic.id]);

    const arabic = await fixtures();
    arabic.repository.getFeed = async (input) => {
      arabic.languages.push(input.language);
      return { items: input.language === "ar" ? [] : [arabic.french], nextCursor: null };
    };
    const arabicEdition = await getNewsEdition(arabic.repository, "ar", "auto", context, now);
    expect(arabicEdition.language).toBe("fr");
    expect(arabicEdition.articles.map((article) => article.id)).toEqual([arabic.french.id]);
  });

  test.each(["fr", "ar"] as const)(
    "keeps an all-empty %s edition in the reader's own language",
    async (language) => {
      const { repository } = await fixtures();
      repository.getFeed = async () => ({ items: [], nextCursor: null });
      const edition = await getNewsEdition(repository, language, "auto", context, now);
      expect(edition).toEqual({ language, articles: [], lead: null });
    },
  );

  test("explicit French selection preserves the French archive and reads no Arabic feed", async () => {
    const { repository, french, languages } = await fixtures();
    const edition = await getNewsEdition(repository, "ar", "fr", context, now);
    expect(languages).toEqual(["fr"]);
    expect(edition.language).toBe("fr");
    expect(edition.articles[0]?.id).toBe(french.id);
    expect(edition.lead?.publishedAt).toBe(french.publishedAt);
  });

  test("an empty explicitly selected feed remains empty", async () => {
    const { repository } = await fixtures();
    repository.getFeed = async () => ({ items: [], nextCursor: null });
    const edition = await getNewsEdition(repository, "ar", "fr", context, now);
    expect(edition).toEqual({ language: "fr", articles: [], lead: null });
  });

  test.each(["fr", "ar"] as const)(
    "surfaces a failed %s request instead of silently changing the feed",
    async (language) => {
      const { repository } = await fixtures();
      const getFeed = repository.getFeed;
      const failure = new NewsError("data_unavailable", "News request failed.");
      repository.getFeed = (input, requestContext) => {
        if (input.language === language) return Promise.reject(failure);
        return getFeed(input, requestContext);
      };
      await expect(getNewsEdition(repository, "fr", "auto", context, now)).rejects.toBe(failure);
    },
  );

  test("surfaces editorial module errors instead of reporting an empty lead", async () => {
    const { repository } = await fixtures();
    const failure = new NewsError("data_unavailable", "Editorial request failed.");
    repository.getHomeModules = async () => {
      throw failure;
    };
    await expect(getNewsEdition(repository, "fr", "auto", context, now)).rejects.toBe(failure);
  });

  test("replaces missing or stale leads with the latest real article, while retaining a fresh editorial lead", async () => {
    const { french, arabic } = await fixtures();
    expect(selectNewsLead(null, [french, arabic], now)).toBe(arabic);
    expect(selectNewsLead(french, [arabic], now)).toBe(arabic);
    const freshLead = { ...french, publishedAt: "2026-09-14T12:00:00Z" };
    expect(selectNewsLead(freshLead, [arabic], now)).toBe(freshLead);
    expect(selectNewsLead(null, [], now)).toBeNull();
  });

  test("Latest includes all categories in publication order; category tabs remain selective", async () => {
    const { french, arabic } = await fixtures();
    const oldest = { ...presentArticle(french), id: "oldest", category: "latest" as const };
    const transfer = { ...presentArticle(arabic), id: "transfer", category: "transfers" as const };
    const analysis = {
      ...presentArticle(arabic),
      id: "analysis",
      category: "analysis" as const,
      publishedAt: "2026-09-14T19:00:00Z",
    };
    const articles = [oldest, transfer, analysis];
    expect(newsArticlesForCategory(articles, "latest").map((article) => article.id)).toEqual([
      "analysis",
      "transfer",
      "oldest",
    ]);
    expect(newsArticlesForCategory(articles, "transfers").map((article) => article.id)).toEqual([
      "transfer",
    ]);
    expect(articles.map((article) => article.id)).toEqual(["oldest", "transfer", "analysis"]);
  });
});
