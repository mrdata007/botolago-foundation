/**
 * The foil ladder (plan 5.4, revision 3 with the critique fixes): six steps, one per tier and one
 * for the base card that has no tier yet. A table in literal hex, so the tests can measure every
 * pair of colours the card prints against what lies under it, plus the colour helpers.
 *
 *   base (no tier) graphite · LASTREET steel · STADE amber · PRO red · CHAMPION ice blue ·
 *   LEGEND violet and prism
 *
 * `plate` is the dark lacquer, `deep` the field's top, `glow` the backlight, `light` the rim light,
 * `label` the stat labels, `edge` the theme edge (light page / dark page), `metal` the frame's
 * seven-stop gradient, `spec` the travelling highlight on the metal, `tokEdge` the 2 px ring on
 * small tokens, `foil` the holographic gradient (CHAMPION and LEGEND only).
 */
import { contrastRatio, mixSrgb, parseHex, toHex, type Rgb } from "@/lib/colour";

import type { CardProfile, CardStrings, TierCode } from "../types";

export type TierKey = "base" | TierCode;

/** How the honeycomb is drawn: engraved lines, raised cells, or foil seen through the cells. */
export interface HexSpec {
  mode: "line" | "cells" | "holo";
  op: number;
  /** STADE: the face line takes the gold instead of the rim light. */
  tint?: boolean;
  /** LEGEND: the foil shows only where the light falls. */
  follow?: boolean;
}

export interface HoloSpec {
  /** The diffraction overlay's opacity (CSS). */
  css: number;
  /** The foil through the outer edge and the tab's rim. */
  edge: number;
  /** The foil through the shield band. */
  band: number;
  /** How many of the four glints. */
  glints: number;
}

export interface Foil {
  plate: string;
  deep: string;
  glow: string;
  light: string;
  label: string;
  edgeL: string;
  edgeD: string;
  /** The sheen's opacity. */
  sheen: number;
  /** The two floodlights' opacities (the first is off on the base card). */
  beams: readonly [number, number];
  /** The backlight's opacity. */
  back: number;
  hex: HexSpec;
  metal: readonly [string, string, string, string, string, string, string];
  spec: string;
  tokEdge?: string;
  /** The field's middle stop mix (STADE keeps it darker). */
  fieldMix?: number;
  /** The floodlight colour where it differs from `light`. */
  beamCol?: string;
  /** STADE: a narrow core and a lamp on each beam. */
  core?: true;
  /** STADE: the pool of light on the turf. */
  pool?: true;
  /** STADE: the gold band across the plate. */
  goldBand?: true;
  /** LASTREET: the street fence over the honeycomb. */
  cage?: true;
  /** LASTREET: brushed metal. */
  brushed?: true;
  /** Six stops of the holographic gradient. */
  foil?: readonly [string, string, string, string, string, string];
  /** The tier word's colour on the dark plaque. */
  wordFill?: string;
  /** LEGEND: the tier word's engraved ink on its foil plaque. */
  wordInk?: string;
  /** LEGEND: the plaque filled with the moving foil. */
  plaqueFoil?: true;
  /** LEGEND: the second foil hairline shield 16 units inside the band. */
  innerFoil?: true;
  holo?: HoloSpec;
}

