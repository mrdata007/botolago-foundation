import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { BEAT_CAP_MS } from "../eclat/beats";
import { BURST_MS, burstShouldStart, burstSpec } from "./burst";

describe("the tier-up burst per tier", () => {
  const stade = burstSpec("stade")!;
  const pro = burstSpec("pro")!;
  const champion = burstSpec("champion")!;
  const legend = burstSpec("legend")!;

  it("grows with the tier in every measure: STADE < PRO < CHAMPION < LEGEND", () => {
    const ladder = [stade, pro, champion, legend];
    for (let i = 1; i < ladder.length; i += 1) {
      expect(ladder[i]!.peak).toBeGreaterThan(ladder[i - 1]!.peak);
      expect(ladder[i]!.rays).toBeGreaterThan(ladder[i - 1]!.rays);
      expect(ladder[i]!.reach).toBeGreaterThan(ladder[i - 1]!.reach);
    }
    expect(legend.peak).toBe(1);
  });

  it("keeps LEGEND's prism, and only LEGEND has one", () => {
    expect([stade, pro, champion].some((spec) => spec.prism)).toBe(false);
    expect(legend.prism).toBe(true);
  });

  it("has an even number of beams, so the pattern mirrors left to right (Arabic needs no flip)", () => {
    for (const spec of [stade, pro, champion, legend]) expect(spec.rays % 2).toBe(0);
  });

  it("has none for the lowest tier or for no tier: a card starts there, it never rises to it", () => {
    expect(burstSpec("homa")).toBeNull();
    expect(burstSpec(null)).toBeNull();
  });

  it("outlasts the card's own beat (600 ms) but takes about 1.2 s at most", () => {
    expect(BURST_MS).toBeGreaterThan(BEAT_CAP_MS);
    expect(BURST_MS).toBeLessThanOrEqual(1200);
  });
});

describe("when the burst starts", () => {
  const ready = {
    spec: burstSpec("pro"),
    beat: "tier",
    rendererReady: true,
    reducedMotion: false,
    hidden: false,
    alreadyPlayed: false,
  };

  it("starts with the hero's tier beat, and with LEGEND's", () => {
    expect(burstShouldStart(ready)).toBe(true);
    expect(burstShouldStart({ ...ready, spec: burstSpec("legend"), beat: "legend" })).toBe(true);
  });

  it("never starts for another beat, before the card is drawn, under reduced motion, hidden or twice", () => {
    expect(burstShouldStart({ ...ready, beat: "first" })).toBe(false);
    expect(burstShouldStart({ ...ready, beat: undefined })).toBe(false);
    expect(burstShouldStart({ ...ready, rendererReady: false })).toBe(false);
    expect(burstShouldStart({ ...ready, reducedMotion: true })).toBe(false);
    expect(burstShouldStart({ ...ready, hidden: true })).toBe(false);
    expect(burstShouldStart({ ...ready, alreadyPlayed: true })).toBe(false);
    expect(burstShouldStart({ ...ready, spec: null })).toBe(false);
  });
});

describe("the burst's stylesheet", () => {
  const css = readFileSync(join(import.meta.dir, "tier-burst.css"), "utf8");
  const keyframes = [...css.matchAll(/@keyframes\s+([\w-]+)\s*\{/g)];

  it("declares its keyframes only inside the no-preference block", () => {
    const at = css.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(at).toBeGreaterThan(-1);
    expect(keyframes.length).toBeGreaterThan(0);
    for (const match of keyframes) expect(match.index!).toBeGreaterThan(at);
  });

  it("moves opacity and scale only: no other property in a keyframe", () => {
    const body = css.slice(css.indexOf("@media (prefers-reduced-motion: no-preference)"));
    const declared = new Set(
      [...body.matchAll(/@keyframes[\s\S]*?\n {2}\}\n/g)].flatMap((block) =>
        [...block[0].matchAll(/^\s+([a-z-]+):/gm)].map((m) => m[1]),
      ),
    );
    expect([...declared].sort()).toEqual(["opacity", "transform"]);
    expect(css).not.toMatch(/rotate|translate\(|skew/);
  });

  it("is at rest (invisible) outside the animation", () => {
    expect(css).toMatch(/\.mc-burst__rays,?[\s\S]*?opacity: 0;/);
  });
});
