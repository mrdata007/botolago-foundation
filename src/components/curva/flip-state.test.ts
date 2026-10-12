import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { readFileSync } from "node:fs";

import { FLIP_MS, faceShade, flipFrames, shadeFrames, tiltAllowed } from "./flip-state";

describe("when the card's own tilt and float may run", () => {
  it("runs at rest on the front", () => {
    expect(tiltAllowed({ back: false, turning: false, entering: false })).toBe(true);
  });
  it("is off while the back shows", () => {
    expect(tiltAllowed({ back: true, turning: false, entering: false })).toBe(false);
  });
  it("is off while the card turns, including the turn back to the front (back already false)", () => {
    expect(tiltAllowed({ back: false, turning: true, entering: false })).toBe(false);
    expect(tiltAllowed({ back: true, turning: true, entering: false })).toBe(false);
  });
  it("is off while the entrance plays", () => {
    expect(tiltAllowed({ back: false, turning: false, entering: true })).toBe(false);
  });
});

describe("the stage uses it", () => {
  it("passes the gate to the flippable card's tilt", () => {
    const source = readFileSync(`${import.meta.dir}/CardStage.tsx`, "utf8");
    expect(source).toContain("tilt={tiltAllowed({ back, turning, entering: stage.entering })}");
  });
});

describe("how long the card takes to turn", () => {
  // Changed on the owner's approval of the collectible motion (docs/engineering/
  // MANAGER_CARD_COLLECTIBLE_MOTION.md): the turn was a 340 ms transition (the card looked squashed
  // flat and swapped); it is a spring of about half a second.
  it("is about half a second: a spring of 450 to 600 ms", () => {
    expect(FLIP_MS).toBeGreaterThanOrEqual(450);
    expect(FLIP_MS).toBeLessThanOrEqual(600);
  });
  it("is the stage's animation and the timer behind it, and reads no style in the click", () => {
    const source = readFileSync(`${import.meta.dir}/CardStage.tsx`, "utf8");
    expect(source).toContain("duration: FLIP_MS");
    expect(source).toContain("FLIP_MS + 120");
    expect(source).not.toContain("tokenMs");
  });
});

describe("what the turn moves", () => {
  it("is transform on the box and opacity on the shades, and ends at rest on the face it turns to", () => {
    for (const [from, to] of [
      [0, 180],
      [180, 0],
    ] as const) {
      const frames = flipFrames(from, to, 1);
      expect(frames[0]!.transform).toBe(`translateZ(0px) rotateY(${from}deg)`);
      expect(frames[frames.length - 1]!.transform).toBe(`translateZ(0px) rotateY(${to}deg)`);
      for (const frame of frames)
        expect(Object.keys(frame).filter((k) => k !== "offset")).toEqual(["transform"]);
      for (const face of [0, 180] as const)
        for (const frame of shadeFrames(from, to, face))
          expect(Object.keys(frame).filter((k) => k !== "offset")).toEqual(["opacity"]);
    }
  });
  it("lifts the card mid-turn and puts it back down", () => {
    const lifts = flipFrames(0, 180, 1).map((f) =>
      Number(/translateZ\((-?[\d.]+)px/.exec(String(f.transform))![1]),
    );
    expect(Math.max(...lifts)).toBeGreaterThan(60);
    expect(lifts[0]).toBe(0);
    expect(lifts[lifts.length - 1]).toBe(0);
  });
  it("passes its end a little and comes back (a spring, not an ease)", () => {
    const angles = flipFrames(0, 180, 1).map((f) =>
      Number(/rotateY\((-?[\d.]+)deg/.exec(String(f.transform))![1]),
    );
    expect(Math.max(...angles)).toBeGreaterThan(180);
    expect(Math.max(...angles)).toBeLessThan(200);
  });
  it("turns the other way in Arabic", () => {
    expect(String(flipFrames(0, 180, -1).at(-1)!.transform)).toContain("rotateY(-180deg)");
  });
  it("darkens a face edge-on and not when it faces the reader", () => {
    expect(faceShade(0, 0)).toBe(0);
    expect(faceShade(90, 0)).toBeGreaterThan(0.4);
    expect(faceShade(180, 180)).toBe(0);
    expect(faceShade(90, 180)).toBeGreaterThan(0.4);
  });
});
