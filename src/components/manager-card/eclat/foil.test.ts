import { describe, expect, it } from "bun:test";

import { kitTableEntries } from "@/lib/kits";

import { CLUBS } from "./test-data";
import {
  FOIL,
  TIER_KEYS,
  contrast,
  inkOn,
  lstar,
  mix,
  neutralShirt,
  shirtColours,
  stops,
  tierKeyOf,
  tierWord,
  withTierNames,
} from "./foil";
import { FR, AR } from "./test-data";

/** A near-black page, as the dark theme's (the mock's); the card's edge must read against it. */
const DARK_PAGE = "#0B1020";
/** The pages the app really draws the card on, read from its pixels: the light page is not white. */
const LIGHT_PAGE = "#F4F6F8";
const DARK_PAGE_REAL = "#040A17";

describe("the foil ladder (plan 5.4)", () => {
  it("has six steps in tier order, every one with seven metal stops", () => {
    expect(Object.keys(FOIL)).toEqual([...TIER_KEYS]);
    for (const key of TIER_KEYS) expect(FOIL[key].metal).toHaveLength(7);
  });

  it("gives foil, a holo layer and a moving plaque to CHAMPION and LEGEND only", () => {
    for (const key of TIER_KEYS) {
      const F = FOIL[key];
      const holographic = key === "champion" || key === "legend";
      expect(Boolean(F.foil), key).toBe(holographic);
      expect(Boolean(F.holo), key).toBe(holographic);
      expect(Boolean(F.plaqueFoil), key).toBe(key === "legend");
      expect(Boolean(F.innerFoil), key).toBe(key === "legend");
    }
    expect(FOIL.legend.holo!.glints).toBeGreaterThan(FOIL.champion.holo!.glints);
    expect(FOIL.legend.holo!.edge).toBeGreaterThan(FOIL.champion.holo!.edge);
    expect(FOIL.legend.holo!.band).toBeGreaterThan(FOIL.champion.holo!.band);
    expect(FOIL.legend.holo!.css).toBeGreaterThan(FOIL.champion.holo!.css);
  });

  it("gives each tier its own material: the cage and brush are LASTREET's, the pool STADE's", () => {
    for (const key of TIER_KEYS) {
      expect(Boolean(FOIL[key].cage), key).toBe(key === "homa");
      expect(Boolean(FOIL[key].brushed), key).toBe(key === "homa");
      expect(Boolean(FOIL[key].pool), key).toBe(key === "stade");
      expect(Boolean(FOIL[key].goldBand), key).toBe(key === "stade");
    }
    expect(FOIL.base.hex.mode).toBe("line");
    expect(FOIL.homa.hex.mode).toBe("line");
    expect(FOIL.stade.hex.mode).toBe("line");
    expect(FOIL.pro.hex.mode).toBe("cells");
    expect(FOIL.champion.hex.mode).toBe("holo");
    expect(FOIL.legend.hex.mode).toBe("holo");
  });

  it("keeps the printed words above the floors on what lies under them", () => {
    for (const key of TIER_KEYS) {
      const F = FOIL[key];
      // the plate's text sits on the plate and the top of its gradient (deep at .5 over plate)
      const under = mix(F.plate, F.deep, 0.5);
      expect(contrast("#FFFFFF", under), `${key} white on the plate`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(F.label, under), `${key} stat labels`).toBeGreaterThanOrEqual(4.5);
      // the plaque is the plate darkened 35 %
      const plaque = mix(F.plate, "#000000", 0.35);
      if (F.wordFill)
        expect(contrast(F.wordFill, plaque), `${key} tier word`).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("engraves LEGEND's word in a dark ink that reads on every foil stop (7:1)", () => {
    const F = FOIL.legend;
    for (const stop of F.foil!) expect(contrast(F.wordInk!, stop)).toBeGreaterThanOrEqual(7);
  });

  it("draws the theme edge at 3:1 against its page", () => {
    for (const key of TIER_KEYS) {
      expect(contrast(FOIL[key].edgeL, "#FFFFFF"), `${key} light`).toBeGreaterThanOrEqual(3);
      expect(contrast(FOIL[key].edgeD, DARK_PAGE), `${key} dark`).toBeGreaterThanOrEqual(3);
    }
  });

  it("draws the theme edge at 3:1 against the pages the app really has, with room to spare", () => {
    for (const key of TIER_KEYS) {
      expect(contrast(FOIL[key].edgeL, LIGHT_PAGE), `${key} light page`).toBeGreaterThanOrEqual(4);
      expect(contrast(FOIL[key].edgeD, DARK_PAGE_REAL), `${key} dark page`).toBeGreaterThanOrEqual(
        3.5,
      );
    }
  });

  it("keeps CHAMPION's and LEGEND's light edge dark: the foil's first pixels beside that line lift it", () => {
    // the foil (`holo.edge`) used to be painted over the edge stroke (round 2 review: `holo.ts` now keeps
    // that band clear), and it still lies right beside it; measured from pixels at 296 and 336 px the line
    // reads 3.35 or more on the light page only while the stroke itself is this dark
    for (const key of ["champion", "legend"] as const) {
      expect(contrast(FOIL[key].edgeL, LIGHT_PAGE), key).toBeGreaterThanOrEqual(7);
    }
  });

  it("keeps the thickness walls dark on the dark page, so the lit edge line is the silhouette", () => {
    // `layers.ts` fills wall k (1 at the back) with `metal[3]` mixed 35 % + (7 − k) × 6 % toward black.
    // A wall under 1.5:1 against the page is not seen as part of the card; the one that is (LASTREET's
    // silver) must clear 3:1 at its front. Four walls of every other tier stay under 1.5, as PRO's and
    // LEGEND's always did: before, the base, STADE and CHAMPION cards' walls climbed to 2.2:1 and the
    // silhouette read as that ramp (1.96 to 2.28), not as the edge line
    const wall = (key: (typeof TIER_KEYS)[number], k: number): number =>
      contrast(mix(FOIL[key].metal[3], "#000000", 0.35 + (7 - k) * 0.06), DARK_PAGE_REAL);
    for (const key of TIER_KEYS) {
      if (key === "homa") expect(wall(key, 4), key).toBeGreaterThanOrEqual(3);
      else for (const k of [1, 2, 3, 4]) expect(wall(key, k), `${key} wall ${k}`).toBeLessThan(1.5);
    }
  });

  it("separates the six tiers on small tokens by value as well as hue", () => {
    const rings = (["base", "homa", "stade", "pro"] as const).map((k) => FOIL[k].tokEdge!);
    expect(new Set(rings).size).toBe(4);
    expect(lstar(FOIL.homa.tokEdge!)).toBeGreaterThan(lstar(FOIL.base.tokEdge!) + 30);
  });
});

describe("tiers, words and colours", () => {
  it("is base until there is a number and a tier", () => {
    expect(tierKeyOf({ ovr: null, tier: "pro" })).toBe("base");
    expect(tierKeyOf({ ovr: 80, tier: null })).toBe("base");
    expect(tierKeyOf({ ovr: 80, tier: "pro" })).toBe("pro");
  });

  it("prints LASTREET for the lowest tier in both languages, and the interface's words for the rest", () => {
    expect(tierWord("homa", FR)).toBe("LASTREET");
    expect(tierWord("homa", AR)).toBe("LASTREET");
    expect(tierWord("pro", FR)).toBe("PRO");
    expect(tierWord("legend", AR)).toBe(AR.tiers.legend);
    expect(withTierNames(FR).tiers.homa).toBe("LASTREET");
    expect(withTierNames(FR).tiers.stade).toBe("STADE");
  });

  it("mixes towards the second colour like color-mix in srgb", () => {
    expect(mix("#000000", "#FFFFFF", 0.5)).toBe("#808080");
    expect(mix("#102030", "#102030", 0.7)).toBe("#102030");
    expect(mix("#ff0000", "#0000ff", 0)).toBe("#ff0000");
    expect(mix("#ff0000", "#0000ff", 1)).toBe("#0000ff");
  });

  it("spreads gradient stops evenly", () => {
    expect(stops(["#000", "#fff", "#f00"])).toBe(
      '<stop offset="0.000" stop-color="#000" stop-opacity="1"/><stop offset="0.500" stop-color="#fff" stop-opacity="1"/><stop offset="1.000" stop-color="#f00" stop-opacity="1"/>',
    );
  });
});

describe("the club on the shirt (plan 5.1, 5.2, 3.3)", () => {
  const kits = kitTableEntries();

  it("prints the number at 3:1 on every club of the kit table", () => {
    expect(kits.length).toBeGreaterThan(10);
    for (const { key, kit } of kits) {
      const c = shirtColours({ primary: kit.primary, secondary: kit.secondary }, FOIL.pro);
      expect(contrast(c.numberFill, kit.primary), key).toBeGreaterThanOrEqual(3);
    }
  });

  it("prints the club initials at 4.5:1 on every club of the kit table", () => {
    for (const { key, kit } of kits) {
      expect(contrast(inkOn(kit.primary), kit.primary), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps the twill ring apart from the number's fill", () => {
    for (const { key, kit } of kits) {
      const c = shirtColours({ primary: kit.primary, secondary: kit.secondary }, FOIL.pro);
      expect(contrast(c.twill, c.numberFill), key).toBeGreaterThanOrEqual(1.1);
    }
  });

  it("draws a neutral shirt, lighter than the plate, when there is no club", () => {
    for (const key of TIER_KEYS) {
      const F = FOIL[key];
      const c = shirtColours(null, F);
      expect(c.primary).toBe(neutralShirt(F));
      expect(c.secondary).toBe(F.edgeD);
      expect(lstar(c.primary)).toBeGreaterThan(lstar(F.plate) + 10);
    }
  });

  it("marks a black shirt dark and a green one not", () => {
    expect(shirtColours({ primary: "#111111", secondary: "#c8102e" }, FOIL.legend).dark).toBe(true);
    expect(shirtColours(CLUBS.raja, FOIL.pro).dark).toBe(false);
    expect(shirtColours(CLUBS.raja, FOIL.pro).hl).toBe(mix(CLUBS.raja.primary, "#ffffff", 0.4));
  });
});
