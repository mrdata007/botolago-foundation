import { describe, expect, test } from "bun:test";

import { APP_SHORT_URL } from "@/lib/app-download";

import { drawQr } from "./qr";

describe("drawQr", () => {
  const qr = drawQr(APP_SHORT_URL);

  test("draws the short address at a size a phone reads from a screen", () => {
    // Version 3 (29 modules) at error correction H: small enough that each
    // module is about 5px on the 15.5rem plate.
    expect(qr.size).toBe(29);
    expect(qr.quiet).toBe(4);
    expect(qr.path.length).toBeGreaterThan(0);
  });

  test("the mark's window clears well under what level H recovers", () => {
    expect(qr.windowShare).toBeLessThan(0.1);
    const { x, y, w, h } = qr.window;
    expect(w % 2).toBe(1);
    expect(h % 2).toBe(1);
    expect(x + w / 2).toBe(qr.size / 2);
    expect(y + h / 2).toBe(qr.size / 2);
  });

  test("the window keeps clear of the corner patterns and the timing lines", () => {
    const { x, y, w, h } = qr.window;
    expect(x).toBeGreaterThan(7);
    expect(y).toBeGreaterThan(7);
    expect(x + w).toBeLessThan(qr.size - 7);
    expect(y + h).toBeLessThan(qr.size - 7);
  });

  test("the three corner patterns sit at the three corners", () => {
    expect(qr.finders).toEqual([
      [0, 0],
      [qr.size - 7, 0],
      [0, qr.size - 7],
    ]);
  });
});
