import { describe, expect, it } from "bun:test";

import { findUnsafeMarkup } from "../markup-safety";
import { SHIELD } from "./geometry";
import { cardImage } from "./image";
import { electricStill } from "./image-electric";
import { editionStill } from "./image-editions";
import { STRINGS, rated } from "./test-support";

const ID = "mc-77";
const still = electricStill(ID);
const both = still.under + still.over;

describe("the share art's Electric still", () => {
  it("has the glints under and the crackling border over", () => {
    expect(still.under).toContain("<circle");
    expect(still.under.match(/<circle/g)).toHaveLength(5);
    expect(still.over).toContain(`d="${SHIELD}"`);
    expect(still.over).toContain('stroke="#5fe3a1" stroke-width="0.7"');
    expect(still.over).toContain('stroke="#96f0be"');
    expect(still.over).toContain("<feDisplacementMap");
    expect(still.over).toContain("<feGaussianBlur");
  });

  it("is attributes only, with no text, image or external reference", () => {
    expect(both).not.toContain("class=");
    expect(both).not.toContain("style=");
    expect(both).not.toContain("<style");
    expect(both).not.toContain("<text");
    expect(both).not.toContain("<image");
    expect(both).not.toContain("href=");
    expect(both).not.toContain("url(http");
  });

  it("keeps its filters inside the art's view box", () => {
    for (const region of both.matchAll(/<filter [^>]*>/g)) {
      expect(region[0]).toContain(
        'filterUnits="userSpaceOnUse" x="-8" y="-1" width="116" height="139.6"',
      );
    }
  });

  it("prefixes every id with the given id, and every reference has its target", () => {
    const ids = [...both.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]!);
    expect(ids.length).toBeGreaterThan(0);
    for (const found of ids) expect(found.startsWith(`${ID}-`)).toBe(true);
    expect(new Set(ids).size).toBe(ids.length);
    const refs = [...both.matchAll(/url\(#([^)]+)\)/g)].map((m) => m[1]!);
    expect(refs.length).toBeGreaterThan(0);
    for (const ref of refs) expect(ids).toContain(ref);
  });

  it("is what the Electric edition gets from editionStill, and nothing else gets", () => {
    expect(editionStill("electric", ID)).toEqual(still);
    expect(editionStill(null, ID)).toEqual({ under: "", over: "" });
  });

  it("is in the whole picture of an Electric card and not in a standard one", () => {
    const electric = cardImage({ ...rated, edition: "electric" }, STRINGS.fr);
    expect(electric.svg).toContain("feDisplacementMap");
    expect(electric.svg).toContain('stroke="#5fe3a1" stroke-width="0.7"');
    expect(findUnsafeMarkup(electric.svg)).toEqual([]);
    expect(electric.svg).not.toContain("<text");
    expect(electric.svg).not.toContain("<image");
    const standard = cardImage(rated, STRINGS.fr);
    expect(standard.svg).not.toContain("feDisplacementMap");
    expect(standard.svg).not.toContain('stroke="#5fe3a1"');
  });
});
