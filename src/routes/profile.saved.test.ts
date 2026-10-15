import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { createMemoryHistory, createRouter } from "@tanstack/react-router";

import { dictionaries } from "@/i18n/dictionaries";
import { routeTree } from "@/routeTree.gen";
import { withSiteHeaders } from "@/lib/response-headers";
import { Route as SavedRoute } from "./profile.saved";

/**
 * Audit UX-001: the reading list has a route, the two screens a reader looks
 * for it on lead there, and it is a private page.
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
    expect(read("src/routeTree.gen.ts")).toContain("'/profile/saved'");
  });

  test("Profile renders the child instead of itself, as it does for /profile/security", () => {
    const profile = read("src/routes/profile.tsx");
    expect(profile).toContain('match.routeId === "/profile/saved"');
  });

  test("is a personal page: noindex, not cacheable, disallowed to crawlers", () => {
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
  });

  test("is not in the sitemap's public pages", () => {
    expect(read("src/lib/sitemap.ts")).not.toContain("/profile/saved");
  });

  test("goes back to Profile while News is hidden", () => {
    const source = read("src/routes/profile.saved.tsx");
    expect(source).toContain('if (!NEWS_ENABLED) throw redirect({ to: "/profile"');
  });
});

describe("the ways in", () => {
  test("the Profile count is a link to the list", () => {
    const profile = read("src/routes/profile.tsx");
    expect(profile).toMatch(/<RowLink\s+to="\/profile\/saved"[\s\S]*?profile\.saved_articles/);
  });

  test("the News screen links to it with a named, 44px control", () => {
    const news = read("src/routes/news.tsx");
    expect(news).toContain(
      '<UiIconLinkButton to="/profile/saved" aria-label={t("news.section.saved")}>',
    );
  });

  test("sign-in from the list comes back to it", () => {
    expect(read("src/components/news/SavedArticlesView.tsx")).toContain(
      'search={{ next: "/profile/saved" }}',
    );
  });
});

describe("the collection's wiring", () => {
  const hook = read("src/components/news/useSavedCollection.ts");

  test("its cache entry is keyed by the signed-in account, never shared", () => {
    expect(hook).toContain("savedCollectionQueryKey(accountId)");
    expect(hook).toContain("const accountId = user?.id ?? null;");
  });

  test("unsaving a row goes through the same toggle as every bookmark and filters at once", () => {
    expect(hook).toContain("visibleSavedEntries(fetched, saved.ids, saved.idsKnown)");
    expect(hook).toContain("remove: (id: string) => saved.toggle(id)");
  });

  test("a bookmark toggled anywhere refetches the collection", () => {
    expect(read("src/lib/saved-articles.ts")).toContain(
      "invalidateQueries({ queryKey: savedCollectionQueryKey(user?.id ?? null) })",
    );
  });

  test("a failed first read is the error phase, not an empty list", () => {
    expect(hook).toContain('query.isError && !query.data && !query.isFetching) phase = "error"');
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
