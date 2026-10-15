import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";

import { playersSearchWith, validatePlayersSearch } from "./players-search";

/**
 * Audit UX-006: the player list's search, chips, price cap, sort and page were
 * page state, and a player page replaces the list, so Retour came back to
 * page 1 of the whole pool. They are now the URL's.
 */
describe("the player list's state in the URL", () => {
  test("reads every control", () => {
    expect(
      validatePlayersSearch({
        q: "hakimi",
        pos: "DEF",
        club: "wac",
        max: "8",
        sort: "price",
        dir: "asc",
        page: 3,
      }),
    ).toEqual({
      q: "hakimi",
      pos: "DEF",
      club: "wac",
      max: "8",
      sort: "price",
      dir: "asc",
      page: 3,
    });
  });

  test("a plain list has no search: defaults never travel", () => {
    expect(validatePlayersSearch({})).toEqual({});
    expect(
      validatePlayersSearch({ sort: "points", dir: "desc", page: 1, max: 0, q: "  ", pos: "" }),
    ).toEqual({});
  });

  test("numbers the router parsed are read back as the text the page uses", () => {
    expect(validatePlayersSearch({ max: 8, page: "2", club: 12, q: 2024 })).toEqual({
      max: "8",
      page: 2,
      club: "12",
      q: "2024",
    });
  });

  test.each([
    [{ pos: "STRIKER" }],
    [{ pos: ["GK"] }],
    [{ sort: "name" }],
    [{ dir: "up" }],
    [{ page: -4 }],
    [{ page: 2.5 }],
    [{ page: "abc" }],
    [{ max: "-3" }],
    [{ max: "1e9" }],
    [{ max: 8.5 }],
    [{ club: "../x" }],
    [{ club: { id: 1 } }],
    [{ q: ["a"] }],
  ])("drops %j instead of failing the page", (search) => {
    expect(validatePlayersSearch(search)).toEqual({});
  });

  test("bounds the text and the page it will hold", () => {
    expect(validatePlayersSearch({ q: "a".repeat(500) }).q).toHaveLength(80);
    expect(validatePlayersSearch({ page: 9_999_999 }).page).toBe(999);
  });

  test("keeps `compare`, which only the player page's link sets", () => {
    expect(validatePlayersSearch({ compare: "p1", pos: "GK" })).toEqual({
      compare: "p1",
      pos: "GK",
    });
    expect(validatePlayersSearch({ compare: "" })).toEqual({});
  });
});

describe("changing the list", () => {
  test("a filter change puts the reader back on page 1, everything else stays", () => {
    const before = { pos: "DEF", club: "wac", max: "8", sort: "price", dir: "asc", page: 3 };
    expect(playersSearchWith(before, { page: undefined, pos: "MID" })).toEqual({
      pos: "MID",
      club: "wac",
      max: "8",
      sort: "price",
      dir: "asc",
    });
  });

  test("a page change keeps the filters", () => {
    expect(playersSearchWith({ pos: "DEF", page: 2 }, { page: 3 })).toEqual({
      pos: "DEF",
      page: 3,
    });
    expect(playersSearchWith({ pos: "DEF", page: 2 }, { page: 1 })).toEqual({ pos: "DEF" });
  });

  test("clearing a control removes its key", () => {
    expect(playersSearchWith({ pos: "DEF", club: "wac" }, { pos: undefined })).toEqual({
      club: "wac",
    });
  });

  test("`compare` is read once: a filter change does not bring it back", () => {
    expect(playersSearchWith({ compare: "p1", pos: "GK" }, {})).toEqual({ pos: "GK" });
  });

  test("an unsafe value in the old search is not carried forward", () => {
    expect(playersSearchWith({ pos: "STRIKER", club: "wac" }, {})).toEqual({ club: "wac" });
  });
});

describe("the list survives a trip through the address bar", () => {
  test("every control round-trips through the router's own stringify and parse", async () => {
    const root = createRootRoute();
    const players = createRoute({
      getParentRoute: () => root,
      path: "/fantasy/players",
      validateSearch: validatePlayersSearch,
    });
    const router = createRouter({
      routeTree: root.addChildren([players]),
      history: createMemoryHistory({ initialEntries: ["/fantasy/players"] }),
    });
    await router.load();
    for (const search of [
      { pos: "DEF" as const, club: "wac", max: "8", sort: "price" as const, page: 2 },
      { q: "عبد الله", dir: "asc" as const },
      { q: "o'neil & sons?", pos: "GK" as const },
      { club: "8f14e45f-ceea-4672-9a55-3f4b2b0c1e11", max: "12", page: 14 },
      { q: "2024", club: "12" },
    ]) {
      const href = router.buildLocation({ to: "/fantasy/players", search }).href;
      const parsed = router.options.parseSearch?.(new URL(href, "https://botolago.com").search);
      expect(validatePlayersSearch(parsed ?? {})).toEqual(search);
    }
  });

  test("the list reads its controls from the URL, not from state a player page unmounts", () => {
    const source = readFileSync(join(import.meta.dir, "../../routes/fantasy.players.tsx"), "utf8");
    expect(source).toContain("validatePlayersSearch(search)");
    expect(source).not.toMatch(/useState<SortKey>/);
    expect(source).not.toMatch(/const \[page, setPage\]/);
    expect(source).not.toMatch(/const \[clubId, setClubId\]/);
    // The "Comparer" link must no longer wipe the filters when it is consumed.
    expect(source).not.toMatch(/search: \{\}, replace: true/);
    expect(source).toContain("resetScroll: false");
  });
});
