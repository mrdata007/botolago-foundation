import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { mountTilt } from "./tilt";

type Handler = (e: Record<string, unknown>) => void;

/** A card as far as the tilt looks at it: a root with classes, variables and listeners. */
function fakeCard(dir: "ltr" | "rtl" = "ltr") {
  const classes = new Set<string>();
  const vars = new Map<string, string>();
  const listeners = new Map<string, Handler>();
  const root = {
    getAttribute: (name: string) => (name === "dir" ? dir : null),
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 300, height: 485 }),
    classList: {
      add: (...c: string[]) => c.forEach((x) => classes.add(x)),
      remove: (...c: string[]) => c.forEach((x) => classes.delete(x)),
      contains: (c: string) => classes.has(c),
      toggle: (c: string, on?: boolean) => (on ? classes.add(c) : classes.delete(c)),
    },
    style: {
      setProperty: (k: string, v: string) => vars.set(k, v),
      removeProperty: (k: string) => vars.delete(k),
    },
    addEventListener: (type: string, fn: Handler) => listeners.set(type, fn),
    removeEventListener: (type: string) => listeners.delete(type),
  };
  const el = { querySelector: (sel: string) => (sel === ".mc-eclat" ? root : null) };
  return { el: el as unknown as HTMLElement, classes, vars, listeners };
}

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let frames: (() => void)[] = [];
let reduce = false;
let touch = false;
let observed: { cb: (e: { isIntersecting: boolean }[]) => void; disconnected: boolean } | null =
  null;

beforeEach(() => {
  frames = [];
  reduce = false;
  touch = false;
  observed = null;
  for (const k of [
    "window",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IntersectionObserver",
  ])
    saved[k] = g[k];
  g.window = {
    matchMedia: (q: string) => ({
      matches: q.includes("reduce") ? reduce : q.includes("hover: none") ? touch : false,
    }),
    setTimeout: (fn: () => void) => setTimeout(fn, 0),
  };
  g.requestAnimationFrame = (fn: () => void) => frames.push(fn);
  g.cancelAnimationFrame = (id: number) => {
    if (id) frames[id - 1] = () => undefined;
  };
  g.IntersectionObserver = class {
    constructor(cb: (e: { isIntersecting: boolean }[]) => void) {
      observed = { cb, disconnected: false };
    }
    observe() {}
    disconnect() {
      observed!.disconnected = true;
    }
  };
});
afterEach(() => {
  for (const k of Object.keys(saved)) g[k] = saved[k];
});

const flush = () => {
  const run = frames;
  frames = [];
  run.forEach((f) => f());
};

describe("the tilt (plan 8.3)", () => {
  it("writes the light on a mouse or a pen and marks the card active", () => {
    const { el, classes, vars, listeners } = fakeCard();
    mountTilt(el);
    listeners.get("pointermove")!({ pointerType: "mouse", clientX: 100 + 300, clientY: 200 });
    flush();
    expect(classes.has("mc-eclat--active")).toBe(true);
    expect(vars.get("--mc-ax")).toBe("1.000");
    expect(vars.get("--mc-ay")).toBe("1.000");
    listeners.get("pointermove")!({ pointerType: "pen", clientX: 100, clientY: 200 + 485 });
    flush();
    expect(vars.get("--mc-ax")).toBe("-1.000");
    expect(vars.get("--mc-ay")).toBe("-1.000");
  });

  it("clamps the light to the card's box", () => {
    const { el, vars, listeners } = fakeCard();
    mountTilt(el);
    listeners.get("pointermove")!({ pointerType: "mouse", clientX: -500, clientY: 9000 });
    flush();
    expect(vars.get("--mc-ax")).toBe("-1.000");
    expect(vars.get("--mc-ay")).toBe("-1.000");
  });

  it("never tilts for a finger", () => {
    const { el, classes, vars, listeners } = fakeCard();
    mountTilt(el);
    listeners.get("pointermove")!({ pointerType: "touch", clientX: 250, clientY: 300 });
    flush();
    expect(classes.has("mc-eclat--active")).toBe(false);
    expect(vars.size).toBe(0);
  });

  it("settles back to the rest light on leaving, in Arabic to the mirrored one", () => {
    for (const [dir, ax] of [
      ["ltr", "0.240"],
      ["rtl", "-0.240"],
    ] as const) {
      const { el, classes, vars, listeners } = fakeCard(dir);
      mountTilt(el);
      listeners.get("pointermove")!({ pointerType: "mouse", clientX: 300, clientY: 300 });
      flush();
      listeners.get("pointerleave")!({});
      expect(classes.has("mc-eclat--active")).toBe(false);
      expect(classes.has("mc-eclat--settle")).toBe(true);
      expect(vars.get("--mc-ax")).toBe(ax);
      expect(vars.get("--mc-ay")).toBe("0.640");
      // the end of the depth's transition returns the card to the flat stack
      listeners.get("transitionend")!({
        target: (el as unknown as { querySelector: (s: string) => unknown }).querySelector(
          ".mc-eclat",
        ),
        propertyName: "--mc-t",
      });
      expect(classes.has("mc-eclat--settle")).toBe(false);
    }
  });

  it("floats on a touch-only screen while the card is on screen", () => {
    touch = true;
    const { el, classes } = fakeCard();
    mountTilt(el);
    expect(observed).not.toBeNull();
    observed!.cb([{ isIntersecting: true }]);
    expect(classes.has("mc-eclat--idle")).toBe(true);
    observed!.cb([{ isIntersecting: false }]);
    expect(classes.has("mc-eclat--idle")).toBe(false);
  });

  it("does nothing under reduced motion, or on a card it cannot find", () => {
    reduce = true;
    const { el, listeners } = fakeCard();
    mountTilt(el)();
    expect(listeners.size).toBe(0);
    reduce = false;
    expect(mountTilt({ querySelector: () => null } as unknown as HTMLElement)).toBeInstanceOf(
      Function,
    );
    expect(mountTilt(null)).toBeInstanceOf(Function);
  });

  it("removes its listeners, its observer, its classes and its variables on cleanup", () => {
    touch = true;
    const { el, classes, vars, listeners } = fakeCard();
    const stop = mountTilt(el);
    listeners.get("pointermove")!({ pointerType: "mouse", clientX: 300, clientY: 300 });
    flush();
    observed!.cb([{ isIntersecting: true }]);
    expect(classes.size).toBeGreaterThan(0);
    stop();
    expect(listeners.size).toBe(0);
    expect(classes.size).toBe(0);
    expect(vars.size).toBe(0);
    expect(observed!.disconnected).toBe(true);
  });
});
