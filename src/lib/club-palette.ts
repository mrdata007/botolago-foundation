/**
 * Club colours, as the design system consumes them (Option A "Club colours").
 *
 * This is the ONE place a club's colour becomes something a screen paints.
 * A screen never reads `club.primaryColor` or the kit table itself: it asks
 * for `clubStyle(club)`, spreads the result on an element, and styles that
 * element and its children with the `--ui-club*` tokens (`ui.club.*`,
 * `ui.edge.*`). The kit reads only `--ui-*` names, so no hex ever enters it.
 *
 *   <div {...clubStyle(match.home)} className={ui.club.fill}>…</div>
 *
 * WHERE THE COLOUR COMES FROM, in order:
 *   1. a real `#rrggbb` `primaryColor` in the data;
 *   2. the kit table in `kits.ts` — by id, then slug, then a name fragment —
 *      which is what already colours the shirts in production;
 *   3. the brand ink, i.e. the tokens' own defaults.
 * `primary_color` is null for every production club today (BG-0112), so step
 * 2 is what production renders. A `var(--…)` fallback in the data (which is
 * what `presentFootballClub` writes) is not a colour and is skipped.
 *
 * WHAT IS COMPUTED, per theme, from that one colour:
 *   fill  the block colour. White text on it if white reaches 4.5:1, else the
 *         smallest OKLab step (≤ 15%) toward `--ui-ink-deep` that gets white
 *         there, else the untouched colour under `--ui-ink-deep` text. The
 *         dark fill is the light one mixed 85% into the dark `--ui-page`, and
 *         its text is decided again — FUS orange takes dark text in light
 *         AND in dark, white would be 3.09:1 there; other clubs flip.
 *   on    the text on `fill`: `var(--ui-on-ink-plain)` or `var(--ui-ink-deep)`.
 *   edge  a 4px bar or ring: ≥ 3:1 against `--ui-surface` (WCAG 1.4.11).
 *         Darkened toward ink-deep in light, lifted toward `--ui-on-surface`
 *         in dark, in 1% steps until it passes.
 *   fg    the club colour as TEXT on a surface or on the club tint: ≥ 4.5:1
 *         against both, within 15% of the club colour, else
 *         `var(--ui-on-surface)`. Always `--ui-on-surface` in dark, where no
 *         club colour survives as text without turning into a pastel.
 *   tint  8% of the club over `--ui-surface` (14% in dark).
 *
 * A fill that would vanish into the page or the card of its theme takes, in
 * that theme only, the club's second colour or else the ink (`onItsGround`),
 * the ladder the home/away clash rule uses.
 *
 * Hex values are computed here rather than written as `color-mix()` in CSS
 * because the foreground choice depends on the RESULT of the mix, and CSS has
 * no way to branch on a contrast (`contrast-color()` is not shipped).
 *
 * The token values this measures against are copied into `PALETTE_TOKENS`,
 * and `club-palette.test.ts` parses `src/styles.css` so a token retune cannot
 * silently invalidate them.
 *
 * Pure functions: no React, no DOM, no theme read at runtime. The light and
 * dark answers ship together as inline custom properties, and the
 * `[data-club]` layer in `styles.css` picks one — so it is SSR-safe and
 * follows a `.dark` class that arrives after hydration.
 */

import type { CSSProperties } from "react";

import {
  contrastRatio,
  deltaEOk,
  mixOklab,
  mixSrgb,
  normaliseHex,
  parseColour,
  parseHex,
  toHex,
  type Rgb,
} from "./colour";
import { findClubKit, type KitLookup } from "./kits";

/**
 * The token values the palette measures against, exactly as `src/styles.css`
 * declares them (`--ui-ink` in light resolves through `--brand-primary`).
 * Pinned by `club-palette.test.ts`.
 */
