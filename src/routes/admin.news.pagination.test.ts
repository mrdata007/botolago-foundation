import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { EditorialStoryPageDto, EditorialStorySummaryDto } from "@/backend/news/contracts";
import { encodeEditorialCursor } from "@/backend/news/supabase-repository";
import {
  ADMIN_NEWS_EMPTY_FILTERS,
  ADMIN_NEWS_INITIAL_STATE,
  ADMIN_NEWS_PAGE_SIZE,
  adminNewsListReducer,
  type AdminNewsFilters,
  type AdminNewsListState,
} from "./admin.news";

/**
 * CMS list paging (P1).
 *
 * The route used to ask for `limit: 30` and throw `nextCursor` away, so an
 * editor could never reach article 31. These tests drive the *real* reducer
 * the route runs on -- not a copy of it, and not a grep of the file -- and
 * the last block ties that reducer to the route, so the logic passing here
 * cannot be dead code sitting next to an unpaginated screen.
 */

const source = readFileSync(join(import.meta.dir, "admin.news.tsx"), "utf8");

/** Asserts on a name rather than on 15 KB of source, so a failure here reads
 *  as "missing X" instead of dumping the whole route. */
function expectSource(needle: string, present = true) {
  expect(`${needle}: ${source.includes(needle)}`).toBe(`${needle}: ${present}`);
}

/** The DOM attribute, or the `testId` prop of an AdminSurfaces primitive,
 *  which puts the value straight onto `data-testid`. */
function renders(testId: string): boolean {
  return source.includes(`data-testid="${testId}"`) || source.includes(`testId="${testId}"`);
}

let seq = 0;
function story(overrides: Partial<EditorialStorySummaryDto> = {}): EditorialStorySummaryDto {
  seq += 1;
  const minute = String(seq).padStart(2, "0");
  return {
    id: `00000000-0000-4000-8000-0000000000${minute}`,
    storyId: `00000000-0000-4000-8000-0000000001${minute}`,
    language: "fr",
    slug: `article-${seq}`,
    title: `Article ${seq}`,
    status: "draft",
    visibility: "public",
    updatedAt: `2026-09-21T10:${minute}:00.000Z`,
    publishedAt: null,
    scheduledAt: null,
    authorName: null,
    publisherName: null,
    primaryCategory: null,
    ...overrides,
  } as EditorialStorySummaryDto;
}

/** A page as `api.editorial_list_stories` returns it: `nextCursor` is the
 *  keyset of the last row, and `null` on the final page. */
function page(items: readonly EditorialStorySummaryDto[], more: boolean): EditorialStoryPageDto {
  const last = items[items.length - 1];
  return {
    items: [...items],
    nextCursor: more && last ? { updatedAt: last.updatedAt, id: last.id } : null,
  };
}

function search(state: AdminNewsListState, filters: AdminNewsFilters, generation: number) {
  return adminNewsListReducer(state, { type: "search", generation, filters });
}

describe("admin news list paging", () => {
  test("the first render is a load, so the empty state cannot flash", () => {
    expect(ADMIN_NEWS_INITIAL_STATE.phase).toBe("loading");
    expect(ADMIN_NEWS_INITIAL_STATE.items).toEqual([]);
    expect(ADMIN_NEWS_INITIAL_STATE.cursor).toBeNull();
  });

  test("a page carries its nextCursor forward in the repository's own encoding", () => {
    const first = page([story(), story()], true);
    const state = adminNewsListReducer(
      search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1),
      { type: "page", generation: 1, append: false, page: first },
    );
    expect(state.phase).toBe("ready");
    expect(state.items).toHaveLength(2);
    // The cursor handed to the next request must be exactly what
    // `SupabaseNewsRepository.decodeEditorialCursor` round-trips.
    expect(state.cursor).toBe(encodeEditorialCursor(first.nextCursor));
    expect(state.cursor).not.toBeNull();
  });

  test("load more appends the next page, in order and without repeats", () => {
    const a = story();
    const b = story();
    const c = story();
    let state = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1);
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: page([a, b], true),
    });
    state = adminNewsListReducer(state, { type: "load-more" });
    expect(state.phase).toBe("loading-more");
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: true,
      page: page([c], false),
    });
    expect(state.items.map((item) => item.id)).toEqual([a.id, b.id, c.id]);
    expect(state.phase).toBe("ready");
    // No nextCursor means the list is complete: no further page to ask for.
    expect(state.cursor).toBeNull();
  });

  test("a row that moved between two requests is not shown twice", () => {
    const a = story();
    const b = story();
    let state = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1);
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: page([a, b], true),
    });
    state = adminNewsListReducer(state, { type: "load-more" });
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: true,
      page: page([b, story()], false),
    });
    const ids = state.items.map((item) => item.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.filter((id) => id === b.id)).toHaveLength(1);
  });

  test("load more is refused when there is no cursor or a request is in flight", () => {
    const paged = adminNewsListReducer(
      search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1),
      { type: "page", generation: 1, append: false, page: page([story()], false) },
    );
    // Final page: the button is not offered, and the action is inert anyway.
    expect(paged.cursor).toBeNull();
    expect(adminNewsListReducer(paged, { type: "load-more" })).toBe(paged);
    // Still loading the first page: no double fetch.
    const loading = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 2);
    expect(adminNewsListReducer(loading, { type: "load-more" })).toBe(loading);
  });

  test("re-filtering resets paging instead of appending to the old list", () => {
    let state = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1);
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: page([story(), story()], true),
    });
    const published: AdminNewsFilters = { language: "ar", status: "published", query: "botola" };
    state = search(state, published, 2);
    expect(state.items).toEqual([]);
    expect(state.cursor).toBeNull();
    expect(state.phase).toBe("loading");
    expect(state.filters).toEqual(published);
  });

  test("a late answer from a superseded search never lands", () => {
    let state = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1);
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: page([story(), story()], true),
    });
    // The editor re-filters while a "load more" is still in flight...
    state = adminNewsListReducer(state, { type: "load-more" });
    const refiltered = search(state, { language: "fr", status: "draft", query: "" }, 2);
    // ...and the overtaken page must not be appended to the new, empty list.
    const late = adminNewsListReducer(refiltered, {
      type: "page",
      generation: 1,
      append: true,
      page: page([story()], true),
    });
    expect(late).toBe(refiltered);
    expect(late.items).toEqual([]);
    expect(late.cursor).toBeNull();
    // Nor may its failure surface as an error on the new search.
    expect(
      adminNewsListReducer(refiltered, { type: "failure", generation: 1, message: "stale" }),
    ).toBe(refiltered);
  });

  test("a failed page keeps the list and the cursor, so it can be retried", () => {
    let state = search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1);
    const first = page([story(), story()], true);
    state = adminNewsListReducer(state, {
      type: "page",
      generation: 1,
      append: false,
      page: first,
    });
    state = adminNewsListReducer(state, { type: "load-more" });
    state = adminNewsListReducer(state, {
      type: "failure",
      generation: 1,
      message: "Chargement des articles impossible: data_unavailable",
    });
    expect(state.phase).toBe("error");
    expect(state.error).toContain("data_unavailable");
    expect(state.items).toHaveLength(2);
    expect(state.cursor).toBe(encodeEditorialCursor(first.nextCursor));
  });

  test("an error is never dressed up as an empty list", () => {
    const failed = adminNewsListReducer(
      search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1),
      { type: "failure", generation: 1, message: "boom" },
    );
    // The empty state renders on `phase === "ready" && items.length === 0`,
    // which neither a failure nor a load can reach.
    expect(failed.items).toEqual([]);
    expect(failed.phase).toBe("error");
    expect(failed.phase === "ready").toBe(false);
  });

  test("an empty answer is an empty list, not a permanent spinner", () => {
    const empty = adminNewsListReducer(
      search(ADMIN_NEWS_INITIAL_STATE, ADMIN_NEWS_EMPTY_FILTERS, 1),
      { type: "page", generation: 1, append: false, page: page([], false) },
    );
    expect(empty.phase).toBe("ready");
    expect(empty.items).toEqual([]);
    expect(empty.cursor).toBeNull();
    expect(empty.error).toBeNull();
  });
});

