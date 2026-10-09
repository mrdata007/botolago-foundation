import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { mountSway } from "./sway";

type Handler = (e: Record<string, unknown>) => void;

/** A card element as far as the sway looks at it: one swaying group and some listeners. */
function fakeCard(hasGroup = true) {
  const attrs: Record<string, string> = {};
  const listeners = new Map<string, Handler>();
  const group = {
    setAttribute: (k: string, v: string) => (attrs[k] = v),
    removeAttribute: (k: string) => delete attrs[k],
  };
  const el = {
    querySelector: (sel: string) => (hasGroup && sel === ".mc-sway" ? group : null),
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
    setPointerCapture: () => undefined,
  };
  return { el: el as unknown as HTMLElement, attrs, listeners };
}

const g = globalThis as Record<string, unknown>;
let frames: ((now: number) => void)[] = [];
let reduce = false;
const saved: Record<string, unknown> = {};

beforeEach(() => {
  frames = [];
  reduce = false;
  for (const k of [
    "window",
    "document",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "performance",
  ])
    saved[k] = g[k];
  g.window = { matchMedia: () => ({ matches: reduce }) };
  g.document = { hidden: false };
  g.requestAnimationFrame = (fn: (now: number) => void) => frames.push(fn);
  g.cancelAnimationFrame = () => undefined;
});
afterEach(() => {
  for (const [k, v] of Object.entries(saved)) g[k] = v;
});

const run = (n: number) => {
  for (let i = 0; i < n && frames.length; i++) frames.shift()?.(performance.now());
};

describe("the sway", () => {
  it("swings from the rail while a mouse button is pressed, then comes to rest", () => {
    const c = fakeCard();
    const off = mountSway(c.el);
    c.listeners.get("pointerdown")?.({ pointerType: "mouse", clientX: 100, pointerId: 1 });
    c.listeners.get("pointermove")?.({ pointerType: "mouse", clientX: 60, buttons: 1 });
    run(3);
    expect(c.attrs.transform).toMatch(/^rotate\(-?[\d.]+ 132 15\)$/);
    run(2000);
    expect(c.attrs.transform).toBeUndefined();
    off();
  });

  it("a pen swings it; a finger and a hover do not", () => {
    const c = fakeCard();
    mountSway(c.el);
    c.listeners.get("pointerdown")?.({ pointerType: "pen", clientX: 100, pointerId: 1 });
    c.listeners.get("pointermove")?.({ pointerType: "pen", clientX: 40, buttons: 1 });
    expect(frames.length).toBe(1);
    frames.length = 0;
    const d = fakeCard();
    mountSway(d.el);
    d.listeners.get("pointerdown")?.({ pointerType: "touch", clientX: 100, pointerId: 1 });
    d.listeners.get("pointermove")?.({ pointerType: "touch", clientX: 40, buttons: 1 });
    // hover: no button pressed
    const e = fakeCard();
    mountSway(e.el);
    e.listeners.get("pointerdown")?.({ pointerType: "mouse", clientX: 100, pointerId: 1 });
    e.listeners.get("pointermove")?.({ pointerType: "mouse", clientX: 40, buttons: 0 });
    expect(frames.length).toBe(0);
  });

  it("does nothing under reduced motion, and nothing on a card with no hanging group", () => {
    reduce = true;
    const c = fakeCard();
    mountSway(c.el)();
    expect(c.listeners.size).toBe(0);
    reduce = false;
    const d = fakeCard(false);
    mountSway(d.el)();
    expect(d.listeners.size).toBe(0);
    expect(mountSway(null)).toBeInstanceOf(Function);
  });

  it("stops when the page is hidden, and the cleanup removes every listener", () => {
    const c = fakeCard();
    const off = mountSway(c.el);
    expect(c.listeners.size).toBe(5);
    c.listeners.get("pointerdown")?.({ pointerType: "mouse", clientX: 100, pointerId: 1 });
    c.listeners.get("pointermove")?.({ pointerType: "mouse", clientX: 60, buttons: 1 });
    (g.document as { hidden: boolean }).hidden = true;
    run(1);
    expect(c.attrs.transform).toBeUndefined();
    expect(frames.length).toBe(0);
    off();
    expect(c.listeners.size).toBe(0);
  });
});
