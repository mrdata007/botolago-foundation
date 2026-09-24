import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { clubs as mockClubs } from "@/mocks/data";

import {
  CLUB_PALETTE_RULES,
  CLUB_STYLE_VARS,
  PALETTE_TOKENS,
  clubColoursClash,
  clubFillDistance,
  clubMatchPalettes,
  clubPalette,
  clubStyle,
  resolvePaletteColour,
  type ClubPalette,
  type PaletteTheme,
} from "./club-palette";
import {
  contrastRatio,
  deltaEOk,
  mixOklab,
  normaliseHex,
  parseColour,
  parseHex,
  parseOklch,
  toHex,
} from "./colour";
import { kitTableEntries } from "./kits";

/**
 * Option A's club colours. The palette decides, per theme, which text colour
 * goes on a club fill, how dark an edge bar has to be to stay visible, and
 * whether the club colour can be used as text at all — all by measured WCAG
 * contrast. These tests hold every colour the product can paint to those
 * numbers, in both themes, and hold the token values the palette measures
 * against to the stylesheet.
 */

const THEMES: PaletteTheme[] = ["light", "dark"];

const rgb = (value: string, theme: PaletteTheme) => {
  const resolved = resolvePaletteColour(value, theme);
  if (!resolved) throw new Error(`unresolvable palette colour ${value} (${theme})`);
  return resolved;
};

const token = (theme: PaletteTheme, name: keyof (typeof PALETTE_TOKENS)["light"]) =>
  parseColour(PALETTE_TOKENS[theme][name])!;

/** The four measurements the rule promises, for one palette in one theme. */
function measure(palette: ClubPalette, theme: PaletteTheme) {
  const colours = palette[theme];
  const surface = token(theme, "--ui-surface");
  const onSurface = token(theme, "--ui-on-surface");
  const round = (n: number) => Math.round(n * 100) / 100;
  return {
    onFill: round(contrastRatio(rgb(colours.on, theme), rgb(colours.fill, theme))),
    edge: round(contrastRatio(rgb(colours.edge, theme), surface)),
    fgOnSurface: round(contrastRatio(rgb(colours.fg, theme), surface)),
    fgOnTint: round(contrastRatio(rgb(colours.fg, theme), rgb(colours.tint, theme))),
    textOnTint: round(contrastRatio(onSurface, rgb(colours.tint, theme))),
  };
}

describe("colour maths", () => {
  it("parses and prints sRGB hex", () => {
    expect(parseHex("#c00")).toEqual([0.8, 0, 0]);
    expect(normaliseHex("#C8102E")).toBe("#c8102e");
    expect(normaliseHex("#c00")).toBe("#cc0000");
    expect(normaliseHex("var(--ui-ink)")).toBeNull();
    expect(normaliseHex(null)).toBeNull();
    expect(toHex([1, 0.5, 0])).toBe("#ff8000");
  });

  it("reads the stylesheet's oklch() literals", () => {
    expect(toHex(parseOklch("oklch(1 0 0)")!)).toBe("#ffffff");
    expect(toHex(parseOklch("oklch(0 0 0)")!)).toBe("#000000");
    expect(parseOklch("oklch(100% 0 0)")).toEqual(parseOklch("oklch(1 0 0)"));
  });

  it("measures WCAG contrast", () => {
    expect(contrastRatio(parseHex("#ffffff")!, parseHex("#000000")!)).toBeCloseTo(21, 5);
    expect(contrastRatio(parseHex("#777777")!, parseHex("#777777")!)).toBe(1);
    // A known pair: WCAG's own worked example value for #767676 on white.
    expect(contrastRatio(parseHex("#767676")!, parseHex("#ffffff")!)).toBeCloseTo(4.54, 2);
  });

  it("mixes in OKLab the way color-mix(in oklab) does, and measures distance", () => {
    const red = parseHex("#ff0000")!;
    const blue = parseHex("#0000ff")!;
    expect(toHex(mixOklab(red, blue, 1))).toBe("#ff0000");
    expect(toHex(mixOklab(red, blue, 0))).toBe("#0000ff");
    expect(deltaEOk(red, red)).toBe(0);
    expect(deltaEOk(red, blue)).toBeGreaterThan(0.5);
  });
});

