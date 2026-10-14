import { describe, expect, it } from "bun:test";

import { parseHex } from "@/lib/colour";

import { contrast } from "../eclat/foil";
import { TIER_CODES } from "../types";
import {
  EDITION_METAL,
  METAL,
  METAL_KEYS,
  PAID_EDITIONS,
  cssVars,
  metalFor,
  paidEdition,
  tierPalette,
} from "./metal";

/** Hue in degrees of a hex colour (HSL). */
function hue(hex: string): number {
  const [r, g, b] = parseHex(hex)!;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === min) return 0;
  const d = max - min;
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return (h * 60 + 360) % 360;
}
const saturated = (hex: string): boolean => {
  const [r, g, b] = parseHex(hex)!;
  return Math.max(r, g, b) - Math.min(r, g, b) > 0.15;
};
/** Violet to pink: the prism LEGEND keeps for itself. */
const violetOrPink = (hex: string): boolean => saturated(hex) && hue(hex) >= 265 && hue(hex) <= 345;

describe("the metals", () => {
  it("has one row per step of the ladder: graphite, silver, gold, red-gold, cyan, prism", () => {
    expect([...METAL_KEYS]).toEqual(["base", ...TIER_CODES]);
    expect(METAL.base.dark).toBe(true);
    expect(METAL.homa.dark).toBe(false);
    expect(METAL.stade.dark).toBe(false);
    expect(METAL.pro.dark).toBe(true);
  });

  it("prints its text at 4.5:1 or more on every stop of its face", () => {
    for (const key of METAL_KEYS) {
      const m = METAL[key];
      for (const stop of m.faceStops) {
        expect(contrast(m.ink, stop), `${key} ink on ${stop}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(m.ink2, stop), `${key} small text on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(m.chip, m.chipLine), `${key} sample pill`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.emb, m.embLine), `${key} emblem`).toBeGreaterThanOrEqual(3);
    }
  });

  it("keeps the violet and pink prism for LEGEND alone; CHAMPION's holographic is green to blue", () => {
    expect(METAL.legend.holo!.some(violetOrPink)).toBe(true);
    for (const key of METAL_KEYS) {
      if (key === "legend") continue;
      const m = METAL[key];
      for (const colour of [...(m.holo ?? []), ...m.sig, ...m.frame]) {
        expect(violetOrPink(colour), `${key}: ${colour}`).toBe(false);
      }
    }
    expect(METAL.champion.holo).not.toBeNull();
    for (const key of ["base", "homa", "stade", "pro"] as const) expect(METAL[key].holo).toBeNull();
  });

  it("hands the screens a palette per tier, the base card's for no tier", () => {
    expect(tierPalette(null)).toEqual(tierPalette(null));
    expect(tierPalette(null).plate).toBe(METAL.base.plate);
    expect(tierPalette("stade").metal).toEqual(METAL.stade.frame);
    expect(tierPalette("legend").prism).toHaveLength(6);
    expect(tierPalette("pro").prism).toBeNull();
    // the DOM faces (the back, the burst) draw light words on the dark plate
    for (const tier of TIER_CODES) {
      const p = tierPalette(tier);
      expect(contrast(p.word, p.plate), tier).toBeGreaterThanOrEqual(4.5);
      expect(contrast(p.light, p.plate), tier).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("writes only literal colours into the root's style: no quote, no angle bracket", () => {
    for (const key of METAL_KEYS) {
      const css = cssVars(METAL[key]);
      expect(css).not.toMatch(/[<>"']/);
      expect(css).toContain("--sh-face:");
      expect(css.includes("--sh-holo:")).toBe(METAL[key].holo !== null);
    }
  });
});

describe("the paid editions", () => {
  it("print their text at 4.5:1 or more on every stop of their face", () => {
    for (const key of PAID_EDITIONS) {
      const m = EDITION_METAL[key];
      for (const stop of m.faceStops) {
        expect(contrast(m.ink, stop), `${key} ink on ${stop}`).toBeGreaterThanOrEqual(4.5);
        expect(contrast(m.ink2, stop), `${key} small text on ${stop}`).toBeGreaterThanOrEqual(4.5);
      }
      expect(contrast(m.chip, m.chipLine), `${key} sample pill`).toBeGreaterThanOrEqual(4.5);
      expect(contrast(m.emb, m.embLine), `${key} emblem`).toBeGreaterThanOrEqual(3);
      if (m.num) {
        for (const stop of m.faceStops) {
          for (const c of m.num) {
            expect(contrast(c, stop), `${key} rating ${c} on ${stop}`).toBeGreaterThanOrEqual(3);
          }
        }
      }
      const p = { plate: m.plate, word: m.word, light: m.light };
      expect(contrast(p.word, p.plate), key).toBeGreaterThanOrEqual(4.5);
    }
  });

  it("keeps violet and pink out of every edition: the holo edition is green, cyan and blue", () => {
    for (const key of PAID_EDITIONS) {
      const m = EDITION_METAL[key];
      for (const colour of [...(m.holo ?? []), ...m.sig, ...m.frame, ...(m.checker ?? [])]) {
        expect(violetOrPink(colour), `${key}: ${colour}`).toBe(false);
      }
    }
  });

  it("replaces the tier's metal for a paid edition, and for no other value", () => {
    expect(metalFor("pro", "chrome")).toBe(EDITION_METAL.chrome);
    expect(metalFor("legend", null)).toBe(METAL.legend);
    for (const bad of [undefined, null, "standard", "gold", 3, "__proto__", "toString"]) {
      expect(paidEdition(bad), String(bad)).toBeNull();
    }
    for (const key of PAID_EDITIONS) expect(paidEdition(key)).toBe(key);
  });

  it("writes only literal colours into the root's style", () => {
    for (const key of PAID_EDITIONS) {
      const css = cssVars(EDITION_METAL[key]);
      expect(css).not.toMatch(/[<>"']/);
    }
  });
});
