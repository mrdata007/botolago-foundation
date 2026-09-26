import { describe, expect, it } from "bun:test";

import {
  isPlayerId,
  isPublicAnswer,
  parseWeek,
  pepitesPageHeaders,
  pointerCache,
  rankingFiltersFromSearch,
  rankingSearchFromFilters,
  validatePlayerSearch,
  validateRankingSearch,
  validateRevealSearch,
} from "./pepites-route";

describe("pepitesPageHeaders (architecture §7)", () => {
  it("lets a shared cache keep only what everyone may see", () => {
    expect(pepitesPageHeaders({ cache: "current" })).toEqual({
      "Cache-Control": "public, max-age=0, s-maxage=10",
    });
    expect(pepitesPageHeaders({ cache: "edition" })).toEqual({
      "Cache-Control": "public, max-age=0, s-maxage=300",
    });
  });

  it("keeps anything else out of shared caches: off, staff-only, nothing loaded", () => {
    expect(pepitesPageHeaders({ cache: "private" })).toEqual({
      "Cache-Control": "private, no-store",
    });
    expect(pepitesPageHeaders(null)).toEqual({ "Cache-Control": "private, no-store" });
    expect(pepitesPageHeaders(undefined)).toEqual({ "Cache-Control": "private, no-store" });
  });

  it("answers a failed read with the 503 mark and no-store", () => {
    const headers = pepitesPageHeaders({ unavailable: true });
    expect(headers["Cache-Control"]).toBe("no-store");
    expect(headers["Retry-After"]).toBeDefined();
  });
});

describe("what counts as public", () => {
  it("is an open answer that is not a staff preview", () => {
    expect(isPublicAnswer({ available: true, preview: false })).toBe(true);
    expect(isPublicAnswer({ available: true, preview: true })).toBe(false);
    expect(isPublicAnswer({ available: false })).toBe(false);
    expect(isPublicAnswer(undefined)).toBe(false);
  });

  it("gives the current pages 10 seconds only when the pointer is public", () => {
    const open = {
      available: true as const,
      preview: false,
      version: "v",
      source: "edition" as const,
      state: "current" as const,
      nextRevealAt: null,
    };
    expect(pointerCache(open)).toBe("current");
    expect(pointerCache({ ...open, preview: true })).toBe("private");
    expect(pointerCache({ available: false })).toBe("private");
  });
});

describe("the ranking address", () => {
  it("keeps only known filters, and the default sort out of the address", () => {
    expect(validateRankingSearch({ poste: "MID", age: "21", tri: "goals" })).toEqual({
      poste: "mid",
      age: 21,
      tri: "goals",
    });
    expect(validateRankingSearch({ poste: "striker", age: "18", tri: "score" })).toEqual({});
    expect(validateRankingSearch({ tri: "drop table" })).toEqual({});
  });

  it("round-trips between the address and the filters", () => {
    const filters = rankingFiltersFromSearch({ poste: "gk", age: 19, tri: "minutes" });
    expect(filters).toEqual({ position: "GK", maxAge: 19, sort: "minutes" });
    expect(rankingSearchFromFilters(filters)).toEqual({ poste: "gk", age: 19, tri: "minutes" });
    expect(rankingSearchFromFilters({ position: null, maxAge: null, sort: "score" })).toEqual({});
  });
});

describe("the player and week addresses", () => {
  it("accepts a player id only as a UUID, and one tab", () => {
    expect(isPlayerId("7e500000-0000-4000-8000-000000000001")).toBe(true);
    expect(isPlayerId("../admin")).toBe(false);
    expect(validatePlayerSearch({ onglet: "matchs" })).toEqual({ onglet: "matchs" });
    expect(validatePlayerSearch({ onglet: "stats" })).toEqual({});
  });

  it("accepts a week between 1 and 60, written plainly", () => {
    expect(parseWeek("16")).toBe(16);
    expect(parseWeek("0")).toBeNull();
    expect(parseWeek("61")).toBeNull();
    expect(parseWeek("1e1")).toBeNull();
    expect(parseWeek("-3")).toBeNull();
  });
});

describe("validateRevealSearch", () => {
  it("keeps a rank from 1 to 10 and drops anything else", () => {
    expect(validateRevealSearch({ n: "4" })).toEqual({ n: 4 });
    expect(validateRevealSearch({ n: 10 })).toEqual({ n: 10 });
    expect(validateRevealSearch({ n: "0" })).toEqual({});
    expect(validateRevealSearch({ n: "11" })).toEqual({});
    expect(validateRevealSearch({ n: "2.5" })).toEqual({});
    expect(validateRevealSearch({})).toEqual({});
  });
});
