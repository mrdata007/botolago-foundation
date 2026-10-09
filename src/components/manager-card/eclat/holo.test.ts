import { describe, expect, it } from "bun:test";

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { FOIL, TIER_KEYS } from "./foil";
import { REST } from "./field";
import { CHEST, FOIL_CLIP, OUTLINE, TAB, WINDOW, WINDOW_IN } from "./geometry";
import { eclatRenderer } from "./index";
import { AR, FR, MOCK_ARABIC, MOCK_CARDS } from "./test-data";
import { layer, pathBox } from "./test-markup";
import type { CardProfile } from "../types";

const CSS = readFileSync(join(import.meta.dir, "eclat.css"), "utf8");

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

  it("keeps the HTML overlay (sheen and diffraction) off the tab: the club disc, the initials and the season", () => {
    // the overlay's clip is the outline with the tab cut out; read it from the stylesheet and test
    // points of the tab and of the body against it, in both directions
    const polygon = (sel: RegExp): [number, number][] => {
      const m = sel.exec(CSS);
      if (!m) throw new Error(`no clip-path for ${sel}`);
      return m[1]!
        .split(",")
        .map(
          (pt) =>
            pt
              .trim()
              .split(/\s+/)
              .map((v) => (v === "0" ? 0 : parseFloat(v))) as [number, number],
        )
        .map(([x, y]) => [x * 10, y * 16.18] as [number, number]);
    };
    const inside = (pts: [number, number][], x: number, y: number): boolean => {
      let hit = false;
      for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
        const [xi, yi] = pts[i]!;
        const [xj, yj] = pts[j]!;
        if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const ltr = polygon(/\.mc-eclat__foil\s*\{[^}]*?clip-path:\s*polygon\(([^)]*)\)/s);
    const rtl = polygon(
      /\.mc-eclat\[dir="rtl"\] \.mc-eclat__foil\s*\{[^}]*?clip-path:\s*polygon\(([^)]*)\)/s,
    );
    // the geometry's own constant is the same polygon
    expect(FOIL_CLIP.split(",").length).toBe(ltr.length);
    const tab = pathBox(TAB);
    // points of the tab: the disc's centre and rim, the initials, the season, the four corners
    const inTab: [number, number][] = [
      [103, 134],
      [103, 146],
      [103, 262],
      [60, 134],
      [150, 134],
      [8, 40],
      [198, 14],
      [198, 290],
      [8, 290],
    ];
    for (const [x, y] of inTab) {
      expect(x >= tab.x0 && x <= tab.x1 && y >= tab.y0 && y <= tab.y1).toBe(true);
      expect(inside(ltr, x, y), `ltr tab ${x},${y}`).toBe(false);
      expect(inside(rtl, 1000 - x, y), `rtl tab ${1000 - x},${y}`).toBe(false);
    }
    // the rest of the card is still lit: the shield, the plate, the corner beside the tab
    for (const [x, y] of [
      [500, 800],
      [500, 1300],
      [900, 100],
      [900, 1400],
      [300, 120],
      [103, 400],
    ] as const) {
      expect(inside(ltr, x, y), `ltr body ${x},${y}`).toBe(true);
      expect(inside(rtl, 1000 - x, y), `rtl body ${1000 - x},${y}`).toBe(true);
    }
  });

  it("mirrors the foil with the shapes in Arabic", () => {
    const ar = layer(draw(MOCK_ARABIC[0]!.profile, "ar"), "holo")!;
    expect(ar.startsWith('<g transform="matrix(-1 0 0 1 1000 0)">')).toBe(true);
    const fr = layer(draw(profileOf("champion")), "holo")!;
    expect(fr.includes("matrix(-1")).toBe(false);
  });
});

/** The rule `.<cls> { transform: translate(calc(var(--mc-ax) * Xpx ...), calc(var(--mc-ay) * Ypx ...)) }`. */
function followed(cls: string): { x: number; y: number } {
  const m = new RegExp(
    `\\.${cls}\\s*\\{\\s*transform:\\s*translate\\(\\s*calc\\(var\\(--mc-ax\\) \\* (-?[\\d.]+)px[^)]*\\)\\),\\s*calc\\(var\\(--mc-ay\\) \\* (-?[\\d.]+)px`,
  ).exec(CSS);
  if (!m) throw new Error(`no light-following rule for .${cls}`);
  return { x: Number(m[1]), y: Number(m[2]) };
}

