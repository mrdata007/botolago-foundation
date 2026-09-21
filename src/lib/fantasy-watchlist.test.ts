import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { parseWatchlist, toggleWatchlistEntry } from "./fantasy-watchlist";

describe("parseWatchlist", () => {
  it("reads a stored list of ids", () => {
    expect(parseWatchlist('["a","b"]')).toEqual(["a", "b"]);
  });

  it("survives anything else that could be under the key", () => {
    // An older format, a half-written value, another tab's experiment. A
    // watchlist that throws on read takes the whole screen down with it.
    for (const raw of [null, "", "not json", "5", '"a"', "{}", "null"]) {
      expect(parseWatchlist(raw)).toEqual([]);
    }
  });

  it("drops non-string entries rather than trusting the array", () => {
    expect(parseWatchlist('["a",1,null,{"id":"b"},"c"]')).toEqual(["a", "c"]);
  });
});

describe("toggleWatchlistEntry", () => {
  it("adds an id that is absent and removes one that is present", () => {
    expect(toggleWatchlistEntry([], "a")).toEqual(["a"]);
    expect(toggleWatchlistEntry(["a", "b"], "b")).toEqual(["a"]);
  });

  it("does not mutate the list it was given", () => {
    const original = ["a"];
    toggleWatchlistEntry(original, "b");
    expect(original).toEqual(["a"]);
  });
});

describe("both watchlist surfaces share one implementation", () => {
  // Top Players shipped an "Ajouter à la liste" button with no onClick at all,
  // because the working watchlist lived inline in the players screen where the
  // other screen could not reach it.
  const root = join(import.meta.dir, "..", "..");
  const SURFACES = ["src/routes/fantasy.players.tsx", "src/routes/fantasy.top-players.tsx"];

  it("leaves no second copy of the storage key", () => {
    for (const file of SURFACES) {
      const source = readFileSync(join(root, file), "utf8");
      expect(source).toContain("useWatchlist");
      expect(source).not.toContain("botolago.fantasy.watchlist");
    }
  });
});
