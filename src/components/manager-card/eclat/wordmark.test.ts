import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "bun:test";

import {
  WORDMARK_HEIGHT,
  WORDMARK_PATHS,
  WORDMARK_WIDTH,
} from "../../../assets/brand/wordmark-paths";
import { RAIL_LOGO_HEIGHT } from "./plate";
import { eclatRenderer } from "./index";
import { AR, FR, MOCK_ARABIC, MOCK_CARDS } from "./test-data";

const svg = readFileSync(
  join(import.meta.dir, "../../../assets/brand/botolago-wordmark-light.svg"),
  "utf8",
);

describe("the logo on the card's rail", () => {
  it("has the approved logo's box and as many paths as the file", () => {
    const box = /viewBox="0 0 ([\d.]+) ([\d.]+)"/.exec(svg)!;
    expect(Number(box[1])).toBeCloseTo(WORDMARK_WIDTH, 3);
    expect(Number(box[2])).toBeCloseTo(WORDMARK_HEIGHT, 3);
    expect(WORDMARK_PATHS).toHaveLength([...svg.matchAll(/<path\b/g)].length);
  });

  it("is drawn on every full card, in French and Arabic, at the logo's own proportions, upright left to right", () => {
    for (const c of [...MOCK_CARDS, ...MOCK_ARABIC]) {
      const html = eclatRenderer.full(c.profile, {
        strings: c.lang === "ar" ? AR : FR,
        theme: "dark",
      });
      const uses = [...html.matchAll(/<use href="#[^"]*-logo"([^>]*)\/>/g)];
      expect(uses, c.caption).toHaveLength(2);
      for (const u of uses) {
        // one uniform scale (no stretch), rotated a quarter turn so it reads bottom to top, never mirrored
        const t = /transform="([^"]*)"/.exec(u[1]!)![1]!;
        expect(t, c.caption).toContain("rotate(-90)");
        expect(t, c.caption).not.toContain("matrix(-1");
        expect(t, c.caption).toMatch(/scale\(0\.\d+\)$/);
      }
      expect(html.match(/data-meta="wordmark"/g), c.caption).toHaveLength(1);
      expect(html.includes(">BOTOLAGO<")).toBe(false);
    }
    const k = RAIL_LOGO_HEIGHT / WORDMARK_HEIGHT;
    expect(WORDMARK_WIDTH * k).toBeLessThan(260);
  });

  it("is left off the face-a-face card", () => {
    const c = MOCK_CARDS[0]!;
    const html = eclatRenderer.full(c.profile, {
      strings: c.lang === "ar" ? AR : FR,
      theme: "dark",
      compact: true,
    });
    expect(html.includes('data-meta="wordmark"')).toBe(false);
  });
});