describe("the foil moves with the light and is still all there at rest (plan 5.5, 8.2)", () => {
  it("rests where the share art and a reduced-motion card draw it: the stylesheet's rest light gives the flat transforms", () => {
    const AX = 0.24;
    const AY = 0.64;
    const at = (cls: string) => {
      const f = followed(cls);
      return `translate(${+(AX * f.x).toFixed(2)} ${+(AY * f.y).toFixed(2)})`;
    };
    expect(at("mc-foil-shift")).toBe(REST.foil);
    expect(at("mc-spec-shift")).toBe(REST.spec);
    expect(at("mc-light-follow")).toBe(REST.light);
    expect(at("mc-shirt-cast")).toBe(REST.cast);
    // the root's own rest light is that same pair, mirrored in Arabic
    expect(CSS).toMatch(/--mc-ax:\s*0\.24;\s*--mc-ay:\s*0\.64;/);
    expect(CSS).toMatch(/\.mc-eclat\[dir="rtl"\]\s*\{\s*--mc-ax:\s*-0\.24;\s*--mc-dx:\s*-1/);
  });

  it("keeps each foil rectangle over what its mask shows at the largest shift of the light", () => {
    const f = followed("mc-foil-shift");
    // the light runs from -1 to 1 on both axes; Arabic multiplies x by -1 inside the mirrored group
    const shifts = [-1, 1].flatMap((ax) => [-1, 1].map((ay) => [ax * f.x, ay * f.y] as const));
    const covers = (
      r: { x: number; y: number; w: number; h: number },
      b: ReturnType<typeof pathBox>,
      what: string,
    ) => {
      for (const [dx, dy] of shifts) {
        expect(r.x + dx, `${what} left at ${dx},${dy}`).toBeLessThanOrEqual(b.x0);
        expect(r.x + r.w + dx, `${what} right at ${dx},${dy}`).toBeGreaterThanOrEqual(b.x1);
        expect(r.y + dy, `${what} top at ${dx},${dy}`).toBeLessThanOrEqual(b.y0);
        expect(r.y + r.h + dy, `${what} bottom at ${dx},${dy}`).toBeGreaterThanOrEqual(b.y1);
      }
    };
    const rect = (markup: string) =>
      [
        ...markup.matchAll(
          /<rect class="mc-foil-shift" x="(-?[\d.]+)" y="(-?[\d.]+)" width="([\d.]+)" height="([\d.]+)"/g,
        ),
      ].map((m) => ({ x: +m[1]!, y: +m[2]!, w: +m[3]!, h: +m[4]! }));
    for (const key of ["champion", "legend"] as const) {
      const html = draw(profileOf(key));
      // the edge, the band and the tab's rim: the whole card
      const edge = rect(layer(html, "holo")!);
      expect(edge, key).toHaveLength(1);
      covers(edge[0]!, pathBox(OUTLINE), `${key} edge`);
      // the honeycomb's cells: the shield window
      const cells = rect(layer(html, "base")!);
      expect(cells, key).toHaveLength(1);
      covers(cells[0]!, pathBox(WINDOW), `${key} cells`);
    }
    // LEGEND's plaque: the plaque's own box
    const legend = draw(profileOf("legend"));
    const plaque = rect(layer(legend, "frame")!);
    expect(plaque).toHaveLength(1);
    const clip = /<clipPath id="[^"]*-plq"><path d="([^"]*)"/.exec(layer(legend, "frame")!)!;
    covers(plaque[0]!, pathBox(clip[1]!), "legend plaque");
  });

  it("puts the glints where nothing is printed: clear of the number, the tab and the plate's text", () => {
    for (const key of ["champion", "legend"] as const) {
      const holo = layer(draw(profileOf(key)), "holo")!;
      const glints = [...holo.matchAll(/<path class="mc-glint-([ab])" d="M([\d.]+) ([\d.-]+)/g)];
      expect(glints.length).toBe(key === "legend" ? 4 : 2);
      glints.forEach((g, i) => expect(g[1]).toBe(i % 2 ? "b" : "a"));
      for (const g of glints) {
        // the star's path starts at its top point: M x (y - s)
        const x = +g[2]!;
        const y = +g[3]! + 20;
        const clearOfNumber =
          x < CHEST.x0 - 20 || x > CHEST.x1 + 20 || y < CHEST.y0 - 20 || y > CHEST.y1 + 20;
        expect(clearOfNumber, `${key} ${x},${y}`).toBe(true);
        // above the plaque's words (the first name line starts at 1090)
        expect(y, `${key} ${x},${y}`).toBeLessThan(1070);
      }
    }
  });

  it("is the same card with the foil frozen: no animation property outside a no-preference block touches it", () => {
    const m = /\.mc-foil-shift\s*\{([^}]*)\}/.exec(CSS)![1]!;
    expect(m.includes("animation")).toBe(false);
    expect(m.includes("transition")).toBe(false);
  });
});
