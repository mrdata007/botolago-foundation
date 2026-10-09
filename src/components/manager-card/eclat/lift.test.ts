import { describe, expect, it } from "bun:test";

import { CAST_BOX, liftCard, runs } from "./lift";

/** A box as `getBBox` gives it. */
const box = (x: number, y: number, width: number, height: number) => ({ x, y, width, height });

describe("lifting the parts that follow the light out of their layers (lift.ts)", () => {
  it("keeps a crease and its highlight in one run and creases that lie apart in different ones", () => {
    // the shirt's crease filter, in order: left crease (dark, light), right crease, the chest crease
    // (highlight, dark, light), the hem, the two sleeves (each dark, light): measured with getBBox
    const creases = [
      box(300, 520, 32, 250),
      box(300, 520, 32, 250),
      box(668, 520, 32, 250),
      box(668, 520, 32, 250),
      box(504, 400, 8, 462),
      box(470, 560, 6, 300),
      box(470, 560, 6, 300),
      box(300, 838, 400, 14),
      box(300, 838, 400, 14),
      box(232, 470, 64, 70),
      box(232, 470, 64, 70),
      box(704, 470, 64, 70),
      box(704, 470, 64, 70),
    ];
    const r = runs(creases);
    // every box is in exactly one run, in order
    expect(r.flat()).toEqual(creases.map((_, i) => i));
    // a dark crease and its light twin never part
    expect(r).toContainEqual([0, 1]);
    expect(r).toContainEqual([2, 3]);
    expect(r).toContainEqual([7, 8]);
    expect(r).toContainEqual([9, 10]);
    expect(r).toContainEqual([11, 12]);
    // and no run reaches across the shirt: that is what the browser splits into layers of its own
    for (const members of r) {
      const xs = members.map((i) => creases[i]!.x);
      const xe = members.map((i) => creases[i]!.x + creases[i]!.width);
      expect(Math.max(...xe) - Math.min(...xs)).toBeLessThan(420);
    }
    expect(r.length).toBeGreaterThanOrEqual(5);
  });

  it("keeps three overlapping ellipses (the shoulders' light and the chest's shade) in one run", () => {
    const ellipses = [box(325, 355, 190, 110), box(495, 355, 190, 110), box(310, 490, 380, 60)];
    expect(runs(ellipses)).toEqual([[0, 1, 2]]);
  });

  it("makes one run of one box, and none of nothing", () => {
    expect(runs([box(0, 0, 10, 10)])).toEqual([[0]]);
    expect(runs([])).toEqual([]);
    // thin shapes with nearly empty boxes share the little room that is allowed
    expect(runs([box(0, 0, 40, 0), box(50, 0, 40, 0)])).toEqual([[0, 1]]);
    expect(runs([box(0, 0, 40, 0), box(5000, 900, 40, 0)])).toEqual([[0], [1]]);
  });

  it("hoists the cast shadow into a box that holds what it draws, blur included", () => {
    // the shadow group's box, measured with getBBox on every tier's card: x 133..827, y 280..952
    // (the shirt, already moved by its offset); its blur (sigma 18) reaches three sigma further
    const [x0, y0, x1, y1] = [133, 280, 827, 952];
    expect(CAST_BOX.x).toBeLessThanOrEqual(x0 - 3 * 18);
    expect(CAST_BOX.x + CAST_BOX.w).toBeGreaterThanOrEqual(x1 + 3 * 18);
    expect(CAST_BOX.y).toBeLessThanOrEqual(y0 - 3 * 18);
    expect(CAST_BOX.y + CAST_BOX.h).toBeGreaterThanOrEqual(y1 + 3 * 18);
    // and symmetric about the card's axis, so the Arabic mirror maps the box onto itself
    expect(CAST_BOX.x + CAST_BOX.w / 2).toBe(500);
  });

  it("leaves a card alone that it cannot rebuild: no DOM, a card that plays a beat, a card already lifted", () => {
    expect(liftCard({} as unknown as Element)).toBeNull();
    const fake = (attrs: Record<string, string>) =>
      ({
        querySelector: () => null,
        hasAttribute: (name: string) => name in attrs,
        setAttribute: (name: string, value: string) => void (attrs[name] = value),
        ownerDocument: { createElementNS: () => ({}) },
      }) as unknown as Element;
    expect(liftCard(fake({ "data-mc-beat": "make" }))).toBeNull();
    expect(liftCard(fake({ "data-mc-lift": "1" }))).toBeNull();
    // a card with nothing to lift is marked, not changed
    const attrs: Record<string, string> = {};
    const out = liftCard({
      querySelector: () => null,
      querySelectorAll: () => [],
      hasAttribute: (name: string) => name in attrs,
      setAttribute: (name: string, value: string) => void (attrs[name] = value),
      ownerDocument: { createElementNS: () => ({}) },
    } as unknown as Element);
    expect(out).toEqual({ filters: 0, cast: false, spec: false, plaque: false, cells: false });
    expect(attrs["data-mc-lift"]).toBe("1");
  });
});
