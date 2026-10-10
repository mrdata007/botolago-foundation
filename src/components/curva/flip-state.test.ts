import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { readFileSync } from "node:fs";

import { FLIP_MS, tiltAllowed } from "./flip-state";

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
  it("is 340 ms: a turn that answers a tap is over before the reader looks for it", () => {
    expect(FLIP_MS).toBe(340);
  });
  it("is the stage's transition and the timer behind it, and reads no style in the click", () => {
    const source = readFileSync(`${import.meta.dir}/CardStage.tsx`, "utf8");
    expect(source).toContain("transitionDuration: `${FLIP_MS}ms`");
    expect(source).toContain("FLIP_MS + 120");
    expect(source).not.toContain("tokenMs");
  });
});