describe("club palette: the token values it measures against are the stylesheet's", () => {
  // The palette computes hex fills against copies of these tokens. If a token
  // is retuned in `styles.css` and not here, every club's contrast claim is
  // measured against a colour the page no longer paints.
  const css = readFileSync(join(import.meta.dir, "..", "styles.css"), "utf8");

  const block = (selector: ":root" | ".dark") => {
    const values = new Map<string, string>();
    const re = new RegExp(`(^|\\n)${selector.replace(".", "\\.")}\\s*\\{([^}]*)\\}`, "g");
    for (const match of css.matchAll(re)) {
      for (const decl of match[2].matchAll(/(--[a-z0-9-]+)\s*:\s*([^;]+);/g)) {
        values.set(decl[1], decl[2].trim());
      }
    }
    return values;
  };
  const root = block(":root");
  const dark = block(".dark");
  const resolve = (values: Map<string, string>, name: string): string | undefined => {
    const value = values.get(name) ?? root.get(name);
    const alias = value?.match(/^var\((--[a-z0-9-]+)\)$/)?.[1];
    return alias ? resolve(values, alias) : value;
  };

  for (const theme of THEMES) {
    for (const [name, value] of Object.entries(PALETTE_TOKENS[theme])) {
      it(`${theme} ${name} is ${value}`, () => {
        expect(resolve(theme === "light" ? root : dark, name)).toBe(value);
      });
    }
  }

  it("maps every --club-* property the helper sets in the [data-club] layer", () => {
    const light = css.match(/(^|\n)\[data-club\]\s*\{([^}]*)\}/)?.[2] ?? "";
    const darkLayer = css.match(/\n\.dark \[data-club\]\s*\{([^}]*)\}/)?.[1] ?? "";
    for (const name of CLUB_STYLE_VARS) {
      const layer = name.endsWith("-l") ? light : darkLayer;
      expect({ name, mapped: layer.includes(`var(${name},`) }).toEqual({ name, mapped: true });
    }
  });
});

describe("club palette: every kit colour is legible in both themes", () => {
  // Every primary AND every secondary in the kit table: a secondary becomes a
  // fill when the clash rule hands it to the away side.
  const colours = [
    ...new Set(
      kitTableEntries().flatMap(({ kit }) =>
        [kit.primary, kit.secondary].map((c) => c.toLowerCase()),
      ),
    ),
  ];

  it("sweeps the whole table", () => {
    expect(colours.length).toBeGreaterThan(15);
  });

  for (const hex of colours) {
    const palette = clubPalette({ primaryColor: hex });
    for (const theme of THEMES) {
      it(`${hex} (${theme}): text ≥ 4.5 on the fill, edge ≥ 3 on the surface, fg ≥ 4.5`, () => {
        const m = measure(palette, theme);
        expect(m.onFill).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.text);
        expect(m.edge).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.edge);
        expect(m.fgOnSurface).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.text);
        expect(m.fgOnTint).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.text);
        expect(m.textOnTint).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.text);
      });
    }
  }

  it("never uses a club colour as text in the dark theme", () => {
    for (const hex of colours) {
      expect(clubPalette({ primaryColor: hex }).dark.fg).toBe("var(--ui-on-surface)");
    }
  });

  it("writes every value as a hex or a pinned token, never anything else", () => {
    for (const hex of colours) {
      const palette = clubPalette({ primaryColor: hex });
      for (const theme of THEMES) {
        for (const value of Object.values(palette[theme])) {
          expect(value).toMatch(/^(#[0-9a-f]{6}|var\(--ui-[a-z-]+\))$/);
        }
      }
    }
  });
});

