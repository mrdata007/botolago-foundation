import { describe, expect, it } from "bun:test";

import { confettiPieces } from "./ConfettiBurst";

describe("confettiPieces", () => {
  it("makes the same burst every time", () => {
    expect(confettiPieces()).toEqual(confettiPieces());
  });

  it("makes two dozen pieces that fan out and fall", () => {
    const pieces = confettiPieces();
    expect(pieces).toHaveLength(24);
    expect(pieces.some((p) => p.dx > 0)).toBe(true);
    expect(pieces.some((p) => p.dx < 0)).toBe(true);
    expect(pieces.every((p) => p.dy > -40)).toBe(true);
    expect(pieces.every((p) => p.delay >= 0 && p.delay <= 80)).toBe(true);
  });

  it("spreads the colours", () => {
    expect(new Set(confettiPieces().map((p) => p.colour)).size).toBe(4);
  });
});
