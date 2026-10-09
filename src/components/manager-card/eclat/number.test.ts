import { describe, expect, it } from "bun:test";

import { kitTableEntries } from "@/lib/kits";

import { contrast, FOIL, shirtColours } from "./foil";
import { CHEST, DASH_FIT, DASH_HIT, JT_DX, JT_DY, JT_SCALE, SHIRT } from "./geometry";
import { measureTable } from "./measure";
import { fitNumber, OVR_HALO, printInkBox, printOf } from "./number";
import { FR, MOCK_CARDS, PROFILES } from "./test-data";
import { fullCard } from "./full";
import { inside, layer, pathPolygon, texts } from "./test-markup";
import { tokenMarkup } from "./token";
import { makeView } from "./view";

const polygon = pathPolygon(SHIRT);

describe("the number fits its chest (plan 5.2, revision 3)", () => {
  it("fits every rating 1 to 99 inside the chest box with its outline, and inside the shirt", () => {
    for (let n = 1; n <= 99; n++) {
      const print = printOf(n, measureTable);
      const b = printInkBox(print);
      expect(b.x0, String(n)).toBeGreaterThanOrEqual(CHEST.x0);
      expect(b.x1, String(n)).toBeLessThanOrEqual(CHEST.x1);
      expect(b.y0, String(n)).toBeGreaterThanOrEqual(CHEST.y0);
      expect(b.y1, String(n)).toBeLessThanOrEqual(CHEST.y1);
      for (const [x, y] of [
        [b.x0, b.y0],
        [b.x1, b.y0],
        [b.x0, b.y1],
        [b.x1, b.y1],
      ] as const)
        expect(inside(polygon, x, y), `${n} corner`).toBe(true);
      expect(print.fit.size).toBeLessThanOrEqual(300);
    }
  });

  it("fits the dash inside its own box, centred on y 600, at 220 at most", () => {
    const print = printOf(null, measureTable);
    const b = printInkBox(print);
    expect(print.text).toBe("—");
    expect(print.hit).toEqual(DASH_HIT);
    expect(b.x0).toBeGreaterThanOrEqual(DASH_FIT.x0 - 10);
    expect(b.x1).toBeLessThanOrEqual(DASH_FIT.x1 + 10);
    expect(b.y0).toBeGreaterThanOrEqual(DASH_HIT.y0 - 10);
    expect(b.y1).toBeLessThanOrEqual(DASH_HIT.y1 + 10);
    expect(print.fit.size).toBeLessThanOrEqual(220);
    for (const [x, y] of [
      [b.x0, b.y0],
      [b.x1, b.y1],
    ] as const)
      expect(inside(polygon, x, y)).toBe(true);
  });

  it("matches the sizes measured on the mock (to 2 %: its canvas rounds an ink box to whole pixels): 8 → 300, 11 → 283, 44 → 243, 88 → 252, 99 → 254", () => {
    const want: [number, number][] = [
      [8, 300],
      [11, 283.3],
      [44, 243.2],
      [88, 251.7],
      [99, 254.1],
    ];
    for (const [n, size] of want) {
      expect(printOf(n, measureTable).fit.size, String(n)).toBeGreaterThan(size * 0.98);
      expect(printOf(n, measureTable).fit.size, String(n)).toBeLessThan(size * 1.02);
    }
  });

  it("prints the number at 3:1 on its shirt for every club of the kit table and for no club", () => {
    const clubs = [
      ...kitTableEntries().map(({ kit }) => ({ primary: kit.primary, secondary: kit.secondary })),
      null,
    ];
    for (const club of clubs) {
      for (const key of ["base", "homa", "stade", "pro", "champion", "legend"] as const) {
        const c = shirtColours(club, FOIL[key]);
        expect(contrast(c.numberFill, c.primary), `${club?.primary} ${key}`).toBeGreaterThanOrEqual(
          3,
        );
      }
    }
  });

  it("fits the same ink box in both themes (the geometry never reads the theme)", () => {
    for (const theme of ["light", "dark"] as const) {
      const html = fullCard(PROFILES.rated, { strings: FR, theme });
      const num = texts(layer(html, "num")!).find((t) => t.attrs.class?.includes("mc-numtxt"))!;
      expect(Number(num.attrs["font-size"])).toBeCloseTo(printOf(84, measureTable).fit.size, 0);
    }
  });
});