describe("club palette: the foreground is decided per theme, by contrast", () => {
  it("keeps white on the clubs that carry it, and on the ones a small step darker does", () => {
    const wac = clubPalette({ primaryColor: "#c8102e" });
    expect(wac.light).toMatchObject({ fill: "#c8102e", on: "var(--ui-on-ink-plain)" });
    // Raja green carries white at 4.1:1; 5% toward ink-deep gets it to 4.5.
    const rca = clubPalette({ primaryColor: "#0a8f3a" });
    expect(rca.light.on).toBe("var(--ui-on-ink-plain)");
    expect(rca.light.fill).not.toBe("#0a8f3a");
    expect(deltaEOk(parseHex(rca.light.fill)!, parseHex("#0a8f3a")!)).toBeLessThan(0.05);
  });

  it("puts ink-deep on FUS orange in both themes (white is 3.09:1 on the dark fill)", () => {
    const fus = clubPalette({ primaryColor: "#f28e00" });
    expect(fus.light).toMatchObject({ fill: "#f28e00", on: "var(--ui-ink-deep)" });
    expect(fus.dark.on).toBe("var(--ui-ink-deep)");
    const whiteOnDark = contrastRatio(
      rgb("var(--ui-on-ink-plain)", "dark"),
      rgb(fus.dark.fill, "dark"),
    );
    expect(whiteOnDark).toBeLessThan(CLUB_PALETTE_RULES.text);
  });

  it("flips a club whose answer differs by theme (RSB Berkane's orange)", () => {
    const rsb = clubPalette({ name: "RSB Berkane", primaryColor: "var(--ui-ink)" });
    expect(rsb.base).toBe("#f26522");
    expect(rsb.light.on).toBe("var(--ui-ink-deep)");
    expect(rsb.dark.on).toBe("var(--ui-on-ink-plain)");
  });

  it("deepens the dark fill into the dark page", () => {
    const far = clubPalette({ primaryColor: "#1a3a7a" });
    const page = token("dark", "--ui-page");
    expect(deltaEOk(parseHex(far.dark.fill)!, page)).toBeLessThan(
      deltaEOk(parseHex(far.light.fill)!, page),
    );
  });

  it("lifts an edge that would vanish on the dark surface (AS FAR navy)", () => {
    const far = clubPalette({ primaryColor: "#1a3a7a" });
    const surface = token("dark", "--ui-surface");
    expect(contrastRatio(parseHex("#1a3a7a")!, surface)).toBeLessThan(CLUB_PALETTE_RULES.edge);
    expect(far.dark.edge).not.toBe("#1a3a7a");
    expect(contrastRatio(parseHex(far.dark.edge)!, surface)).toBeGreaterThanOrEqual(3);
  });

  it("drops a club colour as text rather than turning it brown", () => {
    // FUS would need a third of the way to ink-deep to read as text on white.
    expect(clubPalette({ primaryColor: "#f28e00" }).light.fg).toBe("var(--ui-on-surface)");
    expect(clubPalette({ primaryColor: "#c8102e" }).light.fg).toBe("#c8102e");
  });
});

