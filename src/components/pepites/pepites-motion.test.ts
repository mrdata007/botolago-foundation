import { describe, expect, it } from "bun:test";

import { revealCountFrom } from "./pepites-motion";

describe("revealCountFrom", () => {
  it("starts a little under the score, at least 3 below", () => {
    expect(revealCountFrom(78)).toBe(69);
    expect(revealCountFrom(20)).toBe(17);
    expect(revealCountFrom(8)).toBe(5);
  });

  it("keeps the score's number of digits, so the figure keeps its width", () => {
    expect(revealCountFrom(100)).toBe(100);
    expect(revealCountFrom(11)).toBe(10);
    expect(String(revealCountFrom(99)).length).toBe(2);
  });

  it("never goes under 0", () => {
    expect(revealCountFrom(2)).toBe(0);
    expect(revealCountFrom(0)).toBe(0);
  });
});
