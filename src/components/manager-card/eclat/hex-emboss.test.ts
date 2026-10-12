import { describe, expect, it } from "bun:test";

import { fullCard } from "./full";
import { TIER_KEYS } from "./foil";
import { FR, AR, MOCK_CARDS } from "./test-data";
import { layer } from "./test-markup";

const BY_TIER = Object.fromEntries(
  MOCK_CARDS.map((c) => [c.profile.ovr == null ? "base" : c.profile.tier!, c.profile]),
) as Record<(typeof TIER_KEYS)[number], (typeof MOCK_CARDS)[number]["profile"]>;

describe("the embossed honeycomb (collectible motion)", () => {
  for (const [key, profile] of Object.entries(BY_TIER)) {
    for (const lang of [FR, AR]) {
      it(`${key} ${lang.lang}: one bevelled tile (a light and a shaded side) and a group that follows the tilt`, () => {
        const html = fullCard(profile, { strings: lang, theme: "light" });
        const base = layer(html, "base")!;
        // one tile for the cell's gradient, not hundreds of paths
        expect(base.match(/id="[^"]*-hexB"/g)).toHaveLength(1);
        expect(base).toMatch(/-hexBG"[^>]*><stop offset="0" stop-color="#fff"/);
        expect(base).toContain('stop-color="#000"');
        expect(base).toContain("mc-hex-shift");
        // a light edge and a shaded edge, drawn offset from each other (not the same line twice)
        const offsets = (id: string) =>
          new RegExp(
            `-hex${id}" [^>]*patternTransform="translate\\(([-\\d.]+) ([-\\d.]+)\\)"`,
          ).exec(base);
        const light = offsets("L");
        const shade = offsets("D");
        expect(light && shade).toBeTruthy();
        expect(light![1]! !== shade![1] || light![2]! !== shade![2]).toBe(true);
      });
    }
  }

  it("is no heavier than a few hundred bytes a card and stays out of the text and the number", () => {
    const html = fullCard(BY_TIER.pro, { strings: FR, theme: "light" });
    expect(layer(html, "num")!.includes("mc-hex-shift")).toBe(false);
    expect(html.match(/mc-hex-shift/g)!.length).toBeLessThanOrEqual(3);
  });
});