describe("the number's layer (plan 5.2)", () => {
  const html = fullCard(MOCK_CARDS[3]!.profile, { strings: FR, theme: "light" });
  const num = layer(html, "num")!;

  it("holds one group, data-mc=ovr, with a transparent hit rectangle over the chest box", () => {
    expect(num.match(/data-mc="ovr"/g)).toHaveLength(1);
    expect(num).toContain(
      `<rect x="${CHEST.x0}" y="${CHEST.y0}" width="${CHEST.x1 - CHEST.x0}" height="${CHEST.y1 - CHEST.y0}" fill="transparent"/>`,
    );
    // the group holds the outline, the twill, the fill, the mesh and the light, and no animated class
    const group = /<g data-mc="ovr">(.*?)<\/g>/s.exec(num)![1]!;
    expect((group.match(/<text/g) ?? []).length).toBe(5);
    expect(group).not.toMatch(/mc-flood|mc-field|mc-mark|mc-capsule|mc-foil-shift/);
  });

  it("raises the print: a fabric shadow, a shade and a highlight outside the group, then the cloth on top", () => {
    expect(num).toContain("mc-num-sh");
    expect(num).toContain("mc-num-hi");
    expect(num).toMatch(/clip-path="url\(#[^)]*-numclip\)"/);
    expect(num.indexOf("mc-num-sh")).toBeLessThan(num.indexOf('data-mc="ovr"'));
    expect(num.indexOf("-numclip)")).toBeGreaterThan(num.indexOf('data-mc="ovr"'));
  });

  it("prints « OVR » under it with a halo, never on a dash or on the face-à-face card", () => {
    expect(num).toContain('data-ovrlabel="1"');
    expect(num).toContain('paint-order="stroke"');
    const dash = layer(fullCard(PROFILES.born0, { strings: FR, theme: "light" }), "num")!;
    expect(dash).not.toContain("data-ovrlabel");
    expect(dash).toContain(">—</text>");
    const compact = layer(
      fullCard(MOCK_CARDS[3]!.profile, { strings: FR, theme: "light", compact: true }),
      "num",
    )!;
    expect(compact).not.toContain("data-ovrlabel");
    // the mesh is not drawn at 200 px either
    expect((compact.match(/-knit\)/g) ?? []).length).toBe(0);
  });

  it("sets « OVR » on a halo that survives the tilt: 14 units or more, and 7:1 against the letters on every club", () => {
    // at 6 units (1 CSS px) the halo vanished once the card was tilted and the label resampled: « OVR »
    // read 3.3:1 against it with the pointer over it. A wider and darker halo holds 4.5:1 there.
    expect(OVR_HALO).toBeGreaterThanOrEqual(14);
    const clubs = kitTableEntries().map(({ kit }) => ({
      id: "x",
      initials: "XYZ",
      name: { fr: "X", ar: "X" },
      primary: kit.primary,
      secondary: kit.secondary,
    }));
    for (const club of [...clubs, null]) {
      for (const theme of ["light", "dark"] as const) {
        const html = fullCard({ ...PROFILES.rated, club }, { strings: FR, theme });
        const label = texts(layer(html, "num")!).find((t) => "data-ovrlabel" in t.attrs)!;
        expect(Number(label.attrs["stroke-width"]), `${club?.primary} ${theme}`).toBe(OVR_HALO);
        expect(
          contrast(label.attrs.fill!, label.attrs.stroke!),
          `${club?.primary} ${theme}`,
        ).toBeGreaterThanOrEqual(7);
      }
    }
    // and the halo stays clear of the number's own outline above it (the chest box ends at 796)
    const cap = 0.74 * 32;
    expect(830 - cap - OVR_HALO / 2).toBeGreaterThanOrEqual(CHEST.y1);
  });

  it("is never 0", () => {
    for (const p of [PROFILES.born0, PROFILES.forming1, PROFILES.insufficient3, PROFILES.guest]) {
      expect(layer(fullCard(p, { strings: FR, theme: "light" }), "num")).not.toMatch(/>\s*0\s*</);
    }
  });
});