describe("club palette: where the colour comes from", () => {
  it("prefers a real hex from the data", () => {
    const palette = clubPalette({ id: "war", primaryColor: "#123456" });
    expect(palette).toMatchObject({ source: "data", base: "#123456", key: "war" });
  });

  it("resolves every mock club, by id", () => {
    for (const club of mockClubs) {
      const palette = clubPalette(club);
      expect({ id: club.id, source: palette.source, key: palette.key }).toEqual({
        id: club.id,
        source: "data",
        key: club.id,
      });
    }
  });

  it("resolves a mock-football club by its slug when the id is a UUID", () => {
    const mat = mockClubs.find((club) => club.id === "mat")!;
    const palette = clubPalette({
      ...mat,
      id: "00000000-0000-4000-8000-000000000006",
      slug: "mat",
      primaryColor: "var(--ui-ink)",
    });
    expect(palette).toMatchObject({ source: "kit", key: "mat", base: "#c00000" });
  });

  it("resolves the production clubs by name when the database has no colour", () => {
    // `primary_color` is null for every production club (BG-0112), and the
    // football presenter writes `var(--ui-ink)` in its place.
    const production = [
      "Amal Tiznit",
      "CODM Meknès",
      "CR Khemis Zemamra",
      "Difaâ El Jadida",
      "FAR Rabat",
      "FUS Rabat",
      "Hassania Agadir",
      "Ittihad Tanger",
      "Kawkab Marrakech",
      "Maghreb Fès",
      "Moghreb Tétouan",
      "Raja Casablanca",
      "RSB Berkane",
      "UTS Rabat",
      "Widad Témara",
      "Wydad Casablanca",
    ];
    for (const name of production) {
      const palette = clubPalette({
        id: "1b0c5e2a-0000-4000-8000-000000000000",
        slug: name.toLowerCase().replace(/\s+/g, "-"),
        name: { fr: name, ar: name },
        primaryColor: "var(--ui-ink)",
      });
      expect({ name, source: palette.source }).toEqual({ name, source: "kit" });
    }
  });

  it("does not paint Tétouan in Maghreb de Fès's yellow", () => {
    const tetouan = clubPalette({ name: "Maghreb Tétouan", primaryColor: "var(--ui-ink)" });
    expect(tetouan).toMatchObject({ key: "tétouan", base: "#c00000" });
    const fes = clubPalette({ name: "Maghreb Fès", primaryColor: "var(--ui-ink)" });
    expect(fes).toMatchObject({ key: "maghreb", base: "#ffd400" });
  });

  it("falls back to the ink for a club nobody knows", () => {
    const unknown = clubPalette({ name: "Club Inconnu", primaryColor: "var(--ui-ink)" });
    expect(unknown.source).toBe("ink");
    expect(unknown.base).toBeNull();
    expect(unknown.light).toEqual({
      fill: "var(--ui-ink)",
      on: "var(--ui-on-ink-plain)",
      edge: "var(--ui-ink-fg)",
      fg: "var(--ui-ink-fg)",
      tint: "var(--ui-surface-sunken)",
    });
    expect(unknown.dark).toEqual(unknown.light);
    expect(clubPalette(null).source).toBe("ink");
    expect(clubPalette(undefined).source).toBe("ink");
  });

  it("accepts a plain-string name", () => {
    expect(clubPalette({ name: "Wydad Casablanca" })).toMatchObject({ key: "wydad" });
  });
});

