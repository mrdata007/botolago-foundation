import { describe, expect, test } from "bun:test";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { I18nProvider } from "@/i18n/provider";
import { ArchivePagination } from "./ArchivePagination";
import { validateNewsArchiveSearch, type NewsArchivePlan } from "./news-archive";

/**
 * The archive's page links rendered the way the server renders them: plain
 * `<a href>` with the page in the query, so a crawler that runs no script
 * follows them (SEO brief 2026-10-27, Bug 1).
 */
const cursor = (n: number) => ({
  publishedAt: "2026-10-01T00:00:00.000Z",
  id: `00000000-0000-4000-8000-${n.toString(16).padStart(12, "0")}`,
});
/** `pages` pages: one cursor opens each page after the first. */
const planOf = (pages: number): NewsArchivePlan => ({
  total: pages * 50,
  cursors: Array.from({ length: pages - 1 }, (_, index) => cursor(index + 1)),
});

async function render(page: number, plan: NewsArchivePlan): Promise<string> {
  const root = createRootRoute();
  const archive = createRoute({
    getParentRoute: () => root,
    path: "/news/archive",
    validateSearch: validateNewsArchiveSearch,
    component: () => <ArchivePagination page={page} plan={plan} />,
  });
  const router = createRouter({
    routeTree: root.addChildren([archive]),
    history: createMemoryHistory({ initialEntries: ["/news/archive"] }),
  });
  await router.load();
  return renderToString(
    <I18nProvider>
      <RouterProvider router={router} />
    </I18nProvider>,
  ).replace(/<!-- -->/g, "");
}

const hrefs = (html: string) =>
  [...html.matchAll(/<a [^>]*href="([^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, "&"));

describe("the archive's pagination in the server's HTML", () => {
  test("a middle page links its neighbours, the ends and the tenth pages as <a href>", async () => {
    const html = await render(25, planOf(31));
    const links = hrefs(html);
    expect(links).toContain("/news/archive?page=24");
    expect(links).toContain("/news/archive?page=26");
    expect(links).toContain("/news/archive?page=30");
    expect(links).toContain("/news/archive?page=10");
    // The first page is the bare address, never ?page=1.
    expect(links).toContain("/news/archive");
    expect(links.some((href) => href.endsWith("page=1"))).toBe(false);
    expect(html).toContain('rel="prev"');
    expect(html).toContain('rel="next"');
    expect(html).toContain('aria-current="page"');
  });

  test("the first page has no previous link, the last none to the next", async () => {
    const first = await render(1, planOf(5));
    expect(first).not.toContain('rel="prev"');
    expect(first).toContain('rel="next"');
    const last = await render(5, planOf(5));
    expect(last).toContain('rel="prev"');
    expect(last).not.toContain('rel="next"');
  });

  test("a single page needs no navigation", async () => {
    expect(await render(1, planOf(1))).not.toContain("<nav");
  });
});
