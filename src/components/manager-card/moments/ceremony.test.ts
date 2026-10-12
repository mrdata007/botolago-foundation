import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  CEREMONY_MS,
  FADE_AT_MS,
  IMPACT_MS,
  SPIN_DEGREES,
  SPIN_MS,
  STAMP_AT_MS,
  STAMP_MS,
  BURST_RUN_MS,
  dimFrames,
  spinFrames,
  stampFrames,
  thudFrames,
} from "./ceremony";

describe("the tier-up ceremony's timeline", () => {
  it("is over in 1.6 s at the most, and the burst and the stamp fit inside it", () => {
    expect(CEREMONY_MS).toBeLessThanOrEqual(1600);
    expect(IMPACT_MS + BURST_RUN_MS).toBeLessThanOrEqual(CEREMONY_MS);
    expect(STAMP_AT_MS + STAMP_MS).toBeLessThanOrEqual(FADE_AT_MS);
    expect(SPIN_MS).toBeLessThanOrEqual(FADE_AT_MS);
  });

  it("lands before the spin ends: the impact is mid-way through the settle", () => {
    expect(IMPACT_MS).toBeGreaterThan(300);
    expect(IMPACT_MS).toBeLessThan(SPIN_MS);
  });
});

describe("what it moves", () => {
  const only = (frames: Keyframe[], keys: string[]) => {
    for (const frame of frames)
      expect(
        Object.keys(frame)
          .filter((k) => k !== "offset" && k !== "easing")
          .sort(),
      ).toEqual(keys);
  };

  it("moves transform and opacity only", () => {
    only(spinFrames(1), ["transform"]); // no opacity: it would flatten the 3D context
    only(thudFrames(), ["opacity", "transform"]);
    only(stampFrames(1), ["opacity", "transform"]);
    only(dimFrames(), ["opacity"]);
  });

  it("spins the card once, lands it flat and at rest, and never shows it still turning at the end", () => {
    const frames = spinFrames(1);
    expect(String(frames[0]!.transform)).toContain(`rotateY(${SPIN_DEGREES}deg)`);
    const last = frames[frames.length - 1]!;
    expect(last.transform).toBe("translateY(0px) translateZ(0px) rotateY(0deg) scale(1)");
  });

  it("presses the card past its place at the impact (smaller than rest, a little low) and comes back", () => {
    const frames = spinFrames(1);
    const scales = frames.map((f) => Number(/scale\(([\d.]+)\)/.exec(String(f.transform))![1]));
    expect(Math.min(...scales)).toBeLessThan(1);
    expect(Math.min(...scales)).toBeGreaterThan(0.9);
    const ys = frames.map((f) => Number(/translateY\((-?[\d.]+)px/.exec(String(f.transform))![1]));
    expect(Math.max(...ys)).toBeGreaterThan(0);
  });

  it("turns the other way in Arabic", () => {
    expect(String(spinFrames(-1)[0]!.transform)).toContain(`rotateY(${-SPIN_DEGREES}deg)`);
  });

  it("thuds the ground shadow at the impact and is gone at the end", () => {
    const frames = thudFrames();
    const top = frames.reduce((a, b) => (Number(b.opacity) > Number(a.opacity) ? b : a));
    expect(top.offset! * SPIN_MS).toBeCloseTo(IMPACT_MS, -1);
    expect(frames[frames.length - 1]!.opacity).toBe(0);
  });

  it("dims in fast, holds, and fades out before the end", () => {
    const frames = dimFrames();
    expect(frames[1]!.offset! * CEREMONY_MS).toBeLessThan(300);
    expect(frames[2]!.offset! * CEREMONY_MS).toBeCloseTo(FADE_AT_MS, -1);
    expect(frames[frames.length - 1]!.opacity).toBe(0);
  });

  it("slams the stamp on from big and ends at rest, a hair off true", () => {
    const frames = stampFrames(1);
    expect(String(frames[0]!.transform)).toContain("scale(2.7)");
    expect(frames[frames.length - 1]!.transform).toBe("scale(1) rotate(-3deg)");
  });
});

describe("the ceremony's stylesheet", () => {
  const css = readFileSync(join(import.meta.dir, "ceremony.css"), "utf8");
  it("keeps keyframes out of the reduced-motion case, if it has any", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    for (const match of css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g))
      expect(match.index!).toBeGreaterThan(at);
  });
});
