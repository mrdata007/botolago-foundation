import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import type { SitemapNewsEntry } from "@/lib/sitemap";
import {
  archiveCursorFor,
  archivePageCount,
  archivePageLinks,
  archivePageOf,
  buildNewsArchivePlan,
  buildNewsArchivePlans,
  validateNewsArchiveSearch,
} from "./news-archive";

/**
 * SEO brief 2026-10-27, Bug 1: /news linked about ten of 15,800 articles. The
 * archive pages the whole list as plain links; its page boundaries come from
 * the sitemap snapshot, in the feed's order.
 */

function uuid(n: number): string {
  return `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`;
}

/** `count` French editions, one per minute, the newest first when sorted. */
function editions(count: number, language: "fr" | "ar" = "fr", firstId = 1): SitemapNewsEntry[] {
  return Array.from({ length: count }, (_, index) => ({
    id: uuid(firstId + index),
    language,
    publishedAt: new Date(Date.UTC(2026, 9, 1, 0, index)).toISOString(),
    translations: [],
  }));
}

describe("the archive plan", () => {
  test("cuts the articles into pages of the given size, newest first", () => {
    const plan = buildNewsArchivePlan(editions(120), "fr", 50);
    expect(plan.total).toBe(120);
    expect(archivePageCount(plan)).toBe(3);
    // Page 2 opens after the 50th newest article (the 71st oldest, index 70).
    expect(plan.cursors[0]).toEqual({
      id: uuid(71),
      publishedAt: new Date(Date.UTC(2026, 9, 1, 0, 70)).toISOString(),
    });
    expect(plan.cursors[1]?.id).toBe(uuid(21));
  });

  test("a full last page does not make an empty page after it", () => {
    expect(archivePageCount(buildNewsArchivePlan(editions(100), "fr", 50))).toBe(2);
    expect(archivePageCount(buildNewsArchivePlan(editions(101), "fr", 50))).toBe(3);
    expect(archivePageCount(buildNewsArchivePlan(editions(1), "fr", 50))).toBe(1);
    expect(archivePageCount(buildNewsArchivePlan([], "fr", 50))).toBe(1);
  });

  test("keeps the languages apart", () => {
    const plans = buildNewsArchivePlans([...editions(60), ...editions(5, "ar", 1000)], 50);
    expect(plans.fr.total).toBe(60);
    expect(plans.ar.total).toBe(5);
    expect(archivePageCount(plans.ar)).toBe(1);
  });

  test("breaks a tie on the time by the id, as the feed does", () => {
    const same = "2026-10-01T00:00:00.000Z";
    const tied: SitemapNewsEntry[] = [3, 1, 2, 4].map((n) => ({
      id: uuid(n),
      language: "fr",
      publishedAt: same,
      translations: [],
    }));
    // Newest first with the id descending: 4, 3 | 2, 1.
    expect(buildNewsArchivePlan(tied, "fr", 2).cursors).toEqual([
      { id: uuid(3), publishedAt: same },
    ]);
  });

  test("looks a page's cursor up, and has none past the last page", () => {
    const plan = buildNewsArchivePlan(editions(120), "fr", 50);
    expect(archiveCursorFor(plan, 1)).toBeNull();
    expect(archiveCursorFor(plan, 2)).toBe(plan.cursors[0]);
    expect(archiveCursorFor(plan, 3)).toBe(plan.cursors[1]);
    expect(archiveCursorFor(plan, 4)).toBeUndefined();
  });
});

describe("the archive's page in the URL", () => {
  test("reads ?page=N from 2 up; the first page is no key", () => {
    expect(validateNewsArchiveSearch({ page: 3 })).toEqual({ page: 3 });
    expect(validateNewsArchiveSearch({ page: "12" })).toEqual({ page: 12 });
    for (const bad of [1, 0, -4, 2.5, "abc", "", null, undefined, Number.NaN, "1e3x"]) {
      expect(validateNewsArchiveSearch({ page: bad })).toEqual({});
    }
    expect(archivePageOf({})).toBe(1);
    expect(archivePageOf({ page: 7 })).toBe(7);
  });
});

describe("the page numbers linked from a page", () => {
  test("a short archive links every page", () => {
    expect(archivePageLinks(1, 4)).toEqual([1, 2, 3, 4]);
    expect(archivePageLinks(1, 1)).toEqual([1]);
  });

  test("a long one links the ends, a window, the current ten and every tenth page", () => {
    const links = archivePageLinks(143, 316);
    expect(links).toContain(1);
    expect(links).toContain(316);
    for (const near of [141, 142, 143, 144, 145]) expect(links).toContain(near);
    for (const tenth of [10, 20, 150, 310]) expect(links).toContain(tenth);
    expect(links).toContain(149);
    expect(links).not.toContain(155);
    expect(links).toContain(null);
  });

  test("every page is reachable from the first in two steps", () => {
    const last = 316;
    const first = new Set(archivePageLinks(1, last));
    for (let page = 1; page <= last; page += 1) {
      const direct = first.has(page);
      const viaTenth = [...first].some(
        (via) => via !== null && archivePageLinks(via, last).includes(page),
      );
      expect(direct || viaTenth).toBe(true);
    }
  });

  test("never links a page that does not exist, nor the same page twice", () => {
    for (const [current, last] of [
      [1, 2],
      [2, 2],
      [300, 316],
      [316, 316],
    ] as const) {
      const pages = archivePageLinks(current, last).filter((n): n is number => n !== null);
      expect(new Set(pages).size).toBe(pages.length);
      expect(pages.every((n) => n >= 1 && n <= last)).toBe(true);
    }
  });
});

describe("the pages around the archive", () => {
  const read = (path: string) => readFileSync(join(import.meta.dir, "../..", path), "utf8");

  test("the hub links to the archive in its own HTML", () => {
    expect(read("routes/news.tsx")).toContain('to="/news/archive"');
  });

  test("the archive page is self-canonical, with prev and next, and 404s past the end", () => {
    const route = read("routes/news.archive.tsx");
    expect(route).toContain('rel: "canonical"');
    expect(route).toContain('rel: "prev"');
    expect(route).toContain('rel: "next"');
    expect(route).toContain("throw notFound()");
    expect(route).toContain("unavailableHeaders(loaderData)");
  });

  test("an article's related articles are read for the server's HTML", () => {
    const route = read("routes/news.$articleId.tsx");
    expect(route).toContain('queryKey: ["news", "related", "fr", params.articleId]');
    expect(route).toContain("prefetchForSsr");
  });
});
