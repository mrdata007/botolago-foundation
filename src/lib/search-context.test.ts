import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { recallSearchQuery, rememberSearchQuery } from "./search-context";

/**
 * The header search's query rides on the history entry it was left from, so
 * Retour brings it back. The browser is a stand-in with the one part of the
 * History API this reads and writes, and the router's own bookkeeping in it.
 */

type FakeWindow = { history: { state: unknown; replaceState: (state: unknown) => void } };
const globals = globalThis as unknown as { window?: FakeWindow };

let original: FakeWindow | undefined;

beforeEach(() => {
  original = globals.window;
  globals.window = {
    history: {
      state: { __TSR_key: "entry-1", __TSR_index: 3 },
      replaceState(state) {
        this.state = state;
      },
    },
  };
});

afterEach(() => {
  globals.window = original;
});

describe("search context on the history entry", () => {
  it("brings back the query the entry was left with", () => {
    rememberSearchQuery("wyd");
    expect(recallSearchQuery()).toBe("wyd");
  });

  it("keeps the router's key and index, which its scroll restoration is keyed on", () => {
    rememberSearchQuery("wyd");
    expect(globals.window?.history.state).toMatchObject({
      __TSR_key: "entry-1",
      __TSR_index: 3,
    });
  });

  it("is empty for an entry that was not left from a result", () => {
    expect(recallSearchQuery()).toBe("");
  });

  it("does not store an empty or blank query", () => {
    rememberSearchQuery("   ");
    expect(recallSearchQuery()).toBe("");
  });

  it("ignores a state that is not an object", () => {
    if (globals.window) globals.window.history.state = "legacy";
    expect(recallSearchQuery()).toBe("");
    rememberSearchQuery("raja");
    expect(recallSearchQuery()).toBe("raja");
  });

  it("does nothing without a browser, as on the server", () => {
    globals.window = undefined;
    expect(() => rememberSearchQuery("wyd")).not.toThrow();
    expect(recallSearchQuery()).toBe("");
  });

  it("survives a browser that refuses to rewrite the entry", () => {
    if (globals.window) {
      globals.window.history.replaceState = () => {
        throw new DOMException("rate limited", "SecurityError");
      };
    }
    expect(() => rememberSearchQuery("wyd")).not.toThrow();
  });
});
