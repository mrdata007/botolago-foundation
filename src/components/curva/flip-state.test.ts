import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { readFileSync } from "node:fs";

import { backMounted, FLIP_MS, tiltAllowed } from "./flip-state";

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

describe("the back face's content", () => {
  it("is not in the page at rest on the front", () => {
    expect(backMounted({ armed: false, back: false, turning: false })).toBe(false);
  });
  it("is drawn as soon as the reader reaches for the button, before the turn needs it", () => {
    expect(backMounted({ armed: true, back: false, turning: false })).toBe(true);
  });
  it("stays while the back shows and while the card turns, either way", () => {
    expect(backMounted({ armed: false, back: true, turning: false })).toBe(true);
    expect(backMounted({ armed: false, back: false, turning: true })).toBe(true);
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
  it("mounts the back's content only for a reader who reaches for the button", () => {
    const source = readFileSync(`${import.meta.dir}/CardStage.tsx`, "utf8");
    expect(source).toContain("backMounted({ armed, back, turning })");
    for (const handler of ["onPointerEnter", "onPointerDown", "onFocus"])
      expect(source).toContain(`${handler}={() => setArmed(true)}`);
  });
});
