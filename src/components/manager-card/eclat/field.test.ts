import { describe, expect, it } from "bun:test";

import { FOIL, TIER_KEYS } from "./foil";
import { FR, MOCK_CARDS, PROFILES } from "./test-data";
import { fullCard } from "./full";
import { fingerprint } from "./field";
import { groupsByClass, layer } from "./test-markup";

const draw = (p: Parameters<typeof fullCard>[0], lang = FR) =>
  fullCard(p, { strings: lang, theme: "light" });
/** One card per tier of the ladder, the mock's. */
const BY_TIER = Object.fromEntries(
  MOCK_CARDS.map((c) => [c.profile.ovr == null ? "base" : c.profile.tier!, c.profile]),
) as Record<(typeof TIER_KEYS)[number], (typeof MOCK_CARDS)[number]["profile"]>;

const patternTransforms = (html: string) =>
  [...html.matchAll(/id="[^"]*-hex([DLMCW])" [^>]*patternTransform="([^"]*)"/g)].map((m) => m[2]);

describe("the field (plan 5.3, revision 3)", () => {
  it("draws the same card the same way", () => {
    // ids differ by render (one counter); everything else is the same markup
    const strip = (h: string) => h.replace(/mc-\d+/g, "mc-N");
    expect(strip(draw(PROFILES.rated))).toBe(strip(draw(PROFILES.rated)));
  });

  it("phases the honeycomb by the serial: two serials, two phases; the same serial, the same phase", () => {
    const a = patternTransforms(draw({ ...PROFILES.rated, serial: "482913" }));
    const a2 = patternTransforms(draw({ ...PROFILES.rated, serial: "482913" }));
    const b = patternTransforms(draw({ ...PROFILES.rated, serial: "118204" }));
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(a2);
    expect(b).not.toEqual(a);
    expect(fingerprint("482913")).toEqual(fingerprint("482913"));
    expect(fingerprint("482913")).not.toEqual(fingerprint("118204"));
    const { ox, oy } = fingerprint("a|2026/27");
    expect(ox).toBeGreaterThanOrEqual(0);
    expect(ox).toBeLessThan(90);
    expect(oy).toBeLessThan(52);
  });

  it("falls back on the name and season for a card with no serial", () => {
    const a = patternTransforms(draw({ ...PROFILES.rated, serial: null, name: "Ali" }));
    const b = patternTransforms(draw({ ...PROFILES.rated, serial: null, name: "Karim" }));
    expect(a).not.toEqual(b);
  });

  it("has the honeycomb in its tier's mode: lines, cells or foil seen through the cells", () => {
    for (const key of TIER_KEYS) {
      const field = groupsByClass(draw(BY_TIER[key]), "mc-field")[0]!;
      const has = (what: string) => field.includes(`-${what})`);
      expect(has("hexL"), `${key} lit edge`).toBe(true);
      expect(has("hexC"), `${key} cells`).toBe(key === "pro");
      expect(has("cells"), `${key} foil cells`).toBe(key === "champion" || key === "legend");
      expect(has("hexD"), `${key} cast edge`).toBe(key !== "pro");
      expect(has("hexM"), `${key} face line`).toBe(["base", "homa", "stade"].includes(key));
    }
  });

  it("gives LEGEND's foil to the cells under the light only", () => {
    expect(layer(draw(BY_TIER.legend), "base")!.includes("-lightm)")).toBe(true);
    expect(layer(draw(BY_TIER.champion), "base")!.includes("-lightm)")).toBe(false);
  });

  it("gives the fence to LASTREET alone and the pool of light to STADE alone", () => {
    for (const key of TIER_KEYS) {
      const html = draw(BY_TIER[key]);
      expect(html.includes("-cage)"), `${key} cage`).toBe(key === "homa");
      expect(html.includes("-brush)"), `${key} brush`).toBe(key === "homa");
      expect(html.includes("-pool)"), `${key} pool`).toBe(key === "stade");
      expect(html.includes("-goldband"), `${key} gold band`).toBe(key === "stade");
    }
  });

  it("lights the base card with one floodlight and every other tier with two", () => {
    for (const key of TIER_KEYS) {
      const [flood] = groupsByClass(draw(BY_TIER[key]), "mc-flood");
      const lamps = (flood!.match(/-lamp\)/g) ?? []).length;
      expect(lamps, key).toBe(key === "base" ? 1 : 2);
    }
  });

  it("draws the centre circle and the halfway line, and no ribbon, glitch bar or pixel rain", () => {
    for (const key of TIER_KEYS) {
      const html = draw(BY_TIER[key]);
      const field = groupsByClass(html, "mc-field")[0]!;
      expect(field.includes('r="318"'), key).toBe(true);
      expect(field.includes("M62 630H938"), key).toBe(true);
      expect(/ribbon|glitch|pixel|sparkle|guilloche|micro-?print/i.test(html), key).toBe(false);
      // the honeycomb is a pattern, never generated paths: the field holds a handful of elements
      expect((field.match(/<(rect|path|circle|g)\b/g) ?? []).length, key).toBeLessThan(40);
    }
  });

  it("puts a black shirt's aura behind it and strengthens the backlight", () => {
    const black = layer(draw(BY_TIER.legend), "base")!;
    const green = layer(draw(BY_TIER.pro), "base")!;
    expect(black.includes("scale(1.06)")).toBe(true);
    expect(green.includes("scale(1.06)")).toBe(false);
    const back = (h: string) => Number(/-back\)" opacity="([\d.]+)"/.exec(h)![1]);
    expect(back(black)).toBeCloseTo(FOIL.legend.back + 0.15, 2);
    expect(back(green)).toBeCloseTo(FOIL.pro.back, 2);
  });

  it("clips the field to the shield window and moves nothing but the foil", () => {
    const base = layer(draw(BY_TIER.champion), "base")!;
    expect(base.includes('<g clip-path="url(#')).toBe(true);
    expect(base.includes("mc-foil-shift")).toBe(true);
    expect(layer(draw(BY_TIER.pro), "base")!.includes("mc-foil-shift")).toBe(false);
  });
});