export const PALETTE_TOKENS = {
  light: {
    "--ui-page": "oklch(0.975 0.004 250)",
    "--ui-surface": "oklch(1 0 0)",
    "--ui-on-surface": "oklch(0.16 0.03 260)",
    "--ui-ink": "oklch(0.32 0.1 258)",
    "--ui-ink-deep": "oklch(0.24 0.09 258)",
    "--ui-on-ink-plain": "oklch(1 0 0)",
    // The ink palette's edge, text and tint: measured too, now that a club
    // whose own colour vanishes can be painted in the ink.
    "--ui-ink-fg": "oklch(0.32 0.1 258)",
    "--ui-surface-sunken": "oklch(0.93 0.006 250)",
  },
  dark: {
    "--ui-page": "oklch(0.15 0.03 260)",
    "--ui-surface": "oklch(0.22 0.03 260)",
    "--ui-on-surface": "oklch(0.97 0.01 250)",
    "--ui-ink": "oklch(0.3 0.08 260)",
    "--ui-ink-deep": "oklch(0.22 0.07 260)",
    "--ui-on-ink-plain": "oklch(0.97 0.01 250)",
    "--ui-ink-fg": "oklch(0.86 0.08 232)",
    "--ui-surface-sunken": "oklch(0.26 0.03 260)",
  },
} as const;

export type PaletteTheme = keyof typeof PALETTE_TOKENS;
type PaletteToken = keyof (typeof PALETTE_TOKENS)["light"];

/** The thresholds and mix weights the rule uses. */
export const CLUB_PALETTE_RULES = {
  /** WCAG 1.4.3 — text on a fill, club colour as text. */
  text: 4.5,
  /** WCAG 1.4.11 — the edge bar / ring against the surface. */
  edge: 3,
  /** How far (OKLab mix toward ink-deep) a fill or text colour may move and still be "the club colour". */
  maxShift: 0.15,
  /** Dark fill = light fill at this weight over the dark `--ui-page`. */
  darkFillWeight: 0.85,
  /** Club share of the tint over `--ui-surface`, per theme. */
  tint: { light: 0.08, dark: 0.14 },
  /**
   * ΔEok (0..1 scale) under which home and away read as the same colour, and
   * under which a fill reads as the page or card it sits on (`clubFillShows`).
   */
  clash: 0.1,
  /**
   * Headroom above each threshold. The browser converts the oklch tokens to
   * sRGB itself, and a rasterised swatch can land one 8-bit step away from
   * this module's arithmetic — measured: an edge computed at 3.0003 read
   * 2.9990 off the screen. Every choice is made against threshold + this.
   */
  headroom: 0.02,
} as const;

const TEXT_MIN = CLUB_PALETTE_RULES.text + CLUB_PALETTE_RULES.headroom;
const EDGE_MIN = CLUB_PALETTE_RULES.edge + CLUB_PALETTE_RULES.headroom;

/** The `--club-*` properties `clubStyle` sets; `styles.css` maps them onto `--ui-club*`. */
export const CLUB_STYLE_VARS = [
  "--club-fill-l",
  "--club-on-l",
  "--club-edge-l",
  "--club-fg-l",
  "--club-tint-l",
  "--club-band-l",
  "--club-fill-d",
  "--club-on-d",
  "--club-edge-d",
  "--club-fg-d",
  "--club-tint-d",
  "--club-band-d",
] as const;

export type ClubStyleVar = (typeof CLUB_STYLE_VARS)[number];

/** What the palette reads from a club: `Club` satisfies it, and so does a bare DTO. */
export interface ClubColourSource extends KitLookup {
  primaryColor?: string | null;
  secondaryColor?: string | null;
}

/** One theme's answer. Each value is a CSS colour: a `#rrggbb` or a `var(--ui-…)`. */
export interface ClubThemeColours {
  fill: string;
  on: string;
  edge: string;
  fg: string;
  tint: string;
}