describe("the number on tokens (plan 7)", () => {
  /** The box a token's number is fitted to, in card units. */
  const boxAt = (size: number, level: "card" | "jersey") => {
    const [k, yc] =
      size >= 80 ? [1.86, 720] : size >= 64 ? [1.82, 780] : size >= 44 ? [2.04, 820] : [2.21, 820];
    const B = level === "card" ? CHEST : { x0: 322, x1: 678, y0: 440, y1: 840, cy: 640 };
    return {
      x0: 500 + (B.x0 - 500) * k,
      x1: 500 + (B.x1 - 500) * k,
      y0: yc + (B.y0 - 603) * k,
      y1: yc + (B.y1 - 603) * k,
    };
  };

  it("keeps the number inside its transformed box at 80, 64, 48 and 32", () => {
    for (const size of [80, 64, 48, 32]) {
      for (const n of [8, 11, 44, 88, 99, null]) {
        const html = tokenMarkup(
          makeView({ ...PROFILES.rated, ovr: n, tier: n ? "pro" : null }, FR),
          size as 80,
          "light",
        );
        const t = texts(html).filter((x) => x.attrs.class?.includes("mc-f-d"));
        expect(t.length, `${size} ${n}`).toBe(2);
        const text = n == null ? "—" : String(n);
        const ink = measureTable(text, "d");
        const px = Number(t[1]!.attrs.x);
        const py = Number(t[1]!.attrs.y);
        const s = t[1]!.size;
        const left = px - (ink.w / 2) * s + ink.x0 * s;
        const right = px - (ink.w / 2) * s + ink.x1 * s;
        const box = boxAt(size, size >= 80 ? "card" : "jersey");
        expect(left, `${size} ${n}`).toBeGreaterThanOrEqual(box.x0 - 0.5);
        expect(right, `${size} ${n}`).toBeLessThanOrEqual(box.x1 + 0.5);
        expect(py - ink.a * s, `${size} ${n}`).toBeGreaterThanOrEqual(box.y0 - 0.5);
        expect(py + ink.d * s, `${size} ${n}`).toBeLessThanOrEqual(box.y1 + 0.5);
      }
    }
  });

  it("never makes the number smaller as the token grows", () => {
    const px = (size: number) => {
      const html = tokenMarkup(makeView({ ...PROFILES.rated, ovr: 88 }, FR), size as 80, "light");
      const t = texts(html).filter((x) => x.attrs.class?.includes("mc-f-d"));
      return (t[1]!.size * size) / 1618; // CSS px
    };
    const sizes = [32, 44, 56, 64, 80];
    for (let i = 1; i < sizes.length; i++) expect(px(sizes[i]!)).toBeGreaterThan(px(sizes[i - 1]!));
  });
});

describe("fitNumber", () => {
  it("centres the ink of a number on its box", () => {
    const fit = fitNumber("11", { x0: 0, x1: 1000, y0: 0, y1: 1000 }, 10, 100, measureTable);
    expect(fit.size).toBe(100);
    const ink = fit.ink;
    const left = fit.x - (ink.w / 2) * fit.size + ink.x0 * fit.size;
    const right = fit.x - (ink.w / 2) * fit.size + ink.x1 * fit.size;
    expect((left + right) / 2).toBeCloseTo(500, 3);
    expect(fit.y - ((ink.a - ink.d) / 2) * fit.size).toBeCloseTo(500, 3);
  });
});

// the card's own transform, for readers of the numbers above
void JT_DX;
void JT_DY;
void JT_SCALE;