export const FOIL: Readonly<Record<TierKey, Foil>> = {
  base: {
    plate: "#12151B",
    deep: "#262B35",
    glow: "#6B7484",
    light: "#AAB3C0",
    label: "#A3ACB9",
    edgeL: "#3A414D",
    edgeD: "#59616E",
    sheen: 0.08,
    beams: [0, 0.05],
    back: 0.22,
    hex: { mode: "line", op: 0.5 },
    metal: ["#22262D", "#4A515C", "#2B3038", "#6A727E", "#30353D", "#555C67", "#1E2228"],
    spec: "#B8C0CC",
    tokEdge: "#454C57",
  },
  homa: {
    plate: "#111418",
    deep: "#343B45",
    glow: "#C7D0DC",
    light: "#E8EEF5",
    label: "#B5BFCA",
    edgeL: "#5C6672",
    edgeD: "#AEB8C5",
    sheen: 0.16,
    beams: [0.04, 0.08],
    back: 0.45,
    hex: { mode: "line", op: 0.42 },
    cage: true,
    brushed: true,
    metal: ["#5D6670", "#D9DFE6", "#8E98A3", "#F4F7FA", "#78828D", "#C3CAD2", "#4E5660"],
    spec: "#FFFFFF",
    tokEdge: "#C9D1DA",
    wordFill: "#E6ECF3",
  },
  stade: {
    plate: "#0E0B05",
    deep: "#1A140A",
    fieldMix: 0.8,
    glow: "#F2B544",
    light: "#FFE2A6",
    beamCol: "#FFD27A",
    label: "#CDBB95",
    edgeL: "#9A6B16",
    edgeD: "#E9B055",
    sheen: 0.18,
    beams: [0.18, 0.28],
    core: true,
    back: 0.36,
    pool: true,
    goldBand: true,
    hex: { mode: "line", op: 0.75, tint: true },
    metal: ["#5A3D0C", "#C99634", "#FFE9B0", "#9C6C1C", "#F0C566", "#6E4A10", "#D7A748"],
    spec: "#FFF4D6",
    tokEdge: "#E9B055",
    wordFill: "#F6C96A",
  },
  pro: {
    plate: "#1A0407",
    deep: "#6E0F18",
    glow: "#F0545A",
    light: "#FFC2C2",
    label: "#D6B9B9",
    edgeL: "#B1262E",
    edgeD: "#EA6263",
    sheen: 0.18,
    beams: [0.06, 0.12],
    back: 0.34,
    hex: { mode: "cells", op: 1 },
    metal: ["#3A0509", "#9E1C24", "#E0424A", "#6E0E15", "#C0303A", "#8A141C", "#4A080E"],
    spec: "#FFD0D0",
    tokEdge: "#E0424A",
    wordFill: "#FF9396",
  },
  champion: {
    plate: "#03111C",
    deep: "#0D4A63",
    glow: "#5FD0EE",
    light: "#D8F6FF",
    label: "#A9C9D6",
    edgeL: "#1F6F96",
    edgeD: "#6FCFE5",
    sheen: 0.2,
    beams: [0.08, 0.14],
    back: 0.34,
    hex: { mode: "holo", op: 0.3 },
    foil: ["#4FE0F0", "#3FB8C9", "#A6F0FF", "#6FA8FF", "#46D9C8", "#BDF6FF"],
    metal: ["#0B3A48", "#3FAFC9", "#D9F8FF", "#1E7C93", "#8BE3F2", "#0E4B5C", "#5CC9DF"],
    spec: "#E8FCFF",
    wordFill: "#8FE6F7",
    holo: { css: 0.16, edge: 0.55, band: 0.35, glints: 2 },
  },
  legend: {
    plate: "#0D0314",
    deep: "#1E0730",
    glow: "#C77DFF",
    light: "#F0D8FF",
    label: "#C3B4D0",
    edgeL: "#8E3A9A",
    edgeD: "#DE5EE4",
    sheen: 0.22,
    beams: [0.04, 0.08],
    back: 0.4,
    hex: { mode: "holo", op: 0.6, follow: true },
    foil: ["#FF8AD8", "#C59BFF", "#8FB4FF", "#7FF0E0", "#FFE3A8", "#E6A6FF"],
    metal: ["#2A0A3C", "#8E44B8", "#F2D6FF", "#5A1E7A", "#C98BEA", "#3A0F52", "#A866D0"],
    spec: "#FBEFFF",
    wordFill: "#E9B8FF",
    plaqueFoil: true,
    wordInk: "#1A0626",
    innerFoil: true,
    holo: { css: 0.24, edge: 0.85, band: 0.6, glints: 4 },
  },
};

/** The ladder step of a card: no number, no tier. */
export const tierKeyOf = (p: Pick<CardProfile, "ovr" | "tier">): TierKey =>
  p.ovr == null ? "base" : (p.tier ?? "base");

/**
 * The tier's displayed word. The lowest tier is LASTREET in both languages (a Latin word, plan D10
 * and section 11): the renderer owns it, so the card and its label say it whatever the dictionary
 * still holds. The other words are the interface's own (Latin in French, Arabic in Arabic).
 */
