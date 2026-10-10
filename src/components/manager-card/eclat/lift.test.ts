import { describe, expect, it } from "bun:test";

import { CAST_BOX, NUM_BOX, cropNum, liftCard, runs } from "./lift";
import { CHEST, JT_DX, JT_DY, JT_SCALE } from "./geometry";

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

  it("crops the number layer to a box that holds the print, its shade and « OVR », and no more", () => {
    // the print lies in the chest box of jersey space; JT puts it on the card
    const x0 = CHEST.x0 * JT_SCALE + JT_DX;
    const x1 = CHEST.x1 * JT_SCALE + JT_DX;
    const y0 = CHEST.y0 * JT_SCALE + JT_DY;
    const y1 = CHEST.y1 * JT_SCALE + JT_DY;
    // with room for the outline, the shade's offset and its blur (a bit over 40 units)
    expect(NUM_BOX.x).toBeLessThanOrEqual(x0 - 30);
    expect(NUM_BOX.x + NUM_BOX.w).toBeGreaterThanOrEqual(x1 + 30);
    expect(NUM_BOX.y).toBeLessThanOrEqual(y0 - 30);
    // « OVR » stands at jersey y 830, 32 high with its halo
    const ovr = 830 * JT_SCALE + JT_DY;
    expect(NUM_BOX.y + NUM_BOX.h).toBeGreaterThanOrEqual(ovr + 40);
    expect(NUM_BOX.x + NUM_BOX.w / 2).toBe(500);
    // a sixth of the card or less: that is what the compositor is spared
    expect((NUM_BOX.w * NUM_BOX.h) / (1000 * 1618)).toBeLessThan(0.16);
  });

  it("crops the number layer while the card moves and gives it back exactly as it was", () => {
    const attrs: Record<string, string> = {
      viewBox: "0 0 1000 1618",
      style: "direction:ltr",
      class: "mc-l mc-l--num",
    };
    const classes = new Set(["mc-l", "mc-l--num"]);
    const style: Record<string, string> = {};
    const svg = {
      classList: {
        add: (c: string) => classes.add(c),
        remove: (c: string) => classes.delete(c),
        contains: (c: string) => classes.has(c),
      },
      getAttribute: (n: string) => attrs[n] ?? null,
      setAttribute: (n: string, v: string) => void (attrs[n] = v),
      removeAttribute: (n: string) => void delete attrs[n],
      dataset: {} as Record<string, string>,
      style,
    };
    const root = { querySelector: (sel: string) => (sel === "svg.mc-l--num" ? svg : null) };
    // a card of 296 px: the box's edges (83, 118.4 -> 118, 213, 266.4 -> 267 ...) land on whole pixels
    expect(cropNum(root as unknown as Element, true, 296)).toBe(true);
    const k = 296 / 1000;
    const left = Math.floor(280 * k);
    const top = Math.floor(400 * k);
    expect(style.left).toBe(`${left}px`);
    expect(style.top).toBe(`${top}px`);
    expect(style.width).toBe(`${Math.ceil(720 * k) - left}px`);
    expect(style.height).toBe(`${Math.ceil(900 * k) - top}px`);
    // the view box starts where the box starts, so a unit lands on the pixel it landed on
    const [vx, vy, vw, vh] = attrs.viewBox!.split(" ").map(Number);
    expect(vx! * k).toBeCloseTo(left, 3);
    expect(vy! * k).toBeCloseTo(top, 3);
    expect(vw! * k).toBeCloseTo(Math.ceil(720 * k) - left, 3);
    expect(vh! * k).toBeCloseTo(Math.ceil(900 * k) - top, 3);
    // and the crop never cuts into the number's box, whatever the card's width
    for (const width of [136, 296, 336, 351.5]) {
      const kk = width / 1000;
      expect(Math.floor(280 * kk) / kk).toBeLessThanOrEqual(280);
      expect(Math.ceil(720 * kk) / kk).toBeGreaterThanOrEqual(720);
    }
    // it turns about the card's own centre, which is not the cropped layer's
    expect(style.transformOrigin).toBe(`${500 * k - left}px ${809 * k - top}px`);
    // asking twice changes nothing; giving it back restores the viewBox and the style attribute
    expect(cropNum(root as unknown as Element, true, 296)).toBe(true);
    expect(cropNum(root as unknown as Element, false)).toBe(true);
    expect(attrs.viewBox).toBe("0 0 1000 1618");
    expect(attrs.style).toBe("direction:ltr");
    expect(classes.has("mc-crop")).toBe(false);
    // no card width yet (not laid out): no crop
    expect(cropNum(root as unknown as Element, true, 0)).toBe(false);
    // a card with no number layer has nothing to crop
    expect(cropNum({ querySelector: () => null } as unknown as Element, true)).toBe(false);
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