export interface ClubPalette {
  /**
   * Where the colour came from: the data, the kit table, the away side's
   * secondary colour (clash rule), or no colour at all — `ink` (the tokens'
   * own defaults) and `neutral` (the clash rule's last resort).
   */
  source: "data" | "kit" | "secondary" | "ink" | "neutral";
  /** The kit-table key that matched (id, slug or name fragment), if any. */
  key: string | null;
  /** The `#rrggbb` the palette was computed from; `null` for `ink`. */
  base: string | null;
  /** The club's second colour, when known — what the clash rule falls back to. */
  secondary: string | null;
  light: ClubThemeColours;
  dark: ClubThemeColours;
  /**
   * The themes whose colours were taken from another step of the ladder (the
   * second colour, the ink, the neutral slate) because the fill would have
   * vanished into the page or the card there, or matched the other side's,
   * and which step they came from. Empty when each theme paints its own.
   */
  replaced: Partial<Record<PaletteTheme, ClubPalette["source"]>>;
}

/** The inline style `clubStyle` returns: React's CSS properties plus the ten `--club-*` vars. */
export type ClubStyle = CSSProperties & Record<ClubStyleVar, string>;

const rgbOf = (theme: PaletteTheme, token: PaletteToken): Rgb =>
  parseColour(PALETTE_TOKENS[theme][token])!;

/** Resolve a palette value (`#rrggbb` or `var(--ui-…)` of a pinned token) to sRGB. */
export function resolvePaletteColour(value: string, theme: PaletteTheme): Rgb | null {
  const token = /^var\((--ui-[a-z-]+)\)$/.exec(value)?.[1];
  if (token) {
    return token in PALETTE_TOKENS[theme] ? rgbOf(theme, token as PaletteToken) : null;
  }
  return parseHex(value);
}

/** What the browser will paint: the colour after a round trip through `#rrggbb`. */
const painted = (rgb: Rgb): Rgb => parseHex(toHex(rgb))!;

/**
 * The first colour, stepping 1% at a time from `from` toward `toward` in
 * OKLab, that passes `test`, and how far it moved. `null` past `maxShift`.
 */
function step(
  from: Rgb,
  toward: Rgb,
  maxShift: number,
  test: (colour: Rgb) => boolean,
): { colour: Rgb; shift: number } | null {
  for (let percent = 0; percent <= Math.round(maxShift * 100); percent += 1) {
    const colour = painted(percent === 0 ? from : mixOklab(toward, from, percent / 100));
    if (test(colour)) return { colour, shift: percent / 100 };
  }
  return null;
}

const ON_PLAIN = "var(--ui-on-ink-plain)";
const ON_DEEP = "var(--ui-ink-deep)";
const ON_SURFACE = "var(--ui-on-surface)";

/** The fill and the text that goes on it, for one theme, starting from `start`. */
function fillAndOn(start: Rgb, theme: PaletteTheme): { fill: Rgb; on: string } {
  const plain = rgbOf(theme, "--ui-on-ink-plain");
  const deep = rgbOf(theme, "--ui-ink-deep");
  const passes = (fg: Rgb) => (fill: Rgb) => contrastRatio(fill, fg) >= TEXT_MIN;

  if (theme === "light") {
    // White on the club colour, darkened a little if that is all it takes.
    const white = step(start, deep, CLUB_PALETTE_RULES.maxShift, passes(plain));
    if (white) return { fill: white.colour, on: ON_PLAIN };
    // A light colour (orange, yellow, white) keeps its fill and takes dark text.
    if (passes(deep)(start)) return { fill: start, on: ON_DEEP };
  } else {
    if (passes(plain)(start)) return { fill: start, on: ON_PLAIN };
    if (passes(deep)(start)) return { fill: start, on: ON_DEEP };
  }
  // A mid-tone neither text colour clears: darken until white does. Always
  // terminates — ink-deep itself carries white at far more than 4.5:1.
  return { fill: step(start, deep, 1, passes(plain))!.colour, on: ON_PLAIN };
}

