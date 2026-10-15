import { describe, expect, it } from "bun:test";

import type { CardEdition } from "../types";
import { cardImage } from "./image";
import { pixelStill } from "./image-pixel";
import { rated, STRINGS } from "./test-support";

const norm = (s: string): string => s.replace(/mc-px-\d+/g, "P");

describe("the Pixel edition's still in the share art", () => {
  const { under, over } = pixelStill();

  it("holds the three groups of squares over the full card, and nothing outside the clip", () => {
    expect(over).toBe("");
    expect(under.match(/<pattern /g)).toHaveLength(3);
    // 13 x 18 squares in the tile, split over the three groups
    expect(under.match(/<rect x=/g)).toHaveLength(13 * 18);
    expect(under.match(/<rect width="100" height="136.6" fill="url\(#/g)).toHaveLength(3);
    expect(under).toContain('opacity="0.3"');
  });

  it("uses inline attributes only, with no text, picture or outside reference", () => {
    expect(under).not.toMatch(/class=|style=|<style/);
    expect(under).not.toMatch(/<text|<image|<animate|<set|href=|url\(http/);
    const refs = under.match(/url\(#[^)]+\)/g)!;
    expect(refs.every((u) => /^url\(#mc-px-\d+-[012]\)$/.test(u))).toBe(true);
  });

  it("is the same every time, apart from its ids", () => {
    const again = pixelStill().under;
    expect(norm(again)).toBe(norm(under));
    expect(again).not.toBe(under);
    expect(new Set(again.match(/id="[^"]+"/g)).size).toBe(3);
  });

  it("is in the picture of a Pixel card and in no other card's", () => {
    const art = (edition: CardEdition | undefined): string =>
      cardImage({ ...rated, edition }, STRINGS.fr).svg;
    const pixel = art("pixel");
    expect(pixel).toContain('<g opacity="0.3"><rect width="100" height="136.6"');
    expect(pixel.match(/<pattern id="mc-px-/g)).toHaveLength(3);
    for (const other of [undefined, "standard", "holo", "electric", "chrome"] as const) {
      expect(art(other)).not.toContain("mc-px-");
    }
  });
});
