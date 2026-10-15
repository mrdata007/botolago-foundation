import { afterEach, describe, expect, it } from "bun:test";
import "@/services/__test-shim";
import { readJSON, removeKey, tryWriteJSON, writeJSON } from "./storage";

/**
 * `writeJSON` swallows quota and blocked-storage errors, so a screen could not
 * tell a saved draft from a lost one (UX-009). `tryWriteJSON` says which.
 */

const storage = () => (globalThis as any).window.localStorage as Storage;
const realSetItem = storage().setItem;

function denyStorage() {
  storage().setItem = () => {
    throw new DOMException("The quota has been exceeded.", "QuotaExceededError");
  };
}

afterEach(() => {
  storage().setItem = realSetItem;
  removeKey("test.value");
});

describe("tryWriteJSON", () => {
  it("reports success and stores the value", () => {
    expect(tryWriteJSON("test.value", { a: 1 })).toBe(true);
    expect(readJSON<{ a: number }>("test.value")).toEqual({ a: 1 });
  });

  it("reports failure when the browser refuses the write, instead of staying silent", () => {
    denyStorage();
    expect(tryWriteJSON("test.value", { a: 1 })).toBe(false);
    expect(readJSON("test.value")).toBeNull();
  });
});

describe("writeJSON keeps its best-effort behaviour for the callers that ignore the result", () => {
  it("does not throw and returns nothing when storage is refused", () => {
    denyStorage();
    expect(writeJSON("test.value", { a: 1 })).toBeUndefined();
  });

  it("still stores when storage works", () => {
    writeJSON("test.value", { a: 2 });
    expect(readJSON<{ a: number }>("test.value")).toEqual({ a: 2 });
  });
});
