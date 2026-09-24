import { describe, expect, test } from "bun:test";

import { seasonSearch, validateMatchesSearch } from "./matches-search";

describe("the season across the Matches tabs", () => {
  test("reads a season id from the URL, and nothing else", () => {
    expect(validateMatchesSearch({ season: "abc" })).toEqual({ season: "abc" });
    expect(validateMatchesSearch({})).toEqual({});
    expect(validateMatchesSearch({ season: "" })).toEqual({});
    expect(validateMatchesSearch({ season: 2025 })).toEqual({});
    expect(validateMatchesSearch({ season: ["a", "b"] })).toEqual({});
  });

  test("carries a past season to the other tab, and leaves the current one out", () => {
    expect(seasonSearch({ id: "past", isCurrent: false })).toEqual({ season: "past" });
    expect(seasonSearch({ id: "now", isCurrent: true })).toEqual({});
    expect(seasonSearch(undefined)).toEqual({});
  });
});
