import { describe, expect, it } from "bun:test";

import { cardImage } from "./image";
import { holoStill } from "./image-holo";
import { tableEm } from "./name";
import { STRINGS, rated } from "./test-support";

const ids = (svg: string): string[] => [...svg.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]!);
const refs = (svg: string): string[] => [...svg.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);

describe("the Holo edition's still", () => {
  for (const rtl of [false, true]) {
    const { under, over } = holoStill("t7", rtl);

    it(`draws the prism's bands and the glints (${rtl ? "mirrored" : "left to right"})`, () => {
      expect(under).toContain('<mask id="t7-holo-mask"');
      expect(under).toContain('mask="url(#t7-holo-mask)"');
      expect(under).toContain('opacity="0.24"');
      expect(under.match(/<polygon /g)!.length).toBeGreaterThan(48 + 10);
      expect(under.match(/<circle /g)).toHaveLength(5);
      expect(over).toBe("");
    });

    it("is inline attributes and nothing the picture cannot load", () => {
      for (const bad of ["<text", "<image", "href=", "url(http", "class=", "style=", "<style"]) {
        expect(under).not.toContain(bad);
      }
    });

    it("prefixes every id with the one given, and every url(#...) finds its id", () => {
      const own = ids(under);
      expect(own.length).toBeGreaterThan(0);
      for (const id of own) expect(id.startsWith("t7-")).toBe(true);
      expect(new Set(own).size).toBe(own.length);
      for (const ref of refs(under)) expect(own).toContain(ref);
    });
  }

  it("mirrors the bands and the clear patch for Arabic, and nothing else", () => {
    const ltr = holoStill("t7").under;
    const rtl = holoStill("t7", true).under;
    expect(rtl).not.toBe(ltr);
    expect(ltr).toContain("translate(18 18.52)");
    expect(rtl).toContain("translate(82 18.52)");
  });

  it("is in the share art of a holo-edition card and of no other", () => {
    const holo = cardImage({ ...rated, edition: "holo" }, STRINGS.fr, tableEm).svg;
    expect(holo).toContain("-holo-mask");
    for (const ref of refs(holo)) expect(ids(holo)).toContain(ref);
    const standard = cardImage(rated, STRINGS.fr, tableEm).svg;
    const champion = cardImage({ ...rated, tier: "champion" }, STRINGS.fr, tableEm).svg;
    expect(standard).not.toContain("-holo-");
    expect(champion).not.toContain("-holo-");
    expect(champion).toContain("-foil");
  });
});
