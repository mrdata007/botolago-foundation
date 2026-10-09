import { describe, expect, it } from "bun:test";

import { FOIL, TIER_KEYS } from "./foil";
import { TAB, WINDOW_IN } from "./geometry";
import { eclatRenderer } from "./index";
import { AR, FR, MOCK_ARABIC, MOCK_CARDS } from "./test-data";
import { layer } from "./test-markup";
import type { CardProfile } from "../types";

const profileOf = (key: (typeof TIER_KEYS)[number]): CardProfile =>
  key === "base" ? MOCK_CARDS[0]!.profile : MOCK_CARDS.find((c) => c.profile.tier === key)!.profile;
const draw = (p: CardProfile, lang: "fr" | "ar" = "fr") =>
  eclatRenderer.full(p, { strings: lang === "ar" ? AR : FR, theme: "light" });

describe("holographic items (plan 5.5, revision 3)", () => {
  it("gives CHAMPION and LEGEND the holo layer, its mask, the foil shift and the cells mask", () => {
    for (const key of TIER_KEYS) {
      const html = draw(profileOf(key));
      const holographic = key === "champion" || key === "legend";
      expect(layer(html, "holo") !== null, `${key} layer`).toBe(holographic);
      expect(html.includes("-hm)"), `${key} edge mask`).toBe(holographic);
      expect(html.includes("-cells)"), `${key} cells mask`).toBe(holographic);
      expect(html.includes("mc-foil-shift"), `${key} foil shift`).toBe(holographic);
      expect(/class="mc-eclat [^"]*\bmc-holo\b/.test(html), `${key} class`).toBe(holographic);
      expect(html.includes("mc-glint"), `${key} glints`).toBe(holographic);
    }
  });

  it("cuts the tab out of the foil and gives it a rim of its own", () => {
    for (const key of ["champion", "legend"] as const) {
      const holo = layer(draw(profileOf(key)), "holo")!;
      const mask = /<mask id="[^"]*-hm"[^>]*>(.*?)<\/mask>/s.exec(holo)![1]!;
      expect(mask).toContain(`<path d="${TAB}" fill="#000"/>`);
      expect(mask.indexOf(`<path d="${TAB}" fill="#000"/>`)).toBeGreaterThan(
        mask.indexOf('stroke-width="20"'),
      );
      expect(mask).toContain(
        `<path d="${TAB}" fill="none" stroke="#fff" stroke-opacity="${FOIL[key].holo!.edge}"`,
      );
    }
  });

  it("gives LEGEND more than CHAMPION: four glints against two, a stronger edge and band, the inner hairline", () => {
    const champion = layer(draw(profileOf("champion")), "holo")!;
    const legend = layer(draw(profileOf("legend")), "holo")!;
    expect((champion.match(/mc-glint/g) ?? []).length).toBe(2);
    expect((legend.match(/mc-glint/g) ?? []).length).toBe(4);
    expect(champion.includes(`d="${WINDOW_IN}"`)).toBe(false);
    expect(legend.includes(`d="${WINDOW_IN}"`)).toBe(true);
    expect(FOIL.legend.holo!.edge).toBeGreaterThan(FOIL.champion.holo!.edge);
    expect(FOIL.legend.holo!.band).toBeGreaterThan(FOIL.champion.holo!.band);
    expect(draw(profileOf("legend")).includes('style="--mc-sheen:0.22;--mc-holo:0.24"')).toBe(true);
    expect(draw(profileOf("champion")).includes('style="--mc-sheen:0.2;--mc-holo:0.16"')).toBe(
      true,
    );
  });

  it("has no seal, no sparkle field, no grid and no rainbow of seven hues in any tier", () => {
    for (const key of TIER_KEYS) {
      const html = draw(profileOf(key));
      expect(
        /seal|sparkle|diffraction-grid|spectrum/i.test(html.replace(/mc-seal/g, "")),
        key,
      ).toBe(false);
      // six foil stops at most, a narrow palette
      expect((FOIL[key].foil ?? []).length).toBeLessThanOrEqual(6);
    }
  });

  it("keeps the foil off the number and the plate's text: the diffraction sits above the plaque with a hole over the chest", () => {
    const css = Bun.file(new URL("./eclat.css", import.meta.url).pathname);
    return css.text().then((text) => {
      expect(text).toContain("inset: 0 0 35% 0");
      expect(text).toContain(
        "radial-gradient(ellipse 30% 26% at 50% 59.5%, transparent 70%, #000 100%)",
      );
      expect(text).toContain("mask-composite: intersect");
      expect(text).toContain("mix-blend-mode: color-dodge");
    });
  });

  it("mirrors the foil with the shapes in Arabic", () => {
    const ar = layer(draw(MOCK_ARABIC[0]!.profile, "ar"), "holo")!;
    expect(ar.startsWith('<g transform="matrix(-1 0 0 1 1000 0)">')).toBe(true);
    const fr = layer(draw(profileOf("champion")), "holo")!;
    expect(fr.includes("matrix(-1")).toBe(false);
  });
});
