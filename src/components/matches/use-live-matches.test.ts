import { describe, expect, test } from "bun:test";

import { endedMatchIds } from "./use-live-matches";

describe("a match leaving the live list", () => {
  test("names the matches no longer in play", () => {
    expect(endedMatchIds(new Set(["a", "b"]), new Set(["b", "c"]))).toEqual(["a"]);
  });

  test("says nothing when matches only kick off or keep going", () => {
    expect(endedMatchIds(new Set(["a"]), new Set(["a", "b"]))).toEqual([]);
    expect(endedMatchIds(new Set(), new Set(["a"]))).toEqual([]);
  });

  test("names every match of a round that ends together", () => {
    expect(endedMatchIds(new Set(["a", "b", "c"]), new Set())).toEqual(["a", "b", "c"]);
  });
});
