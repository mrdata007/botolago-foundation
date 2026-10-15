import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { newsSearchFrom, validateNewsSearch } from "./news-search";

/**
 * Audit UX-006: the News category and club were page state, and an article
 * replaces the page, so Retour came back to the unfiltered feed. They are now
 * the URL's, through the route's `validateSearch`.
 */
describe("the News filters in the URL", () => {
  test("reads a category and a club", () => {
    expect(validateNewsSearch({ category: "transferts", club: "wac" })).toEqual({
      category: "transferts",
      club: "wac",
    });
    expect(validateNewsSearch({ club: "8f14e45f-ceea-4672-9a55-3f4b2b0c1e11" })).toEqual({
      club: "8f14e45f-ceea-4672-9a55-3f4b2b0c1e11",
    });
  });

  test("an unset filter is no key, so a clean /news stays clean", () => {
    expect(validateNewsSearch({})).toEqual({});
    expect(newsSearchFrom({ categorySlug: null, clubId: null })).toEqual({});
    expect(newsSearchFrom({ categorySlug: "mercato", clubId: null })).toEqual({
      category: "mercato",
    });
  });

  test("an id the router parsed as a number is read back as its text", () => {
    expect(validateNewsSearch({ club: 12 })).toEqual({ club: "12" });
  });

  test.each([
    [{ category: "" }],
    [{ category: "   " }],
    [{ category: "../admin" }],
    [{ category: "<script>" }],
    [{ category: "a".repeat(65) }],
    [{ category: ["a", "b"] }],
    [{ club: { id: "x" } }],
    [{ club: true }],
    [{ club: null }],
  ])("drops %j instead of failing the page", (search) => {
    expect(validateNewsSearch(search)).toEqual({});
  });

  test("survives a trip through the address bar", async () => {
    const root = createRootRoute();
    const news = createRoute({
      getParentRoute: () => root,
      path: "/news",
      validateSearch: validateNewsSearch,
    });
    const router = createRouter({
      routeTree: root.addChildren([news]),
      history: createMemoryHistory({ initialEntries: ["/news"] }),
    });
    await router.load();
    for (const filters of [
      { categorySlug: "transferts", clubId: null },
      { categorySlug: null, clubId: "wac" },
      { categorySlug: "mercato", clubId: "8f14e45f-ceea-4672-9a55-3f4b2b0c1e11" },
      { categorySlug: null, clubId: "2024" },
    ]) {
      const href = router.buildLocation({ to: "/news", search: newsSearchFrom(filters) }).href;
      const parsed = router.options.parseSearch?.(new URL(href, "https://botolago.com").search);
      expect(validateNewsSearch(parsed ?? {})).toEqual(newsSearchFrom(filters));
    }
  });

  test("the hub reads its filters from the URL, not from state an article unmounts", () => {
    const source = readFileSync(join(import.meta.dir, "../../routes/news.tsx"), "utf8");
    expect(source).toContain("validateSearch: validateNewsSearch");
    expect(source).not.toMatch(/useState<string \| null>\(null\)/);
    expect(source).toContain("replace: true");
    expect(source).toContain("resetScroll: false");
  });
});
