import { describe, expect, it } from "bun:test";

import { kitTableEntries } from "@/lib/kits";

import {
  CHAR,
  CREAM,
  DASH_RIB_MIN,
  FIGURE_MIN,
  STRIPE_MIN,
  contrast,
  dashShade,
  mix,
  palette,
  type Palette,
} from "./palette";

/** The charcoal's red-to-blue spread is zero: a shade of the wool keeps the wool's warmth. */
const CHAR_SPREAD = 0;

const of = (primary: string | null, secondary: string | null = null): Palette =>
  palette({
    club: primary
      ? { id: "x", initials: "XX", name: { fr: "X", ar: "X" }, primary, secondary }
      : null,
  });

/** The figure yarn of each tier against what it is knitted on, before the knit's shadows. */
function pairs(P: Palette): [string, string, string, number][] {
  return [
    ["homa figures", P.R, P.G, FIGURE_MIN],
    ["stade figures", P.Sd, P.G, FIGURE_MIN],
    ["pro figures on the cream panel", P.K, CREAM, FIGURE_MIN],
    ["champion figures", P.F, P.G, FIGURE_MIN],
    ["base dash", P.dash, P.G, FIGURE_MIN],
    ["name", P.N, P.G, FIGURE_MIN],
    ["year", P.Y, P.G, FIGURE_MIN],
    ["tier word on its strip", P.T, P.S, FIGURE_MIN],
    ["stripes and tacking lines", P.S, P.G, STRIPE_MIN],
    ["2026 on the cast-on", P.castInk, P.cast, 3],
    ["the patch's ink", "#23252a", P.patch, 7],
  ];
}

describe("every yarn keeps its contrast on the ground", () => {
  for (const { key, kit } of kitTableEntries())
    it(`${key} ${kit.primary} / ${kit.secondary}`, () => {
      for (const [what, fg, bg, min] of pairs(of(kit.primary, kit.secondary)))
        expect(`${what} ${contrast(fg, bg) >= min}`).toBe(`${what} true`);
    });

  it("undyed wool (no club)", () => {
    for (const [what, fg, bg, min] of pairs(of(null)))
      expect(`${what} ${contrast(fg, bg) >= min}`).toBe(`${what} true`);
    expect(of(null).wool).toBe(true);
  });

  it("a sweep of 4,000 grounds and second colours, hue by hue", () => {
    const hsl = (h: number, s: number, l: number) => {
      const a = s * Math.min(l, 1 - l);
      const f = (n: number) => {
        const k = (n + h / 30) % 12;
        const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
        return Math.round(c * 255)
          .toString(16)
          .padStart(2, "0");
      };
      return `#${f(0)}${f(8)}${f(4)}`;
    };
    let worst = Infinity;
    for (let h = 0; h < 360; h += 10)
      for (const l of [0.08, 0.25, 0.4, 0.55, 0.7, 0.9])
        for (const sec of [null, "#ffffff", "#111111", "#f2a900", "#1e3a7a"]) {
          const P = of(hsl(h, 0.8, l), sec);
          for (const [what, fg, bg, min] of pairs(P)) {
            const c = contrast(fg, bg);
            worst = Math.min(worst, c / min);
            if (c < min) throw new Error(`${what} ${c.toFixed(2)} < ${min} on ${P.G} / ${P.L}`);
          }
        }
    expect(worst).toBeGreaterThanOrEqual(1);
  });

  it("the unknown-number dash is cream on a dark ground and a mid-tone of the ground on a pale one", () => {
    // Raja's green and Wydad's red are dark enough for cream.
    expect(of("#0a8f3a", "#ffffff").dash).toBe(CREAM);
    expect(of("#c8102e", "#ffffff").dash).toBe(CREAM);
    // Undyed wool and a yellow ground used to take the charcoal: a near-black bar.
    for (const ground of [null, "#f5c400", "#e8e1d0"]) {
      const P = of(ground);
      expect(P.dash).not.toBe(CHAR);
      expect(P.dash).toBe(dashShade(P.G));
      // a shade of the ground yarn: no channel lighter than the ground's
      const [dr, dg, db] = [1, 3, 5].map((i) => parseInt(P.dash.slice(i, i + 2), 16));
      const [gr, gg, gb] = [1, 3, 5].map((i) => parseInt(P.G.slice(i, i + 2), 16));
      expect(dr <= gr && dg <= gg && db <= gb).toBe(true);
      // and on undyed wool it is a warm shade of the wool, not the neutral charcoal
      if (!ground) expect(dr - db).toBeGreaterThan(CHAR_SPREAD);
      // it keeps its distance from the rib it is knitted on (the rendered pixels are measured in
      // docs/product/manager-card-section/wp6b/INDEX.md)
      expect(contrast(P.dash, mix(P.G, "#000000", 0.25))).toBeGreaterThanOrEqual(DASH_RIB_MIN);
      expect(contrast(P.dash, P.G)).toBeGreaterThanOrEqual(FIGURE_MIN);
    }
  });

  it("an invalid colour is no club: undyed wool", () => {
    expect(of("not a colour").wool).toBe(true);
    expect(of("#12345").wool).toBe(true);
    expect(of("#0a8f3a", "nope").L).toBe(CREAM);
  });
});

describe("palette", () => {
  it("keeps the lab's choices where they already clear the floor", () => {
    // Raja: cream-ish second colour, white figures on green for HOMA, the club's white for STADE
    const raja = of("#0a8f3a", "#ffffff");
    expect(raja.Sd).toBe("#ffffff");
    expect(raja.N).toBe(CREAM);
    expect(raja.S).toBe("#ffffff");
    expect(raja.patch).toBe("#ffffff");
    expect(raja.cast).toBe("#ffffff");
    // a pale ground takes charcoal
    expect(of("#ffd400", "#111111").N).toBe(CHAR);
  });
  it("is cached and pure", () => {
    expect(of("#0a8f3a", "#ffffff")).toBe(of("#0a8f3a", "#ffffff"));
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});
