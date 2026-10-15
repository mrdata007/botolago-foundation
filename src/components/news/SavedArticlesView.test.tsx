import { describe, expect, test } from "bun:test";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createMemoryHistory,
  createRootRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactElement } from "react";
import { renderToString } from "react-dom/server";

import { AuthProvider } from "@/auth/AuthProvider";
import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import type { SavedEntry } from "@/lib/saved-collection";
import type { Article } from "@/types/domain";
import { SavedArticlesView, type SavedArticlesPhase } from "./SavedArticlesView";

/**
 * Audit UX-001: the reading list as a reader sees each of its states. Rendered
 * on the server inside the app's providers, as the other screens' tests do.
 */

const fr = dictionaries.fr;

function article(id: string, title: string): Article {
  return {
    id,
    language: "fr",
    title: { fr: title, ar: title },
    excerpt: { fr: "Un résumé court.", ar: "Un résumé court." },
    category: "latest",
    clubIds: [],
    authorName: { fr: "BotolaGO", ar: "BotolaGO" },
    publishedAt: "2026-10-01T10:00:00.000Z",
    readMinutes: 3,
    heroGradient: "var(--ui-grad-action)",
  };
}

const ID_A = "8b630afa-bf52-42f8-9ec0-f4d27fffe04b";
const ID_B = "c1d7a0aa-2b1e-4a53-9a6e-0a8f7a3d6b11";
const ID_GONE = "f00dfeed-0000-4000-8000-000000000001";

const entries: SavedEntry[] = [
  { kind: "article", article: article(ID_A, "Le Raja s'impose au bout du suspense") },
  { kind: "unavailable", id: ID_GONE },
  { kind: "article", article: article(ID_B, "Mercato : le Wydad cible un attaquant") },
];

interface Props {
  phase: SavedArticlesPhase;
  entries: readonly SavedEntry[];
  hasMore: boolean;
  loadingMore: boolean;
  moreFailed: boolean;
}

async function render(overrides: Partial<Props> = {}): Promise<string> {
  const props: Props = {
    phase: "ready",
    entries,
    hasMore: false,
    loadingMore: false,
    moreFailed: false,
    ...overrides,
  };
  const view = (
    <SavedArticlesView {...props} onRetry={() => {}} onLoadMore={() => {}} onRemove={() => {}} />
  );
  return renderWith(view);
}

async function renderWith(view: ReactElement): Promise<string> {
  const router = createRouter({
    routeTree: createRootRoute({
      component: () => <AuthProvider>{view}</AuthProvider>,
    }),
    history: createMemoryHistory({ initialEntries: ["/profile/saved"] }),
  });
  await router.load();
  return renderToString(
    <QueryClientProvider client={new QueryClient()}>
      <I18nProvider>
        <RouterProvider router={router} />
      </I18nProvider>
    </QueryClientProvider>,
  ).replace(/<!-- -->/g, "");
}

const decode = (html: string) =>
  html
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, "&");
const text = (html: string) => decode(html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " "));

describe("the reading list", () => {
  test("lists each saved story as a card that opens the article", async () => {
    const html = await render();
    expect(text(html)).toContain("Le Raja s'impose au bout du suspense");
    expect(text(html)).toContain("Mercato : le Wydad cible un attaquant");
    expect(html).toContain(`href="/news/${ID_A}"`);
    expect(html).toContain(`href="/news/${ID_B}"`);
    // Each card keeps its bookmark, which is how a story is unsaved in place.
    expect(html).toContain(`aria-label="${fr["news.bookmark"]}"`);
  });

  test("names the list, so a screen reader can find it", async () => {
    const html = await render();
    expect(html).toContain(`<ul class="grid gap-2.5" aria-label="${fr["news.section.saved"]}"`);
  });

  test("keeps a story that is gone as a clear row with a remove button", async () => {
    const html = await render();
    expect(text(html)).toContain(fr["news.saved.unavailable"]);
    const remove = html.match(/<button[^>]*>[^<]*Retirer de la liste[^<]*<\/button>/);
    expect(remove).not.toBeNull();
    // The placeholder sits between its neighbours, in the order saved.
    const order = [ID_A, "saved-unavailable", ID_B].map((needle) => html.indexOf(needle));
    expect(order.every((index) => index > -1)).toBe(true);
    expect([...order].sort((a, b) => a - b)).toEqual(order);
  });

  test("a list of only gone stories still shows them, removable, not the empty state", async () => {
    const html = await render({ entries: [{ kind: "unavailable", id: ID_GONE }] });
    expect(text(html)).toContain(fr["news.saved.unavailable"]);
    expect(text(html)).not.toContain(fr["news.saved.empty_title"]);
  });

  test("says so when nothing is saved, and leads on to the news", async () => {
    const html = await render({ entries: [] });
    expect(text(html)).toContain(fr["news.saved.empty_title"]);
    expect(text(html)).toContain(fr["news.saved.empty"]);
    expect(html).toContain('href="/news"');
    expect(text(html)).toContain(fr["news.saved.browse"]);
    expect(html).not.toContain('role="alert"');
  });

  test("a failed read is an error with a retry, never an empty list", async () => {
    const html = await render({ phase: "error", entries: [] });
    expect(html).toContain('role="alert"');
    expect(text(html)).toContain(fr["news.saved.error"]);
    expect(text(html)).toContain(fr["state.retry"]);
    expect(text(html)).not.toContain(fr["news.saved.empty_title"]);
    expect(text(html)).not.toContain(fr["news.saved.empty"]);
  });

  test("while loading it shows placeholders, not the empty state", async () => {
    const html = await render({ phase: "loading", entries: [] });
    expect(html).toContain('role="status"');
    expect(text(html)).not.toContain(fr["news.saved.empty_title"]);
  });

  test("a reader with no account is asked to sign in, and has no list shown", async () => {
    const html = await render({ phase: "signin", entries });
    expect(text(html)).toContain(fr["news.saved.signin_title"]);
    expect(html).toContain('href="/auth/login?next=%2Fprofile%2Fsaved"');
    expect(text(html)).not.toContain("Le Raja s'impose");
    expect(text(html)).not.toContain(fr["news.saved.empty_title"]);
  });

  test("offers the next page when there is one, and a retry when it failed", async () => {
    const more = await render({ hasMore: true });
    expect(text(more)).toContain(fr["news.saved.more"]);
    const failed = await render({ hasMore: true, moreFailed: true });
    expect(failed).toContain('role="alert"');
    expect(text(failed)).toContain(fr["news.saved.more_error"]);
    expect(text(failed)).toContain(fr["state.retry"]);
    // The rows already loaded stay.
    expect(text(failed)).toContain("Le Raja s'impose au bout du suspense");
  });

  test("every row's controls are 44px targets", async () => {
    const html = await render();
    // The remove button is the kit's `sm` pill (44px floor on both axes).
    const button = html.match(/<button[^>]*>[^<]*Retirer de la liste/)?.[0] ?? "";
    expect(button).toContain("min-h-[var(--ui-tap-min)]");
    expect(button).toContain("min-w-[var(--ui-tap-min)]");
  });
});
