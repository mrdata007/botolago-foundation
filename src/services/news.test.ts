import { describe, expect, test } from "bun:test";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import { selectNewsDataMode } from "./news";

const context = { actorId: null, requestId: "news-test" } as const;

describe("News frontend repository cutover", () => {
  test("fails closed when production mode is not configured", () => {
    expect(() => selectNewsDataMode(undefined, true)).toThrow(
      "VITE_NEWS_DATA_MODE=supabase",
    );
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
});
