import { describe, expect, test } from "bun:test";

import type {
  ArticleCardDto,
  ArticleDetailDto,
  NewsRepository,
  SavedArticlePageDto,
} from "@/backend/news/contracts";
import { savedArticlePageSchema } from "@/backend/news/contracts";
import { NewsError } from "@/backend/news/errors";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import { encodeSavedCursor } from "@/backend/news/supabase-repository";
import { collectSavedIds, getSavedEntriesPage, resolveSavedIds, SAVED_PAGE_SIZE } from "./news";

/**
 * Audit UX-001, the data side of the reading list: every saved story is
 * reachable (the server pages at 50), a failed read is a failure, and a story
 * that is gone becomes a row to remove rather than a crash.
 */

const context = { actorId: null, requestId: "saved-test" } as const;
const uuid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

function card(n: number): ArticleCardDto {
  return {
    id: uuid(n),
    storyId: uuid(10_000 + n),
    language: "fr",
    slug: `story-${n}`,
    title: `Titre ${n}`,
    subtitle: null,
    summary: "Résumé",
    publishedAt: "2026-10-01T10:00:00.000Z",
    updatedAt: "2026-10-01T10:00:00.000Z",
    readingTimeMinutes: 2,
    hero: null,
    author: null,
    publisher: null,
    primaryCategory: null,
    tags: [],
    teamIds: [],
    competitionIds: [],
    placement: null,
    isSaved: true,
    savedAt: "2026-10-02T10:00:00.000Z",
  };
}

/** A server-shaped saved list of `total` stories, paged like `api.news_saved_articles`. */
function savedRepository(total: number) {
  const calls: Array<string | null | undefined> = [];
  const repository: Pick<NewsRepository, "getSaved"> = {
    async getSaved(limit, _context, cursor) {
      calls.push(cursor);
      const size = Math.min(limit, 50);
      const start = cursor ? Number(JSON.parse(decodeURIComponent(cursor)).offset) : 0;
      const items = Array.from({ length: Math.max(0, Math.min(size, total - start)) }, (_, i) =>
        card(start + i + 1),
      );
      const more = start + size < total;
      // The real cursor is { createdAt, articleId }; the offset rides in a
      // field the schema ignores only in this fake.
      const nextCursor = more
        ? ({
            createdAt: "2026-10-02T10:00:00.000Z",
            articleId: uuid(start + size),
            offset: start + size,
          } as SavedArticlePageDto["nextCursor"])
        : null;
      return { items, nextCursor };
    },
  };
  return { repository, calls };
}

describe("the saved ids behind every bookmark and the Profile count", () => {
  test("a reader with more than one page of saves gets all of them", async () => {
    const { repository, calls } = savedRepository(120);
    const ids = await collectSavedIds(repository, context);
    expect(ids).toHaveLength(120);
    expect(new Set(ids).size).toBe(120);
    expect(calls).toHaveLength(3);
    expect(SAVED_PAGE_SIZE).toBe(50);
  });

  test("a short list is one request", async () => {
    const { repository, calls } = savedRepository(3);
    expect(await collectSavedIds(repository, context)).toHaveLength(3);
    expect(calls).toHaveLength(1);
  });

  test("an empty list is an empty list", async () => {
    const { repository } = savedRepository(0);
    expect(await collectSavedIds(repository, context)).toEqual([]);
  });

  test("stops when the server repeats a cursor, and counts each id once", async () => {
    let calls = 0;
    const repeating: Pick<NewsRepository, "getSaved"> = {
      async getSaved() {
        calls += 1;
        return {
          items: [card(1), card(2)],
          nextCursor: { createdAt: "2026-10-02T10:00:00.000Z", articleId: uuid(2) },
        };
      },
    };
    const ids = await collectSavedIds(repeating, context);
    expect(ids).toEqual([uuid(1), uuid(2)]);
    expect(calls).toBe(2);
  });

  test("says so when the page cap is hit instead of truncating silently", async () => {
    let calls = 0;
    const endless: Pick<NewsRepository, "getSaved"> = {
      async getSaved() {
        calls += 1;
        return {
          items: [card(calls)],
          nextCursor: { createdAt: "2026-10-02T10:00:00.000Z", articleId: uuid(calls) },
        };
      },
    };
    const warnings: string[] = [];
    const original = console.warn;
    console.warn = (message: string) => void warnings.push(message);
    try {
      const ids = await collectSavedIds(endless, context);
      expect(ids).toHaveLength(40);
      expect(calls).toBe(40);
    } finally {
      console.warn = original;
    }
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toContain("40 pages");
  });

  test("a failed read throws instead of answering with a shorter list", async () => {
    const repository: Pick<NewsRepository, "getSaved"> = {
      async getSaved() {
        throw new NewsError("data_unavailable", "down");
      },
    };
    await expect(collectSavedIds(repository, context)).rejects.toThrow();
  });
});

