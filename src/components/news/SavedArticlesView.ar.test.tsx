import { afterAll, describe, expect, mock, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries, type TranslationKey } from "@/i18n/dictionaries";
import type { SavedEntry } from "@/lib/saved-collection";
import type { Article } from "@/types/domain";

/**
 * Audit UX-001 in Arabic: the reading list's states with the Arabic copy. The
 * server always renders French, so `useI18n` answers in Arabic here, as
 * `fantasy-rules.ar.ssr.test.tsx` does it; the module is put back afterwards.
 */
const realI18n = { ...(await import("@/i18n/provider")) };
mock.module("@/i18n/provider", () => ({
  ...realI18n,
  useI18n: () => {
    const real = realI18n.useI18n();
    return {
      ...real,
      lang: "ar" as const,
      dir: "rtl" as const,
      t: (key: TranslationKey) => dictionaries.ar[key],
    };
  },
}));
afterAll(() => {
  mock.module("@/i18n/provider", () => realI18n);
});

const { SavedArticlesView } = await import("./SavedArticlesView");

const ar = dictionaries.ar;
const ID = "8b630afa-bf52-42f8-9ec0-f4d27fffe04b";
const GONE = "f00dfeed-0000-4000-8000-000000000001";

const story: Article = {
  id: ID,
  language: "ar",
  title: { fr: "عنوان المقال", ar: "عنوان المقال" },
  excerpt: { fr: "ملخص", ar: "ملخص" },
  category: "latest",
  clubIds: [],
  authorName: { fr: "BotolaGO", ar: "BotolaGO" },
  publishedAt: "2026-10-01T10:00:00.000Z",
  readMinutes: 3,
  heroGradient: "var(--ui-grad-action)",
};

async function render(props: Partial<Parameters<typeof SavedArticlesView>[0]> = {}) {
  const view = (
    <SavedArticlesView
      phase="ready"
      entries={[
        { kind: "article", article: story },
        { kind: "unavailable", id: GONE },
      ]}
      hasMore={false}
      loadingMore={false}
      moreFailed={false}
      onRetry={() => {}}
      onLoadMore={() => {}}
      onRemove={() => {}}
      {...props}
    />
  );
  const router = createRouter({
    routeTree: createRootRoute({ component: () => <AuthProvider>{view}</AuthProvider> }),
    history: createMemoryHistory({ initialEntries: ["/profile/saved"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <realI18n.I18nProvider>
        <RouterProvider router={router} />
      </realI18n.I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");

describe("the reading list in Arabic", () => {
  test("lists the story, the removable placeholder and the list's name", async () => {
    const html = await render();
    expect(text(html)).toContain("عنوان المقال");
    expect(text(html)).toContain(ar["news.saved.unavailable"]);
    expect(text(html)).toContain(ar["news.saved.remove"]);
    expect(html).toContain(`aria-label="${ar["news.section.saved"]}"`);
    expect(html).toContain(`aria-label="${ar["news.bookmark"]}"`);
  });

  test("the empty state, the error and the sign-in prompt use Arabic copy", async () => {
    const empty = await render({ entries: [] });
    expect(text(empty)).toContain(ar["news.saved.empty_title"]);
    expect(text(empty)).toContain(ar["news.saved.browse"]);

    const failed = await render({ phase: "error", entries: [] });
    expect(text(failed)).toContain(ar["news.saved.error"]);
    expect(text(failed)).toContain(ar["state.retry"]);

    const signedOut = await render({ phase: "signin", entries: [] });
    expect(text(signedOut)).toContain(ar["news.saved.signin_title"]);
    expect(text(signedOut)).toContain(ar["auth.prompt.login"]);
  });
});
