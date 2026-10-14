import { afterEach, beforeEach, describe, expect, it } from "bun:test";

import { mountShieldTilt } from "./tilt";

/** A small stand-in for the DOM the tilt touches: classes, inline style, listeners, one child. */
class FakeElement {
  classes = new Set<string>();
  props = new Map<string, string>();
  attrs = new Map<string, string>();
  listeners = new Map<string, ((event: unknown) => void)[]>();
  children: FakeElement[] = [];
  classList = {
    add: (...names: string[]) => names.forEach((n) => this.classes.add(n)),
    remove: (...names: string[]) => names.forEach((n) => this.classes.delete(n)),
    contains: (name: string) => this.classes.has(name),
    toggle: (name: string, on: boolean) =>
      on ? this.classes.add(name) : this.classes.delete(name),
  };
  style = {
    setProperty: (k: string, v: string) => this.props.set(k, v),
    removeProperty: (k: string) => this.props.delete(k),
    get transform() {
      return "";
    },
  } as unknown as CSSStyleDeclaration & { transform: string };
  constructor(...classes: string[]) {
    classes.forEach((c) => this.classes.add(c));
    let transform = "";
    Object.defineProperty(this.style, "transform", {
      get: () => transform,
      set: (v: string) => (transform = v),
    });
    (this.style as unknown as { removeProperty: (k: string) => void }).removeProperty = (k) => {
      if (k === "transform") transform = "";
      this.props.delete(k);
    };
  }
  get firstElementChild() {
    return this.children[0] ?? null;
  }
  hasAttribute(name: string) {
    return this.attrs.has(name);
  }
  querySelector(selector: string) {
    return this.children.find((c) => c.classes.has(selector.slice(1))) ?? null;
  }
  addEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), fn]);
  }
  removeEventListener(type: string, fn: (event: unknown) => void) {
    this.listeners.set(
      type,
      (this.listeners.get(type) ?? []).filter((f) => f !== fn),
    );
  }
  fire(type: string, event: object) {
    for (const fn of this.listeners.get(type) ?? []) fn(event);
  }
  getBoundingClientRect() {
    return { left: 0, top: 0, width: 200, height: 273 };
  }
}

const media: Record<string, boolean> = {};
const g = globalThis as unknown as Record<string, unknown>;
let frames: (() => void)[] = [];

beforeEach(() => {
  for (const key of Object.keys(media)) delete media[key];
  frames = [];
  g.window = {
    matchMedia: (q: string) => ({ matches: !!media[q] }),
    setTimeout: (fn: () => void) => (fn(), 1),
    clearTimeout: () => undefined,
  };
  g.requestAnimationFrame = (fn: () => void) => (frames.push(fn), frames.length);
  g.cancelAnimationFrame = () => undefined;
  g.document = { hidden: false, addEventListener() {}, removeEventListener() {} };
});
afterEach(() => {
  delete g.window;
  delete g.requestAnimationFrame;
  delete g.cancelAnimationFrame;
  delete g.document;
});

function card() {
  const host = new FakeElement();
  const root = new FakeElement("mc-shield");
  const tilt = new FakeElement("mc-shield__tilt");
  root.children.push(tilt);
  host.children.push(root);
  return { host, root, tilt };
}
const flush = () => {
  for (let i = 0; i < 60 && frames.length; i++) frames.shift()!();
};

describe("the shield's tilt", () => {
  it("turns toward a mouse and writes the light, then settles back to a flat card with nothing left", () => {
    const { host, root, tilt } = card();
    const stop = mountShieldTilt(host as unknown as HTMLElement);
    root.fire("pointermove", { pointerType: "mouse", clientX: 20, clientY: 40 });
    flush();
    expect(root.classes.has("mc-shield--active")).toBe(true);
    expect(Number(root.props.get("--mc-ax"))).toBeLessThan(0);
    expect(tilt.style.transform).toMatch(/^rotateX\(.*deg\) rotateY\(-.*deg\)$/);
    root.fire("pointerleave", { pointerType: "mouse" });
    // (the settle's timer runs at once here)
    expect(root.classes.has("mc-shield--active")).toBe(false);
    expect(root.classes.has("mc-shield--settle")).toBe(false);
    expect(tilt.style.transform).toBe("");
    expect(root.props.size).toBe(0);
    stop();
    expect(root.listeners.get("pointermove")).toEqual([]);
  });

  it("never tilts for a finger", () => {
    const { host, root } = card();
    mountShieldTilt(host as unknown as HTMLElement);
    root.fire("pointermove", { pointerType: "touch", clientX: 20, clientY: 40 });
    flush();
    expect(root.classes.size).toBe(1);
  });

  it("floats on a touch-only screen, and stops on cleanup", () => {
    media["(hover: none)"] = true;
    const { host, root } = card();
    const stop = mountShieldTilt(host as unknown as HTMLElement);
    expect(root.classes.has("mc-shield--idle")).toBe(true);
    stop();
    expect(root.classes.has("mc-shield--idle")).toBe(false);
  });

  it("does nothing under reduced motion, on a card playing a beat, or with no card", () => {
    media["(prefers-reduced-motion: reduce)"] = true;
    const a = card();
    mountShieldTilt(a.host as unknown as HTMLElement);
    a.root.fire("pointermove", { pointerType: "mouse", clientX: 20, clientY: 40 });
    expect(a.root.classes.size).toBe(1);
    delete media["(prefers-reduced-motion: reduce)"];
    const b = card();
    b.root.attrs.set("data-mc-beat", "make");
    mountShieldTilt(b.host as unknown as HTMLElement);
    expect(b.root.listeners.size).toBe(0);
    expect(mountShieldTilt(null)()).toBeUndefined();
  });
});
