import { describe, expect, test } from "bun:test";
import { canonicalizeNewsUrl, newsContentFingerprint } from "./dedupe";
import { normalizedNewsArticleSchema } from "../provider/schemas";

const input = normalizedNewsArticleSchema.parse({
  externalId: "one",
  canonicalUrl: "https://EXAMPLE.com/story/?utm_source=test&b=2&a=1#fragment",
  language: "fr",
  title: "Titre stable pour empreinte",
  subtitle: null,
  summary: "Résumé stable suffisamment long.",
  bodyHtml: "<p>Corps stable suffisamment long pour empreinte.</p>",
  authorName: null,
  publishedAt: "2025-01-01T00:00:00Z",
  updatedAt: "2025-01-01T00:00:00Z",
  heroUrl: null,
  categorySlugs: [],
  topicSlugs: [],
  tagSlugs: [],
  providerVersion: null,
});

describe("news deduplication", () => {
  test("normalizes canonical URLs without tracking parameters", () => {
    expect(canonicalizeNewsUrl(input.canonicalUrl)).toBe("https://example.com/story?a=1&b=2");
  });
  test("content fingerprint is deterministic", () => {
    expect(newsContentFingerprint(input)).toMatch(/^[a-f0-9]{64}$/);
    expect(newsContentFingerprint(input)).toBe(newsContentFingerprint({ ...input }));
  });
});