/** The full two-theme palette for one `#rrggbb`. */
function paletteFromHex(
  hex: string,
  meta: Pick<ClubPalette, "source" | "key" | "secondary">,
): ClubPalette {
  const base = parseHex(hex)!;
  const light = fillAndOn(base, "light");
  const darkStart = painted(
    mixOklab(light.fill, rgbOf("dark", "--ui-page"), CLUB_PALETTE_RULES.darkFillWeight),
  );
  const dark = fillAndOn(darkStart, "dark");

  const surfaceL = rgbOf("light", "--ui-surface");
  const surfaceD = rgbOf("dark", "--ui-surface");
  const tintL = painted(mixSrgb(light.fill, surfaceL, CLUB_PALETTE_RULES.tint.light));
  const tintD = painted(mixSrgb(light.fill, surfaceD, CLUB_PALETTE_RULES.tint.dark));

  const edgeL = step(
    light.fill,
    rgbOf("light", "--ui-ink-deep"),
    1,
    (c) => contrastRatio(c, surfaceL) >= EDGE_MIN,
  )!.colour;
  const edgeD = step(
    light.fill,
    rgbOf("dark", "--ui-on-surface"),
    1,
    (c) => contrastRatio(c, surfaceD) >= EDGE_MIN,
  )!.colour;

  const fgL = step(
    light.fill,
    rgbOf("light", "--ui-ink-deep"),
    CLUB_PALETTE_RULES.maxShift,
    (c) => contrastRatio(c, surfaceL) >= TEXT_MIN && contrastRatio(c, tintL) >= TEXT_MIN,
  );

  return {
    ...meta,
    base: toHex(base),
    light: {
      fill: toHex(light.fill),
      on: light.on,
      edge: toHex(edgeL),
      fg: fgL ? toHex(fgL.colour) : ON_SURFACE,
      tint: toHex(tintL),
    },
    dark: {
      fill: toHex(dark.fill),
      on: dark.on,
      edge: toHex(edgeD),
      fg: ON_SURFACE,
      tint: toHex(tintD),
    },
    replaced: {},
  };
}

const INK_FILL = "var(--ui-ink)";

/** No club colour: the `--ui-club*` tokens' own defaults, written out. */
function inkPalette(secondary: string | null, key: string | null): ClubPalette {
  const colours: ClubThemeColours = {
    fill: INK_FILL,
    on: ON_PLAIN,
    edge: "var(--ui-ink-fg)",
    fg: "var(--ui-ink-fg)",
    tint: "var(--ui-surface-sunken)",
  };
  return {
    source: "ink",
    key,
    base: null,
    secondary,
    light: colours,
    dark: { ...colours },
    replaced: {},
  };
}

/** The ladder's last resort: a slate that is neither a club colour nor the ink. */
const NEUTRAL = "#5a667d";

const neutralPalette = (key: string | null): ClubPalette =>
  paletteFromHex(NEUTRAL, { source: "neutral", key, secondary: null });

const THEMES: readonly PaletteTheme[] = ["light", "dark"];

/** The fill a palette actually paints in one theme, as sRGB. */
const paintedFill = (palette: ClubPalette, theme: PaletteTheme): Rgb =>
  resolvePaletteColour(palette[theme].fill, theme)!;

/** `palette` with one theme's colours taken from another step of the ladder. */
function withThemeFrom(palette: ClubPalette, theme: PaletteTheme, from: ClubPalette): ClubPalette {
  return {
    ...palette,
    [theme]: { ...from[theme] },
    replaced: { ...palette.replaced, [theme]: from.replaced[theme] ?? from.source },
  };
}

/** The two grounds a club fill is painted on: the page and the card. */
const GROUNDS = ["--ui-page", "--ui-surface"] as const;

/**
 * Whether a palette's fill, in one theme, stands apart from the page and the
 * card it is painted on, by the distance two sides of a match must keep
 * (`CLUB_PALETTE_RULES.clash`). Zemamra's white kit does not in light (0.000
 * from the card); FAR's black does not in dark (0.034 from the page).
 *
 * The ink is not measured: it is the design system's own fill, which every ink
 * button paints on these grounds in both themes (in dark it sits 0.094 from
 * the card, by design). So the ladder always ends somewhere.
 */
export function clubFillShows(palette: ClubPalette, theme: PaletteTheme): boolean {
  if (palette[theme].fill === INK_FILL) return true;
  const fill = paintedFill(palette, theme);
  return GROUNDS.every(
    (ground) => deltaEOk(fill, rgbOf(theme, ground)) >= CLUB_PALETTE_RULES.clash,
  );
}

