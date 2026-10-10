import { describe, expect, it } from "bun:test";

import {
  ENTRANCE_MAX_MS,
  ENTRANCE_MIN_MS,
  entranceDecision,
  entranceFrames,
  entranceMs,
  groundFrames,
  type EntranceGate,
} from "./entrance";

const GATE: EntranceGate = {
  enabled: true,
  reducedMotion: false,
  playedThisSession: false,
  presentAtFirstPaint: false,
  heroDue: false,
  launchGateOpen: true,
};

describe("when the stage's entrance plays", () => {
  it("plays once for a card that arrives in the page, and spends the visit's entrance", () => {
    expect(entranceDecision(GATE)).toEqual({ play: true, remember: true });
  });

  it("never plays on a screen that did not ask for it, and spends nothing there", () => {
    expect(entranceDecision({ ...GATE, enabled: false })).toEqual({ play: false, remember: false });
  });

  it("never plays under reduced motion", () => {
    expect(entranceDecision({ ...GATE, reducedMotion: true }).play).toBe(false);
  });

  it("does not play twice in a session", () => {
    expect(entranceDecision({ ...GATE, playedThisSession: true })).toEqual({
      play: false,
      remember: false,
    });
  });

  it("skips a card the server render already drew (it would flash away and back), for the visit", () => {
    expect(entranceDecision({ ...GATE, presentAtFirstPaint: true })).toEqual({
      play: false,
      remember: true,
    });
  });

  it("skips while a hero is, or is about to be, the visit's moment", () => {
    expect(entranceDecision({ ...GATE, heroDue: true })).toEqual({ play: false, remember: true });
  });

  it("waits for the splash and the language chooser, and keeps the entrance for a later arrival", () => {
    expect(entranceDecision({ ...GATE, launchGateOpen: false })).toEqual({
      play: false,
      remember: false,
    });
  });
});

describe("how long it takes", () => {
  it("is the hero token a little stretched, never under 420 ms nor over 600 ms", () => {
    expect(entranceMs(420)).toBe(525);
    expect(entranceMs(100)).toBe(ENTRANCE_MIN_MS);
    expect(entranceMs(2000)).toBe(ENTRANCE_MAX_MS);
    expect(entranceMs(Number.NaN)).toBe(ENTRANCE_MIN_MS);
  });
});

describe("what it moves", () => {
  const frames = entranceFrames(1);

  it("moves opacity and transform only", () => {
    for (const frame of [...frames, ...groundFrames()]) {
      expect(
        Object.keys(frame)
          .filter((key) => key !== "offset" && key !== "easing")
          .sort(),
      ).toEqual(["opacity", "transform"]);
    }
  });

  it("starts hidden and low, and ends in the rest state (no turn, no lift, full size)", () => {
    expect(frames[0]!.opacity).toBe(0);
    const last = frames[frames.length - 1]!;
    expect(last.opacity).toBe(1);
    expect(last.transform).toBe(
      "perspective(1100px) translateY(0px) rotateX(0deg) rotateY(0deg) scale(1)",
    );
  });

  it("uses the same transform functions in every frame, so they interpolate", () => {
    const names = (t: unknown) => [...String(t).matchAll(/([a-zA-Z]+)\(/g)].map((m) => m[1]);
    for (const frame of frames) expect(names(frame.transform)).toEqual(names(frames[0]!.transform));
  });

  it("leans the settling turn the other way in Arabic, and nothing else changes", () => {
    const rtl = entranceFrames(-1);
    expect(String(frames[0]!.transform)).toContain("rotateY(-9deg)");
    expect(String(rtl[0]!.transform)).toContain("rotateY(9deg)");
    expect(String(rtl[0]!.transform).replace("rotateY(9deg)", "rotateY(-9deg)")).toBe(
      String(frames[0]!.transform),
    );
  });

  it("has a ground shadow that grows from small and is gone at the end", () => {
    const ground = groundFrames();
    expect(ground[0]!.opacity).toBe(0);
    expect(ground[ground.length - 1]!.opacity).toBe(0);
    expect(String(ground[0]!.transform)).toContain("scale(0.55");
  });
});
