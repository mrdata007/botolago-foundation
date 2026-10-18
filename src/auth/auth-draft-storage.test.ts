import { afterEach, describe, expect, it } from "bun:test";
import { AUTH_DRAFT_FIELDS, clearAuthDrafts } from "./auth-draft-storage";

const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
afterEach(() => {
  if (originalWindow) Object.defineProperty(globalThis, "window", originalWindow);
  else Reflect.deleteProperty(globalThis, "window");
});

describe("confirmed-session auth draft cleanup", () => {
  it("removes both forms' drafts while preserving unrelated session data", () => {
    const saved = new Map<string, string>([["other.preference", "keep"]]);
    for (const field of AUTH_DRAFT_FIELDS) saved.set(`botolago.auth-draft.${field}`, "draft");
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: { sessionStorage: { removeItem: (key: string) => saved.delete(key) } },
    });
    clearAuthDrafts();
    expect([...saved.entries()]).toEqual([["other.preference", "keep"]]);
  });

  it("does not break sign-in when session storage is blocked", () => {
    // A browser exposes window even when the sessionStorage getter is denied.
    Object.defineProperty(globalThis, "window", {
      configurable: true,
      value: {
        get sessionStorage() {
          throw new Error("storage blocked");
        },
      },
    });
    expect(() => clearAuthDrafts()).not.toThrow();
  });

  it("is safe before browser hydration", () => {
    Reflect.deleteProperty(globalThis, "window");
    expect(() => clearAuthDrafts()).not.toThrow();
  });
});