describe("the page the server really sends", () => {
  test("accepts the saved list's own cursor, { createdAt, articleId }", () => {
    // Before this, the page was parsed with the feed's { publishedAt, id }
    // cursor: any reader with more than 50 saves got "invalid DTO" for the
    // whole list.
    const page = {
      items: [card(1)],
      nextCursor: { createdAt: "2026-10-02T10:00:00+00:00", articleId: uuid(1) },
    };
    expect(savedArticlePageSchema.safeParse(page).success).toBe(true);
    expect(savedArticlePageSchema.safeParse({ items: [], nextCursor: null }).success).toBe(true);
  });

  test("rejects a cursor that is not the saved list's", () => {
    const page = {
      items: [],
      nextCursor: { publishedAt: "2026-10-02T10:00:00+00:00", id: uuid(1) },
    };
    expect(savedArticlePageSchema.safeParse(page).success).toBe(false);
  });

  test("a cursor survives the trip into the next request", () => {
    const encoded = encodeSavedCursor({
      createdAt: "2026-10-02T10:00:00.000Z",
      articleId: uuid(7),
    });
    expect(encoded).not.toBeNull();
    expect(JSON.parse(decodeURIComponent(encoded!))).toEqual({
      createdAt: "2026-10-02T10:00:00.000Z",
      articleId: uuid(7),
    });
    expect(encodeSavedCursor(null)).toBeNull();
  });
});

describe("the collection's rows", () => {
  test("a page becomes article rows, with the cursor of the next page", async () => {
    const { repository } = savedRepository(60);
    const first = await getSavedEntriesPage(repository, null, context);
    expect(first.entries).toHaveLength(50);
    expect(first.entries.every((entry) => entry.kind === "article")).toBe(true);
    expect(first.nextCursor).not.toBeNull();
    const second = await getSavedEntriesPage(repository, first.nextCursor, context);
    expect(second.entries).toHaveLength(10);
    expect(second.nextCursor).toBeNull();
  });

  test("a failed page read is thrown, never an empty page", async () => {
    const repository: Pick<NewsRepository, "getSaved"> = {
      async getSaved() {
        throw new NewsError("data_unavailable", "down");
      },
    };
    await expect(getSavedEntriesPage(repository, null, context)).rejects.toThrow();
  });
});

describe("a saved story that is gone", () => {
  const mock = new MockNewsRepository();

  test("is a removable placeholder, in place, while the others still load", async () => {
    const real = (await mock.getFeed({ language: "fr", limit: 1 }, context)).items[0]!;
    const entries = await resolveSavedIds(mock, [real.id, uuid(999_999), real.id], "fr", context);
    expect(entries.map((entry) => entry.kind)).toEqual(["article", "unavailable", "article"]);
    expect(entries[1]).toEqual({ kind: "unavailable", id: uuid(999_999) });
  });

  test("any other failure is a failure, so the page can offer a retry", async () => {
    const repository: Pick<NewsRepository, "getArticle"> = {
      async getArticle(): Promise<ArticleDetailDto> {
        throw new NewsError("data_unavailable", "timeout");
      },
    };
    await expect(resolveSavedIds(repository, [uuid(1)], "fr", context)).rejects.toThrow();
  });
});
