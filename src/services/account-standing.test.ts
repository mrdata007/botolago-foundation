import { afterEach, beforeEach, describe, expect, test } from "bun:test";
import {
  accountStandingSchema,
  rememberSuspension,
  SUSPENSION_NOTICE_KEY,
  takeSuspensionNotice,
} from "./account-standing";

class MemoryStorage {
  private values = new Map<string, string>();
  getItem(key: string) {
    return this.values.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.values.set(key, value);
  }
  removeItem(key: string) {
    this.values.delete(key);
  }
}

const globals = globalThis as { window?: unknown };
let previousWindow: unknown;

beforeEach(() => {
  previousWindow = globals.window;
  globals.window = { sessionStorage: new MemoryStorage() };
});

afterEach(() => {
  globals.window = previousWindow;
});

describe("account standing", () => {
  test("parses what the database answers", () => {
    expect(accountStandingSchema.parse({ banned: false, bannedUntil: null })).toEqual({
      banned: false,
      bannedUntil: null,
    });
    expect(
      accountStandingSchema.parse({ banned: true, bannedUntil: "2026-10-01T12:00:00.5+00:00" })
        .banned,
    ).toBe(true);
  });

  test("the sign-in page is told once, then forgets", () => {
    rememberSuspension("2026-10-01T12:00:00+00:00");
    expect(takeSuspensionNotice()).toEqual({ until: "2026-10-01T12:00:00+00:00" });
    expect(takeSuspensionNotice()).toBeNull();
  });

  test("a ban until lifted is remembered as such", () => {
    rememberSuspension(null);
    expect(takeSuspensionNotice()).toEqual({ until: null });
  });

  test("a damaged notice is dropped, not shown", () => {
    (globals.window as { sessionStorage: MemoryStorage }).sessionStorage.setItem(
      SUSPENSION_NOTICE_KEY,
      "{not json",
    );
    expect(takeSuspensionNotice()).toBeNull();
  });

  test("storage that throws never breaks the sign-out", () => {
    globals.window = {
      sessionStorage: {
        getItem() {
          throw new Error("denied");
        },
        setItem() {
          throw new Error("denied");
        },
        removeItem() {
          throw new Error("denied");
        },
      },
    };
    expect(() => rememberSuspension(null)).not.toThrow();
    expect(takeSuspensionNotice()).toBeNull();
  });
});