describe("club palette: home and away never share a colour", () => {
  const byId = (id: string) => mockClubs.find((club) => club.id === id)!;

  it("sends Tétouan to its white second kit against Wydad (ΔE 3.4)", () => {
    const { home, away, clash } = clubMatchPalettes(byId("war"), byId("mat"));
    expect(clash).toBe(true);
    expect(home.base).toBe("#c8102e");
    expect(away).toMatchObject({ source: "secondary", base: "#ffffff" });
    expect(deltaEOk(parseHex(home.base!)!, parseHex(away.base!)!)).toBeGreaterThanOrEqual(0.1);
  });

  it("sends Hassania to its black second kit against Berkane (ΔE 4.4)", () => {
    const { away, clash } = clubMatchPalettes(byId("rsb"), byId("hus"));
    expect(clash).toBe(true);
    expect(away).toMatchObject({ source: "secondary", base: "#111111" });
  });

  describe("compares the fills it PAINTS, in both themes — not the club hexes", () => {
    // `fillAndOn` darkens a light fill toward ink-deep until white passes,
    // and the dark fill is that fill mixed into the dark page, so two hexes
    // that clear 10 apart can paint closer than 10. Each of these pairs
    // cleared the old base-hex test and painted with no seam.
    const pairs: Array<[string, { id?: string; name?: string }, { id?: string; name?: string }]> = [
      [
        "Berkane #e63946 v Tétouan #c00000 (hexes 10.8; painted 8.9 / 7.5)",
        { id: "rsb" },
        { id: "mat" },
      ],
      [
        "Tétouan #c00000 v Hassania #e63900 (hexes 10.2; painted 8.3 / 7.1)",
        { id: "mat" },
        { id: "hus" },
      ],
      [
        "Olympique #1e88e5 v Tanger #1e5bb8 (hexes 13.3; painted 8.1 / 6.9)",
        { id: "moas" },
        { name: "Ittihad Tanger" },
      ],
      // Clears 10 in light (10.9); only the dark fills (9.2) collide.
      [
        "Maghreb Fès #ffd400 v DCHE #f2a900, in dark only",
        { name: "Maghreb Fès" },
        { name: "DCHE" },
      ],
    ];
    for (const [name, home, away] of pairs) {
      it(name, () => {
        const raw = clubFillDistance(clubPalette(home), clubPalette(away));
        expect(Math.min(raw.light, raw.dark)).toBeLessThan(CLUB_PALETTE_RULES.clash);
        const pair = clubMatchPalettes(home, away);
        expect(pair.clash).toBe(true);
        expect(pair.away.source).not.toBe(clubPalette(away).source);
        const resolved = clubFillDistance(pair.home, pair.away);
        expect(resolved.light).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.clash);
        expect(resolved.dark).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.clash);
      });
    }

    it("flags the Fès–DCHE pair on the dark fills alone", () => {
      const raw = clubFillDistance(
        clubPalette({ name: "Maghreb Fès" }),
        clubPalette({ name: "DCHE" }),
      );
      expect(raw.light).toBeGreaterThanOrEqual(CLUB_PALETTE_RULES.clash);
      expect(raw.dark).toBeLessThan(CLUB_PALETTE_RULES.clash);
      expect(
        clubColoursClash(clubPalette({ name: "Maghreb Fès" }), clubPalette({ name: "DCHE" })),
      ).toBe(true);
    });
  });

  it("leaves two distinct clubs alone", () => {
    const { home, away, clash } = clubMatchPalettes(byId("war"), byId("rca"));
    expect(clash).toBe(false);
    expect(home.base).toBe("#c8102e");
    expect(away.base).toBe("#0a8f3a");
  });

  it("falls back to the ink, then a neutral, when the second colour clashes too", () => {
    // Two unknown clubs are both ink: the away side has no second colour and
    // the ink is the clash, so it becomes the neutral slate.
    const { home, away, clash } = clubMatchPalettes({ name: "A" }, { name: "B" });
    expect(clash).toBe(true);
    expect(home.source).toBe("ink");
    expect(away.source).toBe("neutral");
    // A navy home against an unknown away: the ink would be navy on navy.
    const far = clubMatchPalettes(byId("asfar"), { name: "Inconnu" });
    expect(far.away.source).toBe("neutral");
  });

  it("never paints the away side the home colour, in either theme", () => {
    // Every mock club, every distinct kit-table entry and an unknown club
    // against each other: the fills that end up on the page are ≥ 10 apart in
    // light AND in dark.
    const kits = [
      ...new Map(
        kitTableEntries().map(({ kit }) => [
          `${kit.primary}${kit.secondary}`.toLowerCase(),
          { primaryColor: kit.primary, secondaryColor: kit.secondary },
        ]),
      ).values(),
    ];
    const sides = [...mockClubs, ...kits, { name: "Club Inconnu" }];
    for (const home of sides) {
      for (const away of sides) {
        if (home === away) continue;
        const pair = clubMatchPalettes(home, away);
        const distance = clubFillDistance(pair.home, pair.away);
        const label = `${JSON.stringify(home)} v ${JSON.stringify(away)}`;
        expect({ label, light: distance.light >= CLUB_PALETTE_RULES.clash }).toEqual({
          label,
          light: true,
        });
        expect({ label, dark: distance.dark >= CLUB_PALETTE_RULES.clash }).toEqual({
          label,
          dark: true,
        });
      }
    }
  });
});

describe("clubStyle", () => {
  it("returns data-club and the ten --club-* properties", () => {
    const style = clubStyle({ id: "war", primaryColor: "#c8102e" });
    expect(style["data-club"]).toBe("");
    expect(Object.keys(style.style).sort()).toEqual([...CLUB_STYLE_VARS].sort());
    expect(style.style["--club-fill-l"]).toBe("#c8102e");
    expect(style.style["--club-on-l"]).toBe("var(--ui-on-ink-plain)");
    expect(style.style["--club-fg-d"]).toBe("var(--ui-on-surface)");
  });

  it("takes a palette as well as a club, so a clash-resolved side can be spread", () => {
    const { away } = clubMatchPalettes(
      { id: "war", primaryColor: "#c8102e" },
      { id: "mat", primaryColor: "#c00000", secondaryColor: "#ffffff" },
    );
    expect(clubStyle(away).style["--club-fill-l"]).toBe("#ffffff");
  });

  it("writes the ink defaults out for an unknown club, so it never inherits a neighbour's", () => {
    const style = clubStyle({ name: "Inconnu" }).style;
    expect(style["--club-fill-l"]).toBe("var(--ui-ink)");
    expect(style["--club-fill-d"]).toBe("var(--ui-ink)");
  });
});
