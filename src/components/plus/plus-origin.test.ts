import { afterEach, beforeEach, describe, expect, it, setSystemTime } from "bun:test";

import { clearOfferOrigin, offerEntry, rememberOfferOrigin } from "./plus-origin";

type Win = { sessionStorage: Storage };
const g = globalThis as unknown as { window?: Win };

function install(blocked = false): Map<string, string> {
  const map = new Map<string, string>();
  const boom = () => {
    throw new Error("blocked");
  };
  g.window = {
    sessionStorage: blocked
      ? ({ getItem: boom, setItem: boom, removeItem: boom } as unknown as Storage)
      : ({
          getItem: (k: string) => map.get(k) ?? null,
          setItem: (k: string, v: string) => void map.set(k, v),
          removeItem: (k: string) => void map.delete(k),
        } as unknown as Storage),
  };
  return map;
}

/** What the hook does with it: how many entries Close goes back, or null for the fallback page. */
function closeSteps(index: number, entry: number): number | null {
  return entry > 0 ? index - entry + 1 : null;
}

beforeEach(() => void install());
afterEach(() => {
  setSystemTime();
  delete g.window;
});

describe("where the offer began", () => {
  it("is the page's own entry when nothing was carried", () => {
    expect(offerEntry(5)).toBe(5);
  });

  it("card page → Découvrir → Voir l'aperçu: Close lands on the card page", () => {
    // card page at 3, the short paywall at 4; « Voir l'aperçu » on the same route adds step entries.
    const entry = offerEntry(4);
    expect(entry).toBe(4);
    expect(closeSteps(6, entry)).toBe(3); // two story steps in: back 3 lands on index 3
  });

  it("/plus → Voir l'aperçu: the story page leaves the whole offer, not back to /plus", () => {
    // /plus mounted at index 7 (entered from page 6), then the hop pushes /curva/plus at 8.
    rememberOfferOrigin(7);
    const entry = offerEntry(8);
    expect(entry).toBe(7);
    expect(closeSteps(8, entry)).toBe(2); // 8 → 6, the page before /plus
    expect(closeSteps(9, entry)).toBe(3); // one story step in: still 6
  });

  it("sign-up round trip: Close leaves the auth detour too", () => {
    // offer at 4 (from page 3); register 5, verify 6, back to the offer at 7.
    rememberOfferOrigin(4);
    const entry = offerEntry(7);
    expect(entry).toBe(4);
    expect(closeSteps(7, entry)).toBe(4); // 7 → 3
  });

  it("a deep link carries entry 0: Close goes to the fallback page", () => {
    rememberOfferOrigin(0);
    const entry = offerEntry(1);
    expect(entry).toBe(0);
    expect(closeSteps(1, entry)).toBeNull();
  });

  it("reading is repeatable until it is cleared", () => {
    rememberOfferOrigin(2);
    expect(offerEntry(3)).toBe(2);
    expect(offerEntry(3)).toBe(2);
    clearOfferOrigin();
    expect(offerEntry(3)).toBe(3);
  });

  it("ignores a note from a page that is not further along", () => {
    rememberOfferOrigin(5);
    expect(offerEntry(5)).toBe(5);
    expect(offerEntry(2)).toBe(2);
  });

  it("ignores a stale note", () => {
    const now = Date.now();
    setSystemTime(new Date(now));
    rememberOfferOrigin(2);
    setSystemTime(new Date(now + 31 * 60_000));
    expect(offerEntry(4)).toBe(4);
  });

  it("ignores a damaged note", () => {
    const map = install();
    map.set("botolago.plus.origin", "garbage");
    expect(offerEntry(4)).toBe(4);
    map.set("botolago.plus.origin", `${Date.now()}|-3`);
    expect(offerEntry(4)).toBe(4);
  });

  it("works without storage", () => {
    install(true);
    expect(() => rememberOfferOrigin(2)).not.toThrow();
    expect(offerEntry(4)).toBe(4);
    expect(() => clearOfferOrigin()).not.toThrow();
  });
});
