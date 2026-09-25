import { afterEach, describe, expect, test } from "bun:test";
import { dehydrate, hydrate, QueryClient } from "@tanstack/react-query";

import {
  prefetchFirstPageForSsr,
  prefetchForSsr,
  SSR_DEHYDRATE_OPTIONS,
  SSR_PREFETCH_BUDGET_MS,
} from "./ssr-prefetch";

const clients: QueryClient[] = [];
function client() {
  const created = new QueryClient();
  clients.push(created);
  return created;
}

// Other test files leave a `window` shim on the shared global; each test here
// says which side it is on, and the shim is put back as it was.
const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const originalWindow = globals.window;
function onServer() {
  delete globals.window;
}
function inBrowser() {
  globals.window = {};
}
afterEach(() => {
  for (const created of clients.splice(0)) created.clear();
  if (hadWindow) globals.window = originalWindow;
  else delete globals.window;
});

describe("server-rendered page data", () => {
  test("on the server the page's queries are loaded and handed to the browser", async () => {
    onServer();
    const server = client();
    await prefetchForSsr(server, [
      { queryKey: ["football", "club-directory", "fr"], queryFn: async () => ({ clubs: ["WAC"] }) },
    ]);
    // A query the page loaded for itself (a detail page's loader data) is not
    // handed over twice.
    await server.prefetchQuery({ queryKey: ["football", "club", "x"], queryFn: async () => 1 });

    const handover = dehydrate(server, SSR_DEHYDRATE_OPTIONS);
    expect(handover.queries.map((query) => query.queryKey)).toEqual([
      ["football", "club-directory", "fr"],
    ]);

    const browser = client();
    hydrate(browser, JSON.parse(JSON.stringify(handover)));
    expect(browser.getQueryData(["football", "club-directory", "fr"])).toEqual({ clubs: ["WAC"] });
  });

  test("a failed read is not handed over, so the browser loads it itself", async () => {
    onServer();
    const server = client();
    await prefetchForSsr(server, [
      {
        queryKey: ["news", "home-modules-v2", "fr"],
        queryFn: async () => {
          throw new Error("statement timeout");
        },
      },
    ]);
    expect(dehydrate(server, SSR_DEHYDRATE_OPTIONS).queries).toEqual([]);
  });

  // 2026-09-25: with production's database overloaded, reads neither answered
  // nor failed for many seconds, and the server render waited for all of them.
  test("a read slower than the budget does not hold the page, and is not handed over", async () => {
    onServer();
    const server = client();
    const started = Date.now();
    await prefetchForSsr(
      server,
      [{ queryKey: ["football", "seasons", "fr"], queryFn: () => new Promise(() => {}) }],
      20,
    );
    await prefetchFirstPageForSsr(
      server,
      {
        queryKey: ["news", "feed-v2", "fr", null, null],
        queryFn: () => new Promise(() => {}),
        initialPageParam: null,
        getNextPageParam: () => null,
      },
      20,
    );
    expect(Date.now() - started).toBeLessThan(1_000);
    expect(dehydrate(server, SSR_DEHYDRATE_OPTIONS).queries).toEqual([]);
  });

  test("the budget is a few seconds, enough for a healthy database", () => {
    expect(SSR_PREFETCH_BUDGET_MS).toBeGreaterThanOrEqual(1_000);
    expect(SSR_PREFETCH_BUDGET_MS).toBeLessThanOrEqual(5_000);
  });

  test("in the browser nothing is prefetched, so navigation is not held up", async () => {
    inBrowser();
    const browser = client();
    let calls = 0;
    await prefetchForSsr(browser, [
      { queryKey: ["football", "seasons", "fr"], queryFn: async () => ++calls },
    ]);
    await prefetchFirstPageForSsr(browser, {
      queryKey: ["news", "feed-v2", "fr", null, null],
      queryFn: async () => ++calls,
      initialPageParam: null,
      getNextPageParam: () => null,
    });
    expect(calls).toBe(0);
  });

  test("the news feed's first page is handed over in the infinite-list shape", async () => {
    onServer();
    const server = client();
    await prefetchFirstPageForSsr(server, {
      queryKey: ["news", "feed-v2", "fr", null, null],
      queryFn: async ({ pageParam }: { pageParam: string | null }) => ({
        items: [pageParam ?? "first"],
        nextCursor: null,
      }),
      initialPageParam: null as string | null,
      getNextPageParam: () => null,
    });
    const [query] = dehydrate(server, SSR_DEHYDRATE_OPTIONS).queries;
    expect(query?.state.data).toEqual({
      pages: [{ items: ["first"], nextCursor: null }],
      pageParams: [null],
    });
  });
});