describe("the CMS list route runs on that reducer", () => {
  // Without this block the reducer above could be correct and unused, which
  // is precisely the failure mode this task exists to remove.
  test("the route drives its list with adminNewsListReducer", () => {
    expectSource("useReducer(adminNewsListReducer, ADMIN_NEWS_INITIAL_STATE)");
  });

  test("the route passes a cursor to listStories and pages under the committed filters", () => {
    const call = source.indexOf("repository.listStories(");
    expect(call).toBeGreaterThan(-1);
    const input = source.slice(call, call + 500);
    expect(input).toContain("cursor,");
    expect(input).toContain("limit: ADMIN_NEWS_PAGE_SIZE");
    // "load more" pages under `state.filters` -- the snapshot that produced
    // the list -- never under the live form inputs.
    expect(/fetchPage\(\s*state\.filters,\s*state\.cursor,/.test(source)).toBe(true);
    // The RPC clamps `p_limit` to [1, 50]; asking for more silently truncates.
    expect(ADMIN_NEWS_PAGE_SIZE).toBeGreaterThan(0);
    expect(ADMIN_NEWS_PAGE_SIZE).toBeLessThanOrEqual(50);
  });

  test("the route offers a load-more control and an honest set of states", () => {
    for (const testId of ["admin-news-load-more", "admin-news-loading", "admin-news-end"]) {
      expect(`${testId}: ${renders(testId)}`).toBe(`${testId}: true`);
    }
    // The empty state is gated on a page having actually come back.
    expectSource('state.phase === "ready" && state.items.length === 0');
    // ...and the spinner is a shared primitive, not a forked copy.
    expectSource("<AdminSkeletonList");
  });

  test("every existing browser hook on this screen survives", () => {
    for (const testId of [
      "admin-news-list",
      "admin-news-create",
      "admin-news-filter-language",
      "admin-news-filter-status",
      "admin-news-filter-query",
      "admin-news-filter-submit",
      "admin-news-result-count",
      "admin-news-items",
      "admin-news-item",
      "admin-news-item-slug",
      "admin-news-empty",
    ]) {
      expect(`${testId}: ${renders(testId)}`).toBe(`${testId}: true`);
    }
  });

  test("the screen stays RTL-safe: logical utilities, LTR data wrapped", () => {
    // No physical direction utilities anywhere on this screen, and any
    // letter-spacing stays behind an `ltr:` prefix (Arabic letters join).
    const physical = source.match(/className=("|\{`)[^"`]*\b(ml|mr|pl|pr|left|right)-[\dp]/g);
    expect(physical ?? []).toEqual([]);
    const spacing = source.match(/(?<!ltr:)\btracking-(wide|tight|wider|tighter)\b/g);
    expect(spacing ?? []).toEqual([]);
    // The result count carries a "+" once more pages exist -- an LTR run, so
    // it goes through AdminDatum like every other datum on this screen.
    expect(/AdminDatum[\s\S]{0,160}state\.items\.length/.test(source)).toBe(true);
    // Both new labels exist in French and in Arabic.
    for (const label of ["Charger plus d’articles", "تحميل المزيد من المقالات", "Fin de la liste."])
      expectSource(label);
    expectSource("نهاية القائمة.");
  });
});
