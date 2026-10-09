import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import {
  RIM_PLANE,
  Z,
  castDelta,
  depth,
  follow,
  glintA,
  glintB,
  restLight,
  rim,
  rimRest,
  shadow,
  tilt,
} from "./pose";
import { mountTilt } from "./tilt";

type Handler = (e: Record<string, unknown>) => void;

/** An element as far as the tilt looks at it: an inline style it writes and attributes it reads. */
function part(attrs: Record<string, string> = {}) {
  const props = new Map<string, string>();
  const calls: { keyframes: Record<string, unknown>[]; options: Record<string, unknown> }[] = [];
  const animations: { cancelled: boolean; committed: boolean }[] = [];
  const style = new Proxy({} as Record<string, unknown>, {
    get(_, key) {
      if (key === "setProperty") return (k: string, v: string) => props.set(k, String(v));
      if (key === "removeProperty") return (k: string) => void props.delete(k);
      if (key === "getPropertyValue") return (k: string) => props.get(k) ?? "";
      return props.get(String(key));
    },
    set(_, key, value) {
      props.set(String(key), String(value));
      return true;
    },
  });
  return {
    style,
    props,
    calls,
    animations,
    getAttribute: (name: string) => attrs[name] ?? null,
    animate(keyframes: Record<string, unknown>[], options: Record<string, unknown>) {
      calls.push({ keyframes, options });
      const state = { cancelled: false, committed: false };
      animations.push(state);
      return {
        cancel: () => (state.cancelled = true),
        commitStyles: () => (state.committed = true),
      };
    },
  };
}
type Part = ReturnType<typeof part>;

