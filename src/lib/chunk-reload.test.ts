import { describe, expect, it } from "bun:test";

import {
  CHUNK_RELOAD_KEY,
  CHUNK_RELOAD_WINDOW_MS,
  createChunkReloadGuard,
  isChunkLoadError,
  retryAfterError,
} from "./chunk-reload";

/**
 * "Réessayer" must recover when a page file failed to download (state sweep
 * 2026-10-16, E5) and must stay what it was for every other error. Driven with
 * fake storage, a fake clock and spies: nothing here reloads a page.
 */

const CHROMIUM = new TypeError(
  "Failed to fetch dynamically imported module: https://botolago.com/assets/matches.index-CDQj.js",
);
const FIREFOX = new TypeError("error loading dynamically imported module: https://x/a.js");
const SAFARI = new TypeError("Importing a module script failed.");

function memoryStore(initial: Record<string, string> = {}) {
  const data = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    data,
  };
}

function clock(start = 1_000_000) {
  let at = start;
  return { now: () => at, advance: (ms: number) => void (at += ms) };
}

function spies() {
  const calls: string[] = [];
  return {
    calls,
    invalidate: () => void calls.push("invalidate"),
    reset: () => void calls.push("reset"),
    reload: () => void calls.push("reload"),
  };
}

describe("isChunkLoadError", () => {
  it("recognises the three browsers' wording, as an Error or a string", () => {
    expect(isChunkLoadError(CHROMIUM)).toBe(true);
    expect(isChunkLoadError(FIREFOX)).toBe(true);
    expect(isChunkLoadError(SAFARI)).toBe(true);
    expect(isChunkLoadError("Failed to fetch dynamically imported module: x")).toBe(true);
    expect(isChunkLoadError(new Error("Unable to preload CSS for /assets/a.css"))).toBe(true);
    const named = new Error("boom");
    named.name = "ChunkLoadError";
    expect(isChunkLoadError(named)).toBe(true);
  });

  it("does not take an ordinary error for a missing file", () => {
    expect(isChunkLoadError(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isChunkLoadError(new TypeError("Failed to fetch"))).toBe(false);
    expect(isChunkLoadError(new Error("Minified React error #520"))).toBe(false);
    expect(isChunkLoadError(null)).toBe(false);
    expect(isChunkLoadError(undefined)).toBe(false);
    expect(isChunkLoadError({})).toBe(false);
    expect(isChunkLoadError(42)).toBe(false);
  });
});

describe("createChunkReloadGuard", () => {
  it("allows one reload, then refuses until the window has passed", () => {
    const store = memoryStore();
    const time = clock();
    const guard = createChunkReloadGuard({ getStorage: () => store, now: time.now });
    expect(guard.claim()).toBe(true);
    expect(store.data.get(CHUNK_RELOAD_KEY)).toBe(String(time.now()));
    expect(guard.claim()).toBe(false);
    time.advance(CHUNK_RELOAD_WINDOW_MS - 1);
    expect(guard.claim()).toBe(false);
  });

  it("remembers across a reload (a new guard on the same storage)", () => {
    const store = memoryStore();
    const time = clock();
    expect(createChunkReloadGuard({ getStorage: () => store, now: time.now }).claim()).toBe(true);
    // The page reloaded: a new module instance, the same tab storage.
    time.advance(5_000);
    const afterReload = createChunkReloadGuard({ getStorage: () => store, now: time.now });
    expect(afterReload.claim()).toBe(false);
    time.advance(CHUNK_RELOAD_WINDOW_MS);
    expect(afterReload.claim()).toBe(true);
  });

  it("treats a mark from the future or a garbled one as no recent reload", () => {
    const time = clock();
    const future = memoryStore({ [CHUNK_RELOAD_KEY]: String(time.now() + 10 * 60_000) });
    expect(createChunkReloadGuard({ getStorage: () => future, now: time.now }).claim()).toBe(true);
    const garbled = memoryStore({ [CHUNK_RELOAD_KEY]: "not a number" });
    expect(createChunkReloadGuard({ getStorage: () => garbled, now: time.now }).claim()).toBe(true);
  });

  it("still allows one reload per page when storage throws on read, on write or on access", () => {
    const readThrows = {
      getItem: () => {
        throw new Error("denied");
      },
      setItem: () => undefined,
    };
    const writeThrows = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota");
      },
    };
    for (const getStorage of [
      () => readThrows,
      () => writeThrows,
      () => {
        throw new Error("SecurityError");
      },
      () => null,
    ]) {
      const guard = createChunkReloadGuard({ getStorage });
      expect(guard.claim()).toBe(true);
      expect(guard.claim()).toBe(false);
    }
  });
});

describe("retryAfterError", () => {
  it("reloads, and does not run the router retry, for a page file that failed", () => {
    const s = spies();
    const guard = createChunkReloadGuard({ getStorage: () => memoryStore() });
    expect(retryAfterError(CHROMIUM, { ...s, guard })).toBe("reloaded");
    expect(s.calls).toEqual(["reload"]);
  });

  it("falls back to the ordinary retry on the second tap inside the window", () => {
    const s = spies();
    const guard = createChunkReloadGuard({ getStorage: () => memoryStore() });
    expect(retryAfterError(SAFARI, { ...s, guard })).toBe("reloaded");
    expect(retryAfterError(SAFARI, { ...s, guard })).toBe("retried");
    expect(s.calls).toEqual(["reload", "invalidate", "reset"]);
  });

  it("never reloads for any other error", () => {
    const s = spies();
    const guard = createChunkReloadGuard({ getStorage: () => memoryStore() });
    expect(retryAfterError(new Error("Cannot read properties of undefined"), { ...s, guard })).toBe(
      "retried",
    );
    expect(s.calls).toEqual(["invalidate", "reset"]);
    // And the guard was not spent by it: a real chunk failure can still reload.
    expect(retryAfterError(FIREFOX, { ...s, guard })).toBe("reloaded");
  });
});
