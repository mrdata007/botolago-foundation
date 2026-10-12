import { describe, expect, it } from "bun:test";

import { bell, springAt, springEasing, springFrames, springOvershoot } from "./spring";

describe("the spring", () => {
  it("starts at 0, ends at exactly 1 and has settled before the end", () => {
    for (const zeta of [0.3, 0.5, 0.7, 1, 1.2]) {
      expect(springAt(0, zeta)).toBe(0);
      expect(springAt(1, zeta)).toBe(1);
      expect(Math.abs(springAt(0.98, zeta) - 1)).toBeLessThan(0.02);
    }
  });

  it("overshoots only when under-damped, and less the more it is damped", () => {
    expect(springOvershoot(1)).toBe(0);
    expect(springOvershoot(0.7)).toBeGreaterThan(0);
    expect(springOvershoot(0.4)).toBeGreaterThan(springOvershoot(0.7));
    // a small overshoot: a card landing, not a rubber band
    expect(springOvershoot(0.6)).toBeLessThan(0.15);
  });

  it("is sampled into keyframes that begin and end exactly at rest", () => {
    const frames = springFrames(0.6, 20, (p) => ({ opacity: p }));
    expect(frames).toHaveLength(21);
    expect(frames[0]).toMatchObject({ opacity: 0, offset: 0 });
    expect(frames[20]).toMatchObject({ opacity: 1, offset: 1 });
    const offsets = frames.map((f) => f.offset as number);
    expect([...offsets].sort((a, b) => a - b)).toEqual(offsets);
  });

  it("is also a CSS linear() easing from 0 to 1", () => {
    const easing = springEasing(0.6);
    expect(easing.startsWith("linear(0, ")).toBe(true);
    expect(easing.endsWith(", 1)")).toBe(true);
  });

  it("has a bell for a lift that comes back down", () => {
    expect(bell(0)).toBe(0);
    expect(bell(0.5)).toBe(1);
    expect(bell(1)).toBeLessThan(1e-9);
  });
});