export function tierWord(tier: TierCode, s: Pick<CardStrings, "tiers">): string {
  if (tier === "homa") return "LASTREET";
  const word = String(s.tiers[tier] ?? "").trim();
  return /\p{Script=Arabic}/u.test(word) ? word : word.toLocaleUpperCase("fr");
}

/** The strings with the tier names the card prints: what is drawn is what is spoken. */
export function withTierNames(s: CardStrings): CardStrings {
  const tiers = { ...s.tiers, homa: "LASTREET" };
  return s.tiers.homa === "LASTREET" ? s : { ...s, tiers };
}

/** The ladder's six steps in tier order, for tests and galleries. */
export const TIER_KEYS = ["base", "homa", "stade", "pro", "champion", "legend"] as const;

/* ---------------------------------------------------------------------------------------------
   Colour helpers (src/lib/colour.ts does the arithmetic)
   --------------------------------------------------------------------------------------------- */

const rgb = (hex: string): Rgb => parseHex(hex) ?? [0, 0, 0];

/** `a` towards `b` by `t` (0 gives `a`, 1 gives `b`), as `#rrggbb` (sRGB, like `color-mix`). */
export const mix = (a: string, b: string, t: number): string =>
  toHex(mixSrgb(rgb(a), rgb(b), 1 - t));

/** WCAG contrast between two hex colours. */
export const contrast = (a: string, b: string): number => contrastRatio(rgb(a), rgb(b));

/** CIE L* (0..100) of a hex colour. */
export function lstar(hex: string): number {
  const [r, g, b] = rgb(hex).map((c) =>
    c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4,
  ) as [number, number, number];
  const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return y > 0.008856 ? 116 * Math.cbrt(y) - 16 : 903.3 * y;
}

/** Gradient stops spread evenly over 0..1, three decimals. */
export const stops = (colours: readonly string[], opacity = 1): string =>
  colours
    .map(
      (c, i, all) =>
        `<stop offset="${(i / (all.length - 1)).toFixed(3)}" stop-color="${c}" stop-opacity="${opacity}"/>`,
    )
    .join("");

/** The shirt with no club: `mix(plate, #FFF, .30)` (plan 5.1). */
export const neutralShirt = (F: Foil): string => mix(F.plate, "#FFFFFF", 0.3);

/**
 * Number and shirt colours that depend on the club (plan 5.1 and 5.2): the shirt, its second
 * colour, whether it is dark (the aura and the stronger backlight), its highlight tint, the number's
 * fill and the twill ring.
 */
export interface ShirtColours {
  /** The shirt's body: the club's primary, or the neutral shirt. */
  primary: string;
  /** Collar, cuffs: the club's second colour, or the tier's dark edge. */
  secondary: string;
  /** L* under 25 (a black shirt): the knit's dots fall, the backlight gains .15, an aura sits behind. */
  dark: boolean;
  /** The shirt's own highlight tint, `mix(fill, #FFF, .4)`: white would wash a club colour out. */
  hl: string;
  /** The number's fill: white if 3:1 on the shirt, else near-black. */
  numberFill: string;
  /** The twill ring around the number's fill. */
  twill: string;
}

export function shirtColours(
  club: { primary: string; secondary: string | null } | null,
  F: Foil,
): ShirtColours {
  const primary = club ? club.primary : neutralShirt(F);
  const secondary = club ? club.secondary || "#ffffff" : F.edgeD;
  const numberFill = contrast("#FFFFFF", primary) >= 3 ? "#FFFFFF" : "#0E1116";
  let twill: string;
  if (club) {
    twill =
      club.secondary && contrast(club.secondary, numberFill) >= 1.6
        ? club.secondary
        : numberFill === "#FFFFFF"
          ? mix(club.primary, "#000000", 0.45)
          : "#FFFFFF";
  } else twill = F.glow;
  return {
    primary,
    secondary,
    dark: lstar(primary) < 25,
    hl: mix(primary, "#ffffff", 0.4),
    numberFill,
    twill,
  };
}

/**
 * The ink for the club initials on the club's colour: white when it clears 4.5:1, else the card's
 * near-black, else black (a saturated orange-red such as Hassania's is below 4.5:1 under both).
 */
export const inkOn = (colour: string): string =>
  contrast("#ffffff", colour) >= 4.5
    ? "#fff"
    : contrast("#0E1116", colour) >= 4.5
      ? "#0E1116"
      : "#000";
