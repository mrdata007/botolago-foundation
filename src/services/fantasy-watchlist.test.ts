import { describe, expect, test } from "bun:test";

import {
  fantasyWatchlistStorageKey,
  readFantasyWatchlist,
  writeFantasyWatchlist,
  type FantasyWatchlistStorage,
} from "./fantasy-watchlist";

describe("Fantasy watchlist storage", () => {
  test("isolates authenticated users and data sources", () => {
    const cloudA = fantasyWatchlistStorageKey({
      source: "cloud",
      authStatus: "authenticated",
      userId: "user/a",
    });
    const cloudB = fantasyWatchlistStorageKey({
      source: "cloud",
      authStatus: "authenticated",
      userId: "user/b",
    });
    const localA = fantasyWatchlistStorageKey({
      source: "local",
      authStatus: "authenticated",
      userId: "user/a",
    });

    expect(cloudA).not.toBe(cloudB);
    expect(cloudA).not.toBe(localA);
    expect(cloudA).toContain("user%2Fa");
  });

  test("uses a source-specific guest scope and waits for resolved auth", () => {
    expect(fantasyWatchlistStorageKey({ source: "guest", authStatus: "guest", userId: null })).toBe(
      "botolago.fantasy.watchlist.guest.guest",
    );
    expect(
      fantasyWatchlistStorageKey({ source: "local", authStatus: "anonymous", userId: null }),
    ).toBe("botolago.fantasy.watchlist.local.guest");
    expect(
      fantasyWatchlistStorageKey({ source: "cloud", authStatus: "loading", userId: null }),
    ).toBeNull();
    expect(
      fantasyWatchlistStorageKey({
        source: "cloud",
        authStatus: "authenticated",
        userId: null,
      }),
    ).toBeNull();
  });

  test("validates, deduplicates, and writes ids", () => {
    const values = new Map<string, string>([["key", '["p1",3,"p1","p2"]']]);
    const storage: FantasyWatchlistStorage = {
      getItem: (key) => values.get(key) ?? null,
      setItem: (key, value) => values.set(key, value),
    };

    expect(readFantasyWatchlist(storage, "key")).toEqual(["p1", "p2"]);
    expect(writeFantasyWatchlist(storage, "key", ["p3"])).toBe(true);
    expect(values.get("key")).toBe('["p3"]');
  });

  test("fails closed when storage is malformed or unavailable", () => {
    const unavailable: FantasyWatchlistStorage = {
      getItem: () => {
        throw new Error("unavailable");
      },
      setItem: () => {
        throw new Error("unavailable");
      },
    };

    expect(readFantasyWatchlist({ getItem: () => "{" }, "key")).toEqual([]);
    expect(readFantasyWatchlist(unavailable, "key")).toEqual([]);
    expect(writeFantasyWatchlist(unavailable, "key", ["p1"])).toBe(false);
  });
});