/** A card as far as the tilt looks at it: a root with classes, variables and listeners, and its parts. */
function fakeCard(dir: "ltr" | "rtl" = "ltr") {
  const classes = new Set<string>();
  const vars = new Map<string, string>();
  const listeners = new Map<string, Handler>();
  const parts = {
    tilt: part(),
    shadow: part(),
    foil: part(),
    rimsGroup: part(),
    cast: part(),
    base: part(),
    shirt: part(),
    num: part(),
    frame: part(),
    holo: part(),
    rims: [1, 2, 3, 4, 5, 6, 7].map((k) => part({ style: `--k:${k};--o:${8 - k}` })),
    hi: part(),
    sh: part(),
    foilShift: [part(), part()],
    spec: part(),
    light: part(),
    glintA: [part(), part()],
    glintB: [part()],
  };
  const registry: Record<string, Part[]> = {
    ".mc-eclat__tilt": [parts.tilt],
    ".mc-eclat__shadow": [parts.shadow],
    ".mc-eclat__foil": [parts.foil],
    ".mc-rims": [parts.rimsGroup],
    ".mc-cast": [parts.cast],
    ".mc-l--base": [parts.base],
    ".mc-l--shirt": [parts.shirt],
    ".mc-l--num": [parts.num],
    ".mc-l--frame": [parts.frame],
    ".mc-l--holo": [parts.holo],
    ".mc-rim": parts.rims,
    ".mc-num-hi": [parts.hi],
    ".mc-num-sh": [parts.sh],
    ".mc-foil-shift": parts.foilShift,
    ".mc-spec-shift": [parts.spec],
    ".mc-light-follow": [parts.light],
    ".mc-glint-a": parts.glintA,
    ".mc-glint-b": parts.glintB,
  };
  const root = {
    getAttribute: (name: string) => (name === "dir" ? dir : null),
    getBoundingClientRect: () => ({ left: 100, top: 200, width: 300, height: 485 }),
    querySelector: (sel: string) => registry[sel]?.[0] ?? null,
    querySelectorAll: (sel: string) => registry[sel] ?? [],
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
  return { el: el as unknown as HTMLElement, root, classes, vars, listeners, parts };
}

const g = globalThis as Record<string, unknown>;
const saved: Record<string, unknown> = {};
let frames: ((now?: number) => void)[] = [];
let clock = 0;
let reduce = false;
let touch = false;
let observed: { cb: (e: { isIntersecting: boolean }[]) => void; disconnected: boolean } | null =
  null;
/** The page's `visibilitychange` listeners, and whether it is hidden. */
const page = { hidden: false, listeners: new Map<string, () => void>() };

beforeEach(() => {
  frames = [];
  clock = 0;
  reduce = false;
  touch = false;
  observed = null;
  page.hidden = false;
  page.listeners.clear();
  for (const k of [
    "window",
    "document",
    "requestAnimationFrame",
    "cancelAnimationFrame",
    "IntersectionObserver",
  ])
    saved[k] = g[k];
  g.document = {
    get hidden() {
      return page.hidden;
    },
    addEventListener: (type: string, fn: () => void) => page.listeners.set(type, fn),
    removeEventListener: (type: string) => page.listeners.delete(type),
  };
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

/** Runs the frames that are waiting, 16 ms apart, and the ones they ask for, until `max` frames. */
const flush = (max = 1) => {
  for (let i = 0; i < max && frames.length; i++) {
    const run = frames;
    frames = [];
    clock += 16;
    run.forEach((f) => f(clock));
  }
};
const transform = (p: Part) => p.props.get("transform");
const move = (listeners: Map<string, Handler>, clientX: number, clientY: number, type = "mouse") =>
  listeners.get("pointermove")!({ pointerType: type, clientX, clientY });
const later = () => new Promise((r) => setTimeout(r, 10));

describe("the tilt (plan 8.3)", () => {
  it("writes the light on a mouse or a pen and marks the card active", () => {
    const { el, classes, vars, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, 100 + 300, 200);
    flush();
    expect(classes.has("mc-eclat--active")).toBe(true);
    expect(vars.get("--mc-ax")).toBe("1.000");
    expect(vars.get("--mc-ay")).toBe("1.000");
    move(listeners, 100, 200 + 485, "pen");
    flush();
    expect(vars.get("--mc-ax")).toBe("-1.000");
    expect(vars.get("--mc-ay")).toBe("-1.000");
  });

  it("clamps the light to the card's box", () => {
    const { el, vars, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, -500, 9000);
    flush();
    expect(vars.get("--mc-ax")).toBe("-1.000");
    expect(vars.get("--mc-ay")).toBe("-1.000");
  });

  it("never tilts for a finger", () => {
    const { el, classes, vars, listeners, parts } = fakeCard();
    mountTilt(el);
    move(listeners, 250, 300, "touch");
    flush();
    expect(classes.has("mc-eclat--active")).toBe(false);
    expect(vars.size).toBe(0);
    expect(transform(parts.tilt)).toBeUndefined();
  });

  it("turns the card toward the pointer and lifts every layer to its height on the first move", () => {
    const { el, listeners, parts, classes } = fakeCard();
    mountTilt(el);
    // nothing is written until the pointer is over the card
    expect(transform(parts.tilt)).toBeUndefined();
    move(listeners, 100 + 300, 200 + 0);
    flush();
    expect(classes.has("mc-eclat--enter")).toBe(true);
    expect(transform(parts.tilt)).toBe(tilt([1, 1]));
    expect(transform(parts.shadow)).toBe(shadow([1, 1]));
    expect(transform(parts.base)).toBe(depth(Z.base));
    expect(transform(parts.shirt)).toBe(depth(Z.shirt));
    expect(transform(parts.num)).toBe(depth(Z.num));
    expect(transform(parts.frame)).toBe(depth(Z.frame));
    expect(transform(parts.holo)).toBe(depth(Z.holo));
    expect(transform(parts.foil)).toBe(depth(Z.foil));
    expect(transform(parts.rimsGroup)).toBe(depth(RIM_PLANE));
    parts.rims.forEach((wall, i) => expect(transform(wall)).toBe(rim(i + 1, [1, 1])));
    expect(transform(parts.cast)).toBe(castDelta([1, 1], restLight(false)));
  });

  it("keeps the layers where they are on the moves after the first: only the light moves", () => {
    const { el, listeners, parts } = fakeCard();
    mountTilt(el);
    move(listeners, 400, 200);
    flush();
    const heights = [parts.base, parts.shirt, parts.frame, parts.foil].map(transform);
    parts.num.props.set("transform", "sentinel");
    move(listeners, 100, 685);
    flush();
    expect(transform(parts.tilt)).toBe(tilt([-1, -1]));
    expect(transform(parts.num)).toBe("sentinel");
    expect([parts.base, parts.shirt, parts.frame, parts.foil].map(transform)).toEqual(heights);
  });

  it("eases the parts under a mask itself, a frame at a time, until the light has arrived", () => {
    const { el, listeners, parts } = fakeCard();
    mountTilt(el);
    move(listeners, 400, 200);
    flush();
    // the first frame has moved them part of the way from the rest light, not all of it
    flush();
    const rest = follow("spec", restLight(false), false);
    const target = follow("spec", [1, 1], false);
    const first = transform(parts.spec)!;
    expect(first).not.toBe(rest);
    expect(first).not.toBe(target);
    // and a few frames later all the way
    flush(200);
    expect(frames.length).toBe(0);
    expect(transform(parts.spec)).toBe(target);
    for (const p of parts.foilShift) expect(transform(p)).toBe(follow("foil", [1, 1], false));
    expect(transform(parts.light)).toBe(follow("light", [1, 1], false));
    expect(transform(parts.hi)).toBe(follow("hi", [1, 1], false));
    expect(transform(parts.sh)).toBe(follow("sh", [1, 1], false));
    for (const p of parts.glintA) expect(p.props.get("opacity")).toBe(String(glintA([1, 1])));
    for (const p of parts.glintB) expect(p.props.get("opacity")).toBe(String(glintB([1, 1])));
    // the foil overlay reads the light itself
    expect(parts.foil.props.get("--mc-ax")).toBe("1.000");
    expect(parts.foil.props.get("--mc-ay")).toBe("1.000");
  });

  it("mirrors what the group's mirror does in Arabic", () => {
    const { el, listeners, parts } = fakeCard("rtl");
    mountTilt(el);
    move(listeners, 100, 200);
    flush(200);
    expect(transform(parts.spec)).toBe(follow("spec", [-1, 1], true));
    expect(transform(parts.spec)).toContain("translate(160px");
    expect(transform(parts.hi)).toBe(follow("hi", [-1, 1], true));
  });

  it("settles back to the rest light on leaving, in Arabic to the mirrored one", () => {
    for (const [dir, ax] of [
      ["ltr", "0.240"],
      ["rtl", "-0.240"],
    ] as const) {
      const { el, classes, vars, listeners, parts } = fakeCard(dir);
      mountTilt(el);
      move(listeners, 300, 300);
      flush();
      listeners.get("pointerleave")!({});
      expect(classes.has("mc-eclat--active")).toBe(false);
      expect(classes.has("mc-eclat--settle")).toBe(true);
      expect(vars.get("--mc-ax")).toBe(ax);
      expect(vars.get("--mc-ay")).toBe("0.640");
      // every part is sent to its rest pose, which the stylesheet's transitions ease to
      const rest = restLight(dir === "rtl");
      expect(transform(parts.tilt)).toBe(tilt(rest, 0));
      expect(transform(parts.base)).toBe(depth(Z.base, 0));
      expect(transform(parts.num)).toBe(depth(Z.num, 0));
      expect(transform(parts.rimsGroup)).toBe(depth(RIM_PLANE, 0));
      parts.rims.forEach((wall, i) => expect(transform(wall)).toBe(rimRest(i + 1, dir === "rtl")));
      expect(transform(parts.cast)).toBe("translate(0cqw, 0cqw)");
      expect(transform(parts.shadow)).toBe(shadow(rest));
      // the end of the card's own turn returns it to the flat stack, with nothing left inline
      listeners.get("transitionend")!({ target: parts.tilt, propertyName: "transform" });
      expect(classes.has("mc-eclat--settle")).toBe(false);
      expect(transform(parts.tilt)).toBeUndefined();
      expect(transform(parts.num)).toBeUndefined();
      expect(transform(parts.spec)).toBeUndefined();
      expect(parts.rims.every((w) => transform(w) === undefined)).toBe(true);
      expect(parts.foil.props.has("--mc-ax")).toBe(false);
      expect(parts.glintA[0]!.props.has("opacity")).toBe(false);
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

  it("floats with compositor animations of transforms only, after easing to the first pose", async () => {
    touch = true;
    const { el, parts } = fakeCard();
    mountTilt(el);
    observed!.cb([{ isIntersecting: true }]);
    // the layers lift and the card eases to the float's first pose; nothing is animated yet
    expect(transform(parts.num)).toBe(depth(Z.num));
    expect(transform(parts.tilt)).toBe(tilt([0.24, 0.64]));
    expect(parts.tilt.calls.length).toBe(0);
    await later();
    for (const p of [parts.tilt, parts.shadow, parts.cast, ...parts.rims]) {
      expect(p.calls.length, "one animation each").toBe(1);
      const { keyframes, options } = p.calls[0]!;
      expect(options).toMatchObject({
        duration: 7000,
        iterations: Infinity,
        direction: "alternate",
      });
      expect(keyframes).toHaveLength(3);
      // only transforms (and their easing and place in time), never a property that repaints
      for (const k of keyframes)
        for (const key of Object.keys(k)) expect(["transform", "easing", "offset"]).toContain(key);
    }
    expect(parts.tilt.calls[0]!.keyframes.map((k) => k.transform)).toEqual([
      tilt([0.24, 0.64]),
      tilt([-0.28, 0.38]),
      tilt([0.1, 0.2]),
    ]);
    // the parts under a mask do not float: they are repainted, so they stay at their rest pose
    for (const p of [parts.spec, parts.hi, parts.light, ...parts.foilShift])
      expect(transform(p)).toBeUndefined();
    expect(parts.foil.props.has("--mc-ax")).toBe(false);
    expect(parts.spec.calls.length).toBe(0);
  });

  it("mirrors the float in Arabic", async () => {
    touch = true;
    const { el, parts } = fakeCard("rtl");
    mountTilt(el);
    observed!.cb([{ isIntersecting: true }]);
    await later();
    expect(parts.tilt.calls[0]!.keyframes.map((k) => k.transform)).toEqual([
      tilt([-0.24, 0.64]),
      tilt([0.28, 0.38]),
      tilt([-0.1, 0.2]),
    ]);
  });

  it("stops the float and goes flat when the card leaves the screen", async () => {
    touch = true;
    const { el, parts, classes } = fakeCard();
    mountTilt(el);
    observed!.cb([{ isIntersecting: true }]);
    await later();
    observed!.cb([{ isIntersecting: false }]);
    expect(classes.has("mc-eclat--idle")).toBe(false);
    expect(parts.tilt.animations.every((a) => a.cancelled)).toBe(true);
    expect(parts.rims.every((w) => w.animations.every((a) => a.cancelled))).toBe(true);
    expect(transform(parts.tilt)).toBeUndefined();
    expect(transform(parts.num)).toBeUndefined();
  });

  it("lets a pen take over from the float where it is", async () => {
    touch = true;
    const { el, parts, listeners, classes } = fakeCard();
    mountTilt(el);
    observed!.cb([{ isIntersecting: true }]);
    await later();
    move(listeners, 300, 300, "pen");
    flush();
    expect(classes.has("mc-eclat--active")).toBe(true);
    // the float's pose is kept (committed) before it is cancelled, so the card does not jump
    expect(parts.tilt.animations.every((a) => a.committed && a.cancelled)).toBe(true);
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

  it("removes its listeners, its observer, its classes and everything it wrote on cleanup", () => {
    touch = true;
    const { el, classes, vars, listeners, parts } = fakeCard();
    const stop = mountTilt(el);
    move(listeners, 300, 300);
    flush();
    observed!.cb([{ isIntersecting: true }]);
    expect(classes.size).toBeGreaterThan(0);
    stop();
    expect(listeners.size).toBe(0);
    expect(classes.size).toBe(0);
    expect(vars.size).toBe(0);
    expect(observed!.disconnected).toBe(true);
    for (const p of [
      parts.tilt,
      parts.shadow,
      parts.foil,
      parts.num,
      parts.rimsGroup,
      parts.cast,
      parts.spec,
      ...parts.rims,
    ])
      expect(p.props.size, "nothing inline is left").toBe(0);
  });

  it("pauses the float while the page is hidden and resumes it when the card is still on screen", () => {
    touch = true;
    const { el, classes } = fakeCard();
    const stop = mountTilt(el);
    observed!.cb([{ isIntersecting: true }]);
    expect(classes.has("mc-eclat--idle")).toBe(true);
    page.hidden = true;
    page.listeners.get("visibilitychange")!();
    expect(classes.has("mc-eclat--idle")).toBe(false);
    page.hidden = false;
    page.listeners.get("visibilitychange")!();
    expect(classes.has("mc-eclat--idle")).toBe(true);
    // a page that comes back while the card is off screen does not start it
    observed!.cb([{ isIntersecting: false }]);
    page.listeners.get("visibilitychange")!();
    expect(classes.has("mc-eclat--idle")).toBe(false);
    // a card seen while the page is hidden does not float until the page is shown
    page.hidden = true;
    observed!.cb([{ isIntersecting: true }]);
    expect(classes.has("mc-eclat--idle")).toBe(false);
    stop();
    expect(page.listeners.size).toBe(0);
  });

  it("listens to the page only on a touch-only screen", () => {
    const { el } = fakeCard();
    mountTilt(el);
    expect(page.listeners.size).toBe(0);
    expect(observed).toBeNull();
  });

  it("settles when the pointer is cancelled as it does when it leaves", () => {
    const { el, classes, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, 300, 300);
    flush();
    listeners.get("pointercancel")!({});
    expect(classes.has("mc-eclat--active")).toBe(false);
    expect(classes.has("mc-eclat--settle")).toBe(true);
  });

  it("writes one light per frame: the last position of the frame wins", () => {
    const { el, vars, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, 100, 200);
    move(listeners, 250, 442.5);
    flush();
    expect(vars.get("--mc-ax")).toBe("0.000");
    expect(vars.get("--mc-ay")).toBe("0.000");
  });

  it("ignores a card with no size (hidden, not laid out) and a pointer that is not a mouse or a pen", () => {
    const { el, classes, vars, listeners, root } = fakeCard();
    root.getBoundingClientRect = () => ({ left: 0, top: 0, width: 0, height: 0 });
    mountTilt(el);
    move(listeners, 5, 5);
    flush();
    expect(classes.size).toBe(0);
    expect(vars.size).toBe(0);
  });

  it("returns to the flat stack by its own timer when no transition ends, and not if the pointer is back", async () => {
    const { el, classes, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, 300, 300);
    flush();
    listeners.get("pointerleave")!({});
    expect(classes.has("mc-eclat--settle")).toBe(true);
    await later();
    expect(classes.has("mc-eclat--settle")).toBe(false);
    // back over the card before the end of the settle: no flat stack under the pointer
    listeners.get("pointerleave")!({});
    move(listeners, 300, 300);
    flush();
    await later();
    expect(classes.has("mc-eclat--active")).toBe(true);
    expect(classes.has("mc-eclat--settle")).toBe(false);
  });

  it("only the card's own turn ends the settle, not another property or another element", () => {
    const { el, classes, listeners, parts } = fakeCard();
    mountTilt(el);
    listeners.get("pointerleave")!({});
    listeners.get("transitionend")!({ target: parts.tilt, propertyName: "opacity" });
    listeners.get("transitionend")!({ target: {}, propertyName: "transform" });
    expect(classes.has("mc-eclat--settle")).toBe(true);
    listeners.get("transitionend")!({ target: parts.tilt, propertyName: "transform" });
    expect(classes.has("mc-eclat--settle")).toBe(false);
  });

  it("takes the depth's time for the first turn and a short lag after it", async () => {
    const { el, classes, listeners } = fakeCard();
    mountTilt(el);
    move(listeners, 300, 300);
    flush();
    expect(classes.has("mc-eclat--enter")).toBe(true);
    await later();
    expect(classes.has("mc-eclat--enter")).toBe(false);
    expect(classes.has("mc-eclat--active")).toBe(true);
  });

  it("can be cleaned up twice", () => {
    const { el } = fakeCard();
    const stop = mountTilt(el);
    stop();
    expect(() => stop()).not.toThrow();
  });
});
