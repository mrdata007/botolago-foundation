// Run with: `bun test src/services/leagues-store.test.ts`
import { describe, it, expect, beforeEach } from "bun:test";
import { leaguesStore, LEAGUE_ERROR } from "./leagues-store";

// jsdom-like localStorage shim for bun test.
if (typeof globalThis.window === "undefined") {
  const mem = new Map<string, string>();
  // @ts-expect-error test-only window shim; global type intentionally overridden
  globalThis.window = {
    localStorage: {
      getItem: (k: string) => (mem.has(k) ? mem.get(k)! : null),
      setItem: (k: string, v: string) => {
        mem.set(k, v);
      },
      removeItem: (k: string) => {
        mem.delete(k);
      },
    },
    dispatchEvent: () => true,
  };
  // @ts-expect-error test-only CustomEvent shim; global type intentionally overridden
  globalThis.CustomEvent = class {
    constructor(_t: string, _o?: any) {}
  };
}

describe("leaguesStore", () => {
  beforeEach(() => leaguesStore.reset());

  it("creates a private league with generated code and creator role", () => {
    const l = leaguesStore.create("Casablanca Cup");
    expect(l.name).toBe("Casablanca Cup");
    expect(l.role).toBe("creator");
    expect(l.code).toMatch(/^BOT-[A-Z0-9]{5}$/);
    expect(leaguesStore.list()).toHaveLength(1);
  });

  it("rejects duplicate league names", () => {
    leaguesStore.create("Atlas");
    expect(() => leaguesStore.create("atlas")).toThrow(LEAGUE_ERROR.DUPLICATE_NAME);
  });

  it("joins by valid code and rejects duplicates", () => {
    const l = leaguesStore.join("BOT-ABCDE");
    expect(l.role).toBe("member");
    expect(() => leaguesStore.join("BOT-ABCDE")).toThrow(LEAGUE_ERROR.ALREADY_JOINED);
  });

  it("rejects invalid join codes", () => {
    expect(() => leaguesStore.join("nope")).toThrow(LEAGUE_ERROR.INVALID_CODE);
  });

  it("member can leave; creator cannot leave (must delete)", () => {
    const joined = leaguesStore.join("BOT-XYZ12");
    leaguesStore.leave(joined.id);
    expect(leaguesStore.list()).toHaveLength(0);
    const created = leaguesStore.create("Rabat Kings");
    expect(() => leaguesStore.leave(created.id)).toThrow(LEAGUE_ERROR.NOT_CREATOR);
  });

  it("creator can replace the invite code; the old one is gone", () => {
    const created = leaguesStore.create("Tanger Tides");
    const code = leaguesStore.resetCode(created.id);
    expect(code).toMatch(/^BOT-[A-Z0-9]{5}$/);
    expect(code).not.toBe(created.code);
    expect(leaguesStore.get(created.id)?.code).toBe(code);
  });

  it("only creator can replace the invite code", () => {
    const joined = leaguesStore.join("BOT-RRRRR");
    expect(() => leaguesStore.resetCode(joined.id)).toThrow(LEAGUE_ERROR.NOT_CREATOR);
    expect(leaguesStore.get(joined.id)?.code).toBe("BOT-RRRRR");
    expect(() => leaguesStore.resetCode("missing")).toThrow(LEAGUE_ERROR.NOT_FOUND);
  });

  it("only creator can delete", () => {
    const joined = leaguesStore.join("BOT-QQQQQ");
    expect(() => leaguesStore.delete(joined.id)).toThrow(LEAGUE_ERROR.NOT_CREATOR);
    const created = leaguesStore.create("Fez Foxes");
    leaguesStore.delete(created.id);
    expect(leaguesStore.list()).toHaveLength(1); // only joined left
  });
});