/**
 * The surface rule. A fill that would vanish into its ground is treated like a
 * clash: in that theme only, the palette takes the first next step of the
 * clash ladder whose fill shows there — the `fallbacks` given (the club's
 * second colour), then the ink, which always shows (so the neutral slate is
 * never needed here). The other theme keeps the club's own colour: Zemamra
 * paints its green in light and its white kit in dark; FAR its black in light
 * and its red in dark.
 */
function onItsGround(palette: ClubPalette, fallbacks: readonly ClubPalette[]): ClubPalette {
  let result = palette;
  for (const theme of THEMES) {
    if (clubFillShows(palette, theme)) continue;
    const ladder = [...fallbacks, inkPalette(palette.secondary, palette.key)];
    result = withThemeFrom(result, theme, ladder.find((step) => clubFillShows(step, theme))!);
  }
  return result;
}

/** A club's second colour as a step of the ladder, itself held to the surface rule. */
function secondaryStep(palette: ClubPalette): ClubPalette | null {
  if (!palette.secondary) return null;
  const step = paletteFromHex(palette.secondary, {
    source: "secondary",
    key: palette.key,
    secondary: palette.base,
  });
  return onItsGround(step, []);
}

/**
 * The palette for a club exactly as its colour computes, before the surface
 * rule: for a picture that paints its own ground (the Pépites share images
 * draw on navy, where a white kit shows), never for a screen of the app.
 */
export function clubPaletteBeforeSurfaces(club: ClubColourSource | null | undefined): ClubPalette {
  if (!club) return inkPalette(null, null);
  const found = findClubKit(club);
  const data = normaliseHex(club.primaryColor);
  const secondary = normaliseHex(club.secondaryColor) ?? normaliseHex(found?.kit.secondary ?? null);
  if (data) return paletteFromHex(data, { source: "data", key: found?.key ?? null, secondary });
  if (found) {
    return paletteFromHex(found.kit.primary, { source: "kit", key: found.key, secondary });
  }
  return inkPalette(secondary, null);
}

/**
 * The palette for a club. Accepts a `Club`, a `{ id, slug, name,
 * primaryColor, secondaryColor }` DTO (a plain-string `name` is fine), or
 * nothing — which returns the ink palette, the same as an unknown club.
 * A fill that would vanish into the page or the card takes the next step of
 * the ladder in that theme (`onItsGround`).
 */
export function clubPalette(club: ClubColourSource | null | undefined): ClubPalette {
  const palette = clubPaletteBeforeSurfaces(club);
  if (THEMES.every((theme) => clubFillShows(palette, theme))) return palette;
  const second = secondaryStep(palette);
  return onItsGround(palette, second ? [second] : []);
}

/**
 * How far apart two sides' PAINTED fills are, per theme (ΔEok, 0..1).
 *
 * The fills, not the club hexes: `fillAndOn` darkens a light fill toward
 * ink-deep until white text passes, and the dark fill is that fill mixed 85%
 * into the dark page, which compresses every difference. Berkane's #e63946
 * and Tétouan's #c00000 are 10.8 apart as hexes and paint 8.9 apart in light,
 * 7.5 in dark — a pair the base-hex test let through with no seam.
 */
export function clubFillDistance(a: ClubPalette, b: ClubPalette): Record<PaletteTheme, number> {
  return {
    light: deltaEOk(paintedFill(a, "light"), paintedFill(b, "light")),
    dark: deltaEOk(paintedFill(a, "dark"), paintedFill(b, "dark")),
  };
}

/** Whether two sides read as the same colour side by side, in EITHER theme. */
export function clubColoursClash(a: ClubPalette, b: ClubPalette): boolean {
  const distance = clubFillDistance(a, b);
  return THEMES.some((theme) => distance[theme] < CLUB_PALETTE_RULES.clash);
}

