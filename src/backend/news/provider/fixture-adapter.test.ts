import { describe, expect, test } from "bun:test";
import { FixtureNewsProvider } from "./fixture-adapter";
import { NewsProviderError } from "./contracts";

const article = {
  externalId: "fixture-1",
  canonicalUrl: "https://publisher.test/articles/fixture-1",
  language: "fr",
  title: "Article fournisseur de validation",
  subtitle: null,
  summary: "Un résumé fournisseur suffisamment long pour validation.",
  bodyHtml: "<p>Un corps fournisseur suffisamment long pour validation.</p>",
  authorName: "Fixture Author",
  publishedAt: "2025-01-01T00:00:00.000Z",
  updatedAt: "2025-01-01T00:10:00.000Z",
  heroUrl: null,
  categorySlugs: ["analysis"],
  topicSlugs: [],
  tagSlugs: ["botola-pro"],
  providerVersion: "1",
  fixtureSequence: 1,
};

describe("fixture news provider", () => {
  test("supports deterministic cursor pagination and normalization", async () => {
    const provider = new FixtureNewsProvider([article, { ...article, externalId: "fixture-2" }]);
    const first = await provider.fetchArticles({ limit: 1 }, new AbortController().signal);
    expect(first.nextCursor).toBe("1");
    expect(provider.normalize(first.items[0]).externalId).toBe("fixture-1");
  });

  test("rejects malformed provider payloads", () => {
    const provider = new FixtureNewsProvider([]);
    expect(() => provider.normalize({ externalId: "bad" })).toThrow(NewsProviderError);
  });
});
