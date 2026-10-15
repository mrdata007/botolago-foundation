import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { routeTree } from "@/routeTree.gen";
import { withSiteHeaders } from "@/lib/response-headers";
import { SITEMAP_STATIC_PATHS } from "@/lib/sitemap";
import { redirectWhileNewsIsHidden } from "./news";
import { Route as SavedRoute } from "./profile.saved";

/**
 * Audit UX-001: the reading list has a route, and it is a private page.
 * (What the page does is covered by the view, collection and service tests.)
 */

const ROOT = join(import.meta.dir, "..", "..");
const read = (path: string) => readFileSync(join(ROOT, path), "utf8");

describe("the /profile/saved route", () => {
  test("is registered in the generated route tree, under Profile", () => {
    const router = createRouter({ routeTree, history: createMemoryHistory() });
    const saved = router.routesById["/profile/saved" as keyof typeof router.routesById];
    expect(saved).toBeDefined();
    expect(saved.fullPath).toBe("/profile/saved");
    expect(saved.parentRoute.id).toBe("/profile");
    expect(saved.options).toBe(SavedRoute.options);
  });

  test("is a personal page: noindex, not cacheable, disallowed to crawlers, not in the sitemap", () => {
    const head = (
      SavedRoute.options as { head: () => { meta: Array<Record<string, string>> } }
    ).head();
    expect(head.meta.find((tag) => tag.name === "robots")?.content).toBe("noindex, nofollow");
    const response = withSiteHeaders(
      new Response("", { headers: { "Cache-Control": "public, max-age=60" } }),
      "https://botolago.com/profile/saved",
      "6a12a6b",
    );
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(read("public/robots.txt")).toMatch(/^Disallow: \/profile$/m);
    expect(SITEMAP_STATIC_PATHS as readonly string[]).not.toContain("/profile/saved");
  });

  test("is gated by the same redirect as the News routes", () => {
    expect((SavedRoute.options as { beforeLoad: unknown }).beforeLoad).toBe(
      redirectWhileNewsIsHidden,
    );
  });
});

describe("copy and layout", () => {
  const KEYS = [
    "news.saved.empty_title",
    "news.saved.browse",
    "news.saved.signin_title",
    "news.saved.signin_body",
    "news.saved.error",
    "news.saved.unavailable",
    "news.saved.remove",
    "news.saved.more",
    "news.saved.more_error",
    "news.saved.remove_error",
    "news.saved.save_error",
    "news.saved.removed_announce",
    "news.saved.count_unknown",
  ] as const;

  test("every new string exists in French and Arabic, in the right script", () => {
    for (const key of KEYS) {
      expect(dictionaries.fr[key]?.trim()).toBeTruthy();
      expect(dictionaries.ar[key]?.trim()).toBeTruthy();
      expect(/[؀-ۿ]/.test(dictionaries.ar[key])).toBe(true);
      expect(dictionaries.fr[key]).not.toBe(dictionaries.ar[key]);
    }
  });

  test("the new files use logical (start/end) utilities only", () => {
    const physical =
      /(?:^|[\s"'`:])(?:-?(?:ml|mr|pl|pr)-|(?:left|right)-|text-(?:left|right)\b|rounded-(?:l|r|tl|tr|bl|br)-|border-(?:l|r)-)/;
    for (const file of [
      "src/components/news/SavedArticlesView.tsx",
      "src/components/news/useSavedCollection.ts",
      "src/routes/profile.saved.tsx",
    ]) {
      const classes = read(file)
        .split("\n")
        .filter((line) => !line.trim().startsWith("*") && !line.trim().startsWith("//"))
        .join("\n");
      expect({ file, match: physical.exec(classes)?.[0] ?? null }).toEqual({ file, match: null });
    }
  });
});
