import { afterEach, describe, expect, it } from "bun:test";

import {
  DEVICE_KEYS,
  SESSION_KEYS,
  hasSeen,
  heroShownThisSession,
  markHeroShown,
  markSeen,
  readAckedMoments,
  readRememberedLeague,
  readTick,
  rememberAckedMoments,
  rememberLeague,
  resetHeroSessionForTests,
  writeTick,
} from "./storage";

const globals = globalThis as { window?: unknown };
const previous = globals.window;

class MemoryStorage {
  readonly data = new Map<string, string>();
  getItem(key: string) {
    return this.data.get(key) ?? null;
  }
  setItem(key: string, value: string) {
    this.data.set(key, value);
  }
  removeItem(key: string) {
    this.data.delete(key);
  }
}
const blocked = {
  getItem() {
    throw new Error("blocked");
  },
  setItem() {
    throw new Error("blocked");
  },
  removeItem() {
    throw new Error("blocked");
  },
};

function install(local: unknown = new MemoryStorage(), session: unknown = new MemoryStorage()) {
  globals.window = { localStorage: local, sessionStorage: session };
  return { local: local as MemoryStorage, session: session as MemoryStorage };
}

afterEach(() => {
  if (previous === undefined) delete globals.window;
  else globals.window = previous;
  resetHeroSessionForTests();
});

describe("the device keys", () => {
  it("are the ones the plan names", () => {
    expect(DEVICE_KEYS).toEqual({
      guestMake: "botolago.card.guest_make.v1",
      tick: "botolago.card.tick.v1",
      compareHint: "botolago.card.compare_hint.v1",
      moments: "botolago.card.moments.v1",
      league: "botolago.gradins.league.v1",
      hintCap: "botolago.card.hint.cap.v1",
      hintSel: "botolago.card.hint.sel.v1",
      hintTrf: "botolago.card.hint.trf.v1",
    });
    expect(SESSION_KEYS.hero).toBe("botolago.card.hero_session.v1");
  });
});

describe("a once-only flag", () => {
  it("is unseen until marked, then seen", () => {
    install();
    expect(hasSeen(DEVICE_KEYS.hintCap)).toBe(false);
    markSeen(DEVICE_KEYS.hintCap);
    expect(hasSeen(DEVICE_KEYS.hintCap)).toBe(true);
    expect(hasSeen(DEVICE_KEYS.hintSel)).toBe(false);
  });

  it("counts blocked storage as seen: a phone that cannot remember is never nagged", () => {
    install(blocked, blocked);
    expect(hasSeen(DEVICE_KEYS.hintTrf)).toBe(true);
    expect(() => markSeen(DEVICE_KEYS.hintTrf)).not.toThrow();
  });

  it("counts the server as seen, and a missing storage object too", () => {
    delete globals.window;
    expect(hasSeen(DEVICE_KEYS.compareHint)).toBe(true);
    globals.window = {};
    expect(hasSeen(DEVICE_KEYS.compareHint)).toBe(true);
  });
});

describe("the tick and the remembered league", () => {
  it("remembers the highest counted total, and reads garbage as none", () => {
    const { local } = install();
    expect(readTick()).toBe(0);
    writeTick(4);
    expect(readTick()).toBe(4);
    local.setItem(DEVICE_KEYS.tick, "banana");
    expect(readTick()).toBe(0);
    writeTick(-1);
    writeTick(1.5);
    expect(local.getItem(DEVICE_KEYS.tick)).toBe("banana");
  });

  it("remembers a league id and refuses anything that is not one", () => {
    const { local } = install();
    expect(readRememberedLeague()).toBeNull();
    rememberLeague("3c000005-0000-4000-8000-000000000001");
    expect(readRememberedLeague()).toBe("3c000005-0000-4000-8000-000000000001");
    local.setItem(DEVICE_KEYS.league, "<script>");
    expect(readRememberedLeague()).toBeNull();
  });

  it("never throws on blocked storage", () => {
    install(blocked, blocked);
    expect(readTick()).toBe(0);
    expect(() => writeTick(3)).not.toThrow();
    expect(readRememberedLeague()).toBeNull();
    expect(() => rememberLeague("3c000005-0000-4000-8000-000000000001")).not.toThrow();
  });
});

describe("acknowledged moments", () => {
  it("are kept per account: a shared key like card_created never hides another manager's moment", () => {
    install();
    rememberAckedMoments(["card_created", "first_rating:s1"], "user-a");
    expect(readAckedMoments("user-a")).toEqual(["card_created", "first_rating:s1"]);
    expect(readAckedMoments("user-b")).toEqual([]);
    expect(readAckedMoments()).toEqual([]);
    rememberAckedMoments(["card_created"], "user-b");
    expect(readAckedMoments("user-b")).toEqual(["card_created"]);
    expect(readAckedMoments("user-a")).toHaveLength(2);
  });

  it("do not repeat, and keep the newest 64", () => {
    install();
    rememberAckedMoments(["a", "a", "b"], "u");
    expect(readAckedMoments("u")).toEqual(["a", "b"]);
    rememberAckedMoments(
      Array.from({ length: 70 }, (_, i) => `k${i}`),
      "u",
    );
    const kept = readAckedMoments("u");
    expect(kept).toHaveLength(64);
    expect(kept.at(-1)).toBe("k69");
    expect(kept).not.toContain("a");
  });

  it("read garbage as none, and survive blocked storage", () => {
    const { local } = install();
    local.setItem(DEVICE_KEYS.moments, "{not json");
    expect(readAckedMoments("u")).toEqual([]);
    local.setItem(DEVICE_KEYS.moments, '{"a":1}');
    expect(readAckedMoments("u")).toEqual([]);
    install(blocked, blocked);
    expect(readAckedMoments("u")).toEqual([]);
    expect(() => rememberAckedMoments(["a"], "u")).not.toThrow();
  });
});

describe("one hero per session", () => {
  it("is shown once per session, and the flag lives in sessionStorage", () => {
    const { session } = install();
    expect(heroShownThisSession()).toBe(false);
    markHeroShown();
    expect(heroShownThisSession()).toBe(true);
    expect(session.getItem(SESSION_KEYS.hero)).toBe("1");
    resetHeroSessionForTests();
    expect(heroShownThisSession()).toBe(true);
  });

  it("holds in memory where sessionStorage is blocked", () => {
    install(new MemoryStorage(), blocked);
    expect(heroShownThisSession()).toBe(false);
    expect(() => markHeroShown()).not.toThrow();
    expect(heroShownThisSession()).toBe(true);
  });
});
