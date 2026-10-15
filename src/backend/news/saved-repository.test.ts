import { afterAll, describe, expect, mock, test } from "bun:test";

/**
 * Audit UX-001, end to end through the real repository: `getSaved` and
 * `collectSavedIds` run against a stand-in for the `news_saved_articles`
 * function that behaves like the real one -- 50 rows a page at most, newest
 * save first, Postgres microsecond timestamps, and a `{ createdAt, articleId }`
 * cursor the caller must hand back as BOTH `p_after_created_at` and
 * `p_after_article_id` (one without the other is refused). The responses are
 * parsed by the repository's own schema, so a cursor shape it does not accept
 * fails here as it did for readers with more than 50 saves.
 */

const TOTAL = 120;
const context = { actorId: null, requestId: "saved-repository-test" } as const;

interface Row {
  id: string;
  createdAt: string;
}

// Pairs share a save time (the tie-break on the article id matters) and carry
// microseconds, as `timestamptz` serialises.
const rows: Row[] = Array.from({ length: TOTAL }, (_, i) => ({
  id: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
  createdAt: `2026-10-02T10:${String(59 - (Math.floor(i / 2) % 60)).padStart(2, "0")}:00.123456+00:00`,
})).sort((a, b) =>
  a.createdAt === b.createdAt ? b.id.localeCompare(a.id) : b.createdAt.localeCompare(a.createdAt),
);

function cardFor(row: Row) {
  return {
    id: row.id,
    storyId: row.id,
    language: "fr",
    slug: "story",
    title: "Titre",
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
    savedAt: row.createdAt,
  };
}

interface RpcArgs {
  p_limit: number;
  p_after_created_at?: string;
  p_after_article_id?: string;
}

const calls: Array<{ name: string; args: RpcArgs }> = [];

async function rpc(name: string, args: RpcArgs) {
  calls.push({ name, args: { ...args } });
  const after = args.p_after_created_at;
  const afterId = args.p_after_article_id;
  if ((after == null) !== (afterId == null)) {
    return { data: null, error: { code: "22023", message: "news_invalid_cursor", details: "" } };
  }
  const size = Math.min(Math.max(args.p_limit, 1), 50);
  const selected = rows
    .filter(
      (row) =>
        after == null ||
        row.createdAt < after ||
        (row.createdAt === after && row.id < (afterId as string)),
    )
    .slice(0, size + 1);
  const page = selected.slice(0, size);
  const last = page[page.length - 1];
  return {
    data: {
      items: page.map(cardFor),
      nextCursor:
        selected.length > size && last ? { createdAt: last.createdAt, articleId: last.id } : null,
    },
    error: null,
  };
}

// The Supabase client needs credentials this test does not have, so the News
// API handle is replaced for this file and put back afterwards. Everything
// above the handle (the repository, its schema parsing, the service) is real.
const realV2Client = { ...(await import("@/integrations/supabase/v2-client")) };
mock.module("@/integrations/supabase/v2-client", () => ({
  ...realV2Client,
  getNewsApi: () => ({ rpc }),
}));
afterAll(() => {
  mock.module("@/integrations/supabase/v2-client", () => realV2Client);
});

const { SupabaseNewsRepository } = await import("./supabase-repository");
const { collectSavedIds, getSavedEntriesPage, SAVED_PAGE_SIZE } = await import("@/services/news");

describe("the saved list through the real repository", () => {
  test("a reader with 120 saves gets all 120, once each, in three requests", async () => {
    calls.length = 0;
    const { ids, complete } = await collectSavedIds(new SupabaseNewsRepository(), context);
    expect(complete).toBe(true);
    expect(ids).toEqual(rows.map((row) => row.id));
    expect(new Set(ids).size).toBe(TOTAL);
    expect(calls.map((call) => call.name)).toEqual(Array(3).fill("news_saved_articles"));
    expect(calls.every((call) => call.args.p_limit === SAVED_PAGE_SIZE)).toBe(true);
  });

  test("each next request hands back the previous page's last row as a pair", async () => {
    calls.length = 0;
    await collectSavedIds(new SupabaseNewsRepository(), context);
    expect(calls[0]!.args.p_after_created_at).toBeUndefined();
    expect(calls[0]!.args.p_after_article_id).toBeUndefined();
    const lastOfFirstPage = rows[49]!;
    expect(calls[1]!.args.p_after_created_at).toBe(lastOfFirstPage.createdAt);
    expect(calls[1]!.args.p_after_article_id).toBe(lastOfFirstPage.id);
    const lastOfSecondPage = rows[99]!;
    expect(calls[2]!.args.p_after_created_at).toBe(lastOfSecondPage.createdAt);
    expect(calls[2]!.args.p_after_article_id).toBe(lastOfSecondPage.id);
  });

  test("the collection's pages parse and chain the same way", async () => {
    const repository = new SupabaseNewsRepository();
    const first = await getSavedEntriesPage(repository, null, context);
    expect(first.entries).toHaveLength(50);
    expect(first.nextCursor).not.toBeNull();
    const second = await getSavedEntriesPage(repository, first.nextCursor, context);
    const third = await getSavedEntriesPage(repository, second.nextCursor, context);
    expect(second.entries).toHaveLength(50);
    expect(third.entries).toHaveLength(20);
    expect(third.nextCursor).toBeNull();
  });

  test("a malformed cursor is refused before any request", async () => {
    calls.length = 0;
    await expect(
      new SupabaseNewsRepository().getSaved(50, context, "not-a-cursor"),
    ).rejects.toMatchObject({ code: "invalid_cursor" });
    expect(calls).toHaveLength(0);
  });
});