/**
 * Both sides of a fixture, with the home/away clash rule applied.
 *
 * The Botola is full of reds: the fills Wydad and Tétouan paint measure
 * ΔEok 3.4 apart (2.9 in dark), Berkane and Hassania 4.4 (3.8). Painted as
 * they are, a split
 * score header or a two-colour stat bar has no seam. When the two FILLS are
 * closer than 10 (see `clubColoursClash`), HOME keeps its colour and AWAY
 * changes: to its own second colour if that clears 10 against home, else to
 * the ink, else to a neutral slate. Each step is held to the surface rule
 * (`onItsGround`), so the away side never trades a clash for a fill that
 * vanishes: Tétouan's white second kit against Wydad is the ink in light,
 * where white would be the card, and stays white in dark.
 *
 * Only the theme(s) that clash change. A pair that clashes in one theme alone
 * keeps its own colours in the other: FAR paints its red in dark only (its
 * black vanishes there), so against Wydad it is the dark theme that changes,
 * and Wydad keeps its red in light.
 */
export function clubMatchPalettes(
  home: ClubColourSource | null | undefined,
  away: ClubColourSource | null | undefined,
): { home: ClubPalette; away: ClubPalette; clash: boolean } {
  const homePalette = clubPalette(home);
  const awayPalette = clubPalette(away);
  const distance = clubFillDistance(homePalette, awayPalette);
  const clashing = THEMES.filter((theme) => distance[theme] < CLUB_PALETTE_RULES.clash);
  if (clashing.length === 0) {
    return { home: homePalette, away: awayPalette, clash: false };
  }
  const second = secondaryStep(awayPalette);
  const candidates = [
    ...(second ? [second] : []),
    inkPalette(awayPalette.secondary, awayPalette.key),
  ];
  const clears = (candidate: ClubPalette) => {
    const apart = clubFillDistance(homePalette, candidate);
    return clashing.every((theme) => apart[theme] >= CLUB_PALETTE_RULES.clash);
  };
  const step = candidates.find(clears) ?? neutralPalette(awayPalette.key);
  if (clashing.length === THEMES.length) return { home: homePalette, away: step, clash: true };
  let resolved: ClubPalette = { ...awayPalette, source: step.source };
  for (const theme of clashing) resolved = withThemeFrom(resolved, theme, step);
  return { home: homePalette, away: resolved, clash: true };
}

const isPalette = (value: unknown): value is ClubPalette =>
  typeof value === "object" && value !== null && "light" in value && "dark" in value;

/**
 * The attributes that put a club's colours on an element: `data-club` (which
 * switches on the `[data-club]` layer in `styles.css`) and the ten `--club-*`
 * inline properties it maps onto `--ui-club`, `--ui-on-club`, `--ui-club-edge`,
 * `--ui-club-fg` and `--ui-club-tint` for the current theme.
 *
 *   <section {...clubStyle(home)} className={ui.club.fill}>…</section>
 *
 * To merge your own style: `const c = clubStyle(club)` then
 * `data-club={c["data-club"]} style={{ ...c.style, ...mine }}`.
 */
/**
 * The colour of the `club-stripes` bands on a club fill: the OTHER text
 * colour. White text gets dark bands and dark text gets light ones, so the
 * texture moves the fill away from its text and never costs small type its
 * 4.5:1. White bands under white text did, on Raja and Hassania (4.57 → 4.08).
 */
export function stripeBand(on: string): string {
  return on === ON_DEEP ? ON_PLAIN : ON_DEEP;
}

export function clubStyle(club: ClubColourSource | ClubPalette | null | undefined): {
  "data-club": "";
  style: ClubStyle;
} {
  const palette = isPalette(club) ? club : clubPalette(club);
  const { light, dark } = palette;
  return {
    "data-club": "",
    style: {
      "--club-fill-l": light.fill,
      "--club-on-l": light.on,
      "--club-edge-l": light.edge,
      "--club-fg-l": light.fg,
      "--club-tint-l": light.tint,
      "--club-band-l": stripeBand(light.on),
      "--club-fill-d": dark.fill,
      "--club-on-d": dark.on,
      "--club-edge-d": dark.edge,
      "--club-fg-d": dark.fg,
      "--club-tint-d": dark.tint,
      "--club-band-d": stripeBand(dark.on),
    } as ClubStyle,
  };
}
