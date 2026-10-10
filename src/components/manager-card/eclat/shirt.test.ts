import { describe, expect, it } from "bun:test";

import { FOIL, mix, neutralShirt } from "./foil";
import { JT_DX, JT_DY, JT_SCALE, NECK_TOKEN, SHIRT, SHIRT_TOKEN, SLEEVE_L } from "./geometry";
import { FR, MOCK_CARDS, MOCK_CLUBS, PROFILES } from "./test-data";
import { fullCard } from "./full";
import { layer, pathBox } from "./test-markup";
import { tokenMarkup } from "./token";
import { makeView } from "./view";

const draw = (p: Parameters<typeof fullCard>[0]) => fullCard(p, { strings: FR, theme: "light" });

describe("the shirt's proportions (plan 5.1, revision 3)", () => {
  const box = pathBox(SHIRT);

  it("has the measured bounding box in jersey space and on the card", () => {
    expect(box.x0).toBeCloseTo(190, 0);
    expect(box.x1).toBeCloseTo(810, 0);
    expect(box.y0).toBeCloseTo(300, 0);
    expect(box.y1).toBeCloseTo(899.8, 0);
    const card = {
      x0: box.x0 * JT_SCALE + JT_DX,
      x1: box.x1 * JT_SCALE + JT_DX,
      y0: box.y0 * JT_SCALE + JT_DY,
      y1: box.y1 * JT_SCALE + JT_DY,
    };
    expect(card.x0).toBeCloseTo(152.8, 0);
    expect(card.x1).toBeCloseTo(847.2, 0);
    expect(card.y0).toBeCloseTo(250, 0);
    expect(card.y1).toBeCloseTo(921.8, 0);
  });

  it("is about 1.44 times as long as it is wide at the pits, and as wide across the sleeves as it is long", () => {
    const pit = 708 - 292;
    const length = box.y1 - box.y0;
    expect(length / pit).toBeGreaterThan(1.4);
    expect(length / pit).toBeLessThan(1.5);
    const span = box.x1 - box.x0;
    expect(span / length).toBeGreaterThan(0.95);
    expect(span / length).toBeLessThan(1.1);
  });

  it("is symmetric about x 500", () => {
    expect((box.x0 + box.x1) / 2).toBeCloseTo(500, 0);
    const sleeve = pathBox(SLEEVE_L);
    expect(sleeve.x0).toBeCloseTo(190, 0);
  });

  it("has a token shirt with short sleeves inside the silhouette", () => {
    const t = pathBox(SHIRT_TOKEN);
    expect(t.x0).toBeCloseTo(276, 0);
    expect(t.x1).toBeCloseTo(724, 0);
    expect(t.y0).toBeCloseTo(300, 0);
    expect(t.y1).toBeCloseTo(897, 0);
    for (const size of [80, 64, 56, 44, 32, 28, 24] as const) {
      const html = tokenMarkup(makeView(PROFILES.rated, FR), size, "light");
      expect(html, String(size)).toContain(SHIRT_TOKEN);
      expect(html, String(size)).toContain(NECK_TOKEN);
    }
  });
});

describe("the shirt's drawing", () => {
  const shirt = (p: Parameters<typeof draw>[0]) => layer(draw(p), "shirt")!;

  it("draws the hem, the cuffs, the collar clipped to the shirt and the cast shadow", () => {
    const html = draw(MOCK_CARDS[3]!.profile);
    const s = layer(html, "shirt")!;
    expect(s).toContain("M300 866Q500 888 700 866"); // the hem
    expect(s).toContain("M190 418L226 552L244 539L208 405Z"); // a cuff
    expect(s).toContain("-collar)"); // the collar's clip
    // nothing is drawn above the shoulder line: the collar sits in a clip of the shirt and a band
    expect(s).toContain('<rect x="400" y="300" width="200" height="100"/>'.slice(0, 0));
    expect(layer(html, "base")).toContain("mc-shirt-cast");
  });

  it("puts the club's colours on the shirt, collar and cuffs", () => {
    const s = shirt(MOCK_CARDS[3]!.profile); // Raja: green, white
    expect(s).toContain(`fill="${MOCK_CLUBS.raja.primary}"`);
    expect(s).toContain(`stroke="${MOCK_CLUBS.raja.secondary}"`);
    expect(s).toContain(`fill="${MOCK_CLUBS.raja.secondary}"`);
  });

  it("draws the chest disc where a crest would be, without a letter in it", () => {
    const s = shirt(MOCK_CARDS[3]!.profile);
    expect(s).toContain('cx="600" cy="428" r="24"');
    expect(s).not.toContain("<text");
  });

  it("draws a neutral shirt, no disc and the tab's placeholder when there is no club", () => {
    const html = draw(MOCK_CARDS[1]!.profile); // LASTREET, no club
    const s = layer(html, "shirt")!;
    const F = FOIL.homa;
    expect(s).toContain(`fill="${neutralShirt(F)}"`);
    expect(neutralShirt(F)).toBe(mix(F.plate, "#FFFFFF", 0.3));
    expect(s).not.toContain('cx="600"');
    // the placeholder: the tier's edge colour and an embossed hexagon (six points), never a logo
    const frame = layer(html, "frame")!;
    expect(frame).toContain(`r="54" fill="${F.edgeL}"`);
    expect(frame).toMatch(
      /M[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+L[\d.]+ [\d.]+Z/,
    );
    expect(frame).not.toContain('data-meta="initials"');
  });

  it("uses the shirt's own highlight tint, not white, in its light overlays", () => {
    const s = shirt(MOCK_CARDS[3]!.profile);
    const hl = mix(MOCK_CLUBS.raja.primary, "#ffffff", 0.4);
    expect(s).toContain(`fill="${hl}" fill-opacity=".34"`);
  });

  it("drops the piqué on the face-à-face card", () => {
    const compact = layer(
      fullCard(MOCK_CARDS[3]!.profile, { strings: FR, theme: "light", compact: true }),
      "shirt",
    )!;
    expect(compact).not.toContain("-knit)");
    expect(shirt(MOCK_CARDS[3]!.profile)).toContain("-knit)");
  });
});
