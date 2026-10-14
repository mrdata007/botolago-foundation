/**
 * The metals (owner's choice, 2026-10-13): the card's material follows the tier it has earned.
 *
 *   no tier yet  graphite        LASTREET (`homa`)  silver        STADE  gold
 *   PRO          red-gold        CHAMPION           cyan holographic
 *   LEGEND       purple prism holographic (the violet and pink prism is LEGEND's alone)
 *
 * One table in literal colours, the single source of every drawing: the full card takes it as
 * custom properties on its root (`cssVars`), the tokens and the share art as SVG gradients, and the
 * screens that draw a face in DOM (the back, the burst, the ceremony) as a `CardPalette`. The unit
 * tests measure the text colours against the face's stops; the pull request measures them again on
 * rasterised pixels.
 */
import type { CardPalette } from "../renderer";
import type { CardEdition, TierCode } from "../types";

export type MetalKey = "base" | TierCode;
export const METAL_KEYS = ["base", "homa", "stade", "pro", "champion", "legend"] as const;

export interface Metal {
  /** Light text on a dark face (graphite, red-gold and the two holographics) or dark on metal. */
  dark: boolean;
  /** The face's three or four stops, top to bottom (165°): the SVG drawings and the tests. */
  faceStops: readonly string[];
  /** The face as CSS: the stops and the tier's own lights over them. */
  faceGlow: string;
  /** The frame's seven stops. */
  frame: readonly [string, string, string, string, string, string, string];
  /** The text: the rating, the tier word, the stats and the club; and the small text. */
  ink: string;
  ink2: string;
  /** The frame's inner line and the band's top line. */
  line: string;
  bandline: string;
  /** The ribbon across the face and the wedge in its upper corner (CSS). */
  rib: string;
  wedge: string;
  /** The autograph's foil: eight stops that slide with the tilt, and one colour for the share picture. */
  sig: readonly string[];
  sigSolid: string;
  /** The autograph's shadow (a CSS filter). */
  sigShadow: string;
  /** The rating's fill, or null for the plain ink. */
  num: readonly [string, string, string] | null;
  /** The emblem's diamond and its glyph; the sample pill's ground and edge. */
  emb: string;
  embLine: string;
  chip: string;
  chipLine: string;
  /** The holographic overlay (CHAMPION and LEGEND), or null. */
  holo: readonly [string, string, string, string, string, string] | null;
  /** The DOM faces' material (the back, the burst): the `CardPalette` fields that are not the frame. */
  plate: string;
  deep: string;
  glow: string;
  light: string;
  label: string;
  word: string;
  beam: string;
  /* Paid editions only (see `EDITION_METAL`); a tier's metal sets none of these. */
  /** The frame as CSS where it is not the linear sweep of `frame` (checker, gloss band). */
  frameBg?: string;
  /** The face's ground pattern, over the pinstripe's place (a grid, marble veins). */
  pin?: string;
  /** The glow behind the card, as a CSS background. */
  aura?: string;
  /** Two-tone checker bezel (pixel): the squares' colours. */
  checker?: readonly [string, string];
  /** A thick bezel: the face is cut smaller (chrome). */
  thick?: true;
}

const linear = (deg: number, stops: readonly string[]): string =>
  `linear-gradient(${deg}deg, ${stops.map((c, i, all) => `${c} ${Math.round((i / (all.length - 1)) * 100)}%`).join(", ")})`;

export const METAL: Readonly<Record<MetalKey, Metal>> = {
  base: {
    dark: true,
    faceStops: ["#454c57", "#2a2f37", "#1b1f25"],
    faceGlow:
      "radial-gradient(70% 40% at 78% 14%, rgba(176, 188, 204, 0.22), transparent), radial-gradient(60% 34% at 15% 62%, rgba(120, 132, 150, 0.14), transparent)",
    frame: ["#9aa2ad", "#3a404a", "#d5dae0", "#4a515c", "#c0c6ce", "#2c3139", "#8b939e"],
    ink: "#f2f5f9",
    ink2: "#cbd3dd",
    line: "#9aa3ae",
    bandline: "rgba(255, 255, 255, 0.3)",
    rib: "linear-gradient(100deg, transparent 22%, rgba(206, 216, 230, 0.12) 45%, transparent 70%)",
    wedge:
      "linear-gradient(140deg, rgba(222, 230, 240, 0.24), rgba(120, 132, 148, 0.1) 60%, transparent)",
    sig: ["#ffffff", "#d7e1ec", "#97aac0", "#eef3f8", "#8aa0b8", "#ffffff", "#b6c6d8", "#f4f7fa"],
    sigSolid: "#dfe7f0",
    sigShadow: "drop-shadow(0 0.03em 0.05em rgba(0, 0, 0, 0.55))",
    num: ["#ffffff", "#e3e8ee", "#b4bdc8"],
    emb: "#1f242b",
    embLine: "#cbd3dd",
    chip: "#15181d",
    chipLine: "#cbd3dd",
    holo: null,
    plate: "#12151B",
    deep: "#262B35",
    glow: "#6B7484",
    light: "#AAB3C0",
    label: "#A3ACB9",
    word: "#E6ECF3",
    beam: "#AAB3C0",
  },
  homa: {
    dark: false,
    faceStops: ["#f5f6f8", "#d4d9df", "#eef0f3", "#bcc3cb"],
    faceGlow:
      "radial-gradient(60% 34% at 20% 64%, rgba(255, 255, 255, 0.5), transparent), radial-gradient(70% 40% at 80% 12%, rgba(255, 255, 255, 0.35), transparent)",
    frame: ["#f4f6f8", "#8d949d", "#2b2f36", "#cbd0d6", "#3d424b", "#e5e8ec", "#7e8690"],
    ink: "#1d2127",
    ink2: "#2f353d",
    line: "#8c949e",
    bandline: "rgba(255, 255, 255, 0.95)",
    rib: "linear-gradient(100deg, transparent 24%, rgba(255, 255, 255, 0.45) 46%, transparent 66%)",
    wedge:
      "linear-gradient(135deg, rgba(251, 252, 253, 0.9) 0%, rgba(183, 190, 199, 0.7) 34%, rgba(242, 244, 246, 0.8) 52%, rgba(142, 150, 160, 0.6) 100%)",
    sig: ["#16202b", "#2d4a68", "#2a6b77", "#1a2632", "#3c6290", "#202b38", "#2b7080", "#16202b"],
    sigSolid: "#24384c",
    sigShadow:
      "drop-shadow(0 0.025em 0 rgba(255, 255, 255, 0.9)) drop-shadow(0 0.04em 0.05em rgba(20, 30, 40, 0.3))",
    num: null,
    emb: "#eef0f3",
    embLine: "#23272e",
    chip: "#eef0f3",
    chipLine: "#23272e",
    holo: null,
    plate: "#1b1f25",
    deep: "#3a414b",
    glow: "#aab4c0",
    light: "#e7ebf0",
    label: "#c2c9d2",
    word: "#f4f6f8",
    beam: "#dfe5ec",
  },
  stade: {
    dark: false,
    faceStops: ["#a58b40", "#e5c155", "#f4e39a", "#d6b448"],
    faceGlow:
      "radial-gradient(60% 34% at 22% 64%, rgba(255, 246, 200, 0.35), transparent), radial-gradient(70% 40% at 80% 12%, rgba(255, 240, 180, 0.3), transparent)",
    frame: ["#5c4a1d", "#b8993a", "#f0dc86", "#8a6f2a", "#e8cf7a", "#6b5722", "#c9a94a"],
    ink: "#2c240f",
    ink2: "#2a210b",
    line: "#f3e3a0",
    bandline: "rgba(255, 252, 225, 0.85)",
    rib: "linear-gradient(100deg, transparent 20%, rgba(255, 248, 200, 0.38) 45%, rgba(255, 248, 200, 0.05) 60%, transparent 80%)",
    wedge: "linear-gradient(135deg, transparent 30%, rgba(255, 244, 190, 0.28))",
    sig: ["#3b2a08", "#7a5a12", "#2f6f78", "#5b4310", "#8a6a1c", "#2b5f8a", "#4a3510", "#7a5a12"],
    sigSolid: "#5b4310",
    sigShadow: "drop-shadow(0 0.03em 0 rgba(255, 246, 200, 0.8))",
    num: null,
    emb: "#e3bf50",
    embLine: "#2c240f",
    chip: "#e3bf50",
    chipLine: "#2c240f",
    holo: null,
    plate: "#231b0a",
    deep: "#4a3a14",
    glow: "#e3bf50",
    light: "#f4e39a",
    label: "#d9c27a",
    word: "#f7e7a6",
    beam: "#f0d77a",
  },
  pro: {
    dark: true,
    faceStops: ["#8a1c24", "#5a0f17", "#2e070c"],
    faceGlow:
      "radial-gradient(70% 40% at 78% 14%, rgba(255, 140, 100, 0.3), transparent), radial-gradient(60% 34% at 18% 62%, rgba(255, 90, 80, 0.16), transparent)",
    frame: ["#6b4a12", "#e8c56a", "#fff1b8", "#b8862c", "#f3d27a", "#5c3d0e", "#d9a948"],
    ink: "#fff5e8",
    ink2: "#f6d3b6",
    line: "#e8c56a",
    bandline: "rgba(255, 214, 140, 0.5)",
    rib: "linear-gradient(100deg, transparent 22%, rgba(255, 190, 120, 0.16) 45%, rgba(255, 120, 90, 0.08) 58%, transparent 74%)",
    wedge:
      "linear-gradient(140deg, rgba(255, 214, 140, 0.42), rgba(232, 140, 80, 0.3) 40%, rgba(120, 20, 30, 0.15))",
    sig: ["#fff4d6", "#ffd36e", "#ff9a62", "#ffe7a3", "#f2b04a", "#fff6dc", "#ff8a5c", "#ffe08a"],
    sigSolid: "#ffd88a",
    sigShadow:
      "drop-shadow(0 0.03em 0.05em rgba(40, 0, 6, 0.6)) drop-shadow(0 0 0.12em rgba(255, 170, 90, 0.3))",
    num: ["#fff6d6", "#f3cf6e", "#d39a35"],
    emb: "#4a0c13",
    embLine: "#f3d27a",
    chip: "#3a0910",
    chipLine: "#f3d27a",
    holo: null,
    plate: "#1e0508",
    deep: "#4a0c13",
    glow: "#e05a4a",
    light: "#f6d38a",
    label: "#e7b9a0",
    word: "#f9e2b0",
    beam: "#f3c46a",
  },
  champion: {
    dark: true,
    faceStops: ["#0e5f66", "#08394a", "#031c2b"],
    faceGlow:
      "radial-gradient(70% 40% at 78% 14%, rgba(30, 200, 200, 0.5), transparent), radial-gradient(60% 30% at 15% 60%, rgba(20, 140, 150, 0.35), transparent)",
    frame: ["#5ef0a8", "#4fe3ee", "#3a8dff", "#4fe0d0", "#4fd8ff", "#d6fff4", "#5ef0a8"],
    ink: "#effffb",
    ink2: "#c4f6ee",
    line: "#9ff5e6",
    bandline: "rgba(150, 250, 232, 0.55)",
    rib: "linear-gradient(100deg, transparent 22%, rgba(80, 232, 170, 0.22) 44%, rgba(80, 200, 255, 0.3) 54%, transparent 74%)",
    wedge:
      "linear-gradient(140deg, rgba(110, 250, 190, 0.62), rgba(90, 228, 255, 0.55) 36%, rgba(60, 140, 255, 0.6) 66%, rgba(220, 255, 250, 0.45))",
    sig: ["#ffffff", "#b8fff0", "#7ff5c1", "#4fd8ff", "#4f9bff", "#e9fbff", "#7ff5c1", "#4fd8ff"],
    sigSolid: "#bdf3ff",
    sigShadow:
      "drop-shadow(0 0.03em 0.05em rgba(0, 25, 35, 0.6)) drop-shadow(0 0 0.12em rgba(79, 216, 255, 0.35))",
    num: ["#f0fffb", "#a6f6e8", "#6fdcf2"],
    emb: "#06404a",
    embLine: "#a9f7ee",
    chip: "#05303a",
    chipLine: "#a9f7ee",
    // green to cyan to blue only: no violet or pink below LEGEND
    holo: ["#5ef0a8", "#4fe3ee", "#3a8dff", "#4fd8ff", "#d6fff4", "#5ef0a8"],
    plate: "#031c2b",
    deep: "#08394a",
    glow: "#4fd8ff",
    light: "#bff5ec",
    label: "#9fe3da",
    word: "#e9fffb",
    beam: "#7ff5e1",
  },
  legend: {
    dark: true,
    faceStops: ["#4a1680", "#2a0a4d", "#14052a"],
    faceGlow:
      "radial-gradient(70% 40% at 78% 14%, rgba(205, 130, 255, 0.45), transparent), radial-gradient(60% 34% at 15% 62%, rgba(255, 110, 200, 0.22), transparent)",
    frame: ["#c7a6ff", "#ff8ad8", "#7fd4ff", "#ffd1f4", "#9a6bff", "#ffb3e6", "#c7a6ff"],
    ink: "#fdf7ff",
    ink2: "#ecdcff",
    line: "#e2c4ff",
    bandline: "rgba(230, 200, 255, 0.5)",
    rib: "linear-gradient(100deg, transparent 22%, rgba(255, 130, 220, 0.18) 44%, rgba(140, 200, 255, 0.22) 54%, transparent 74%)",
    wedge:
      "linear-gradient(140deg, rgba(255, 160, 230, 0.55), rgba(190, 140, 255, 0.5) 36%, rgba(120, 200, 255, 0.5) 66%, rgba(255, 240, 255, 0.4))",
    sig: ["#ffffff", "#ffc6f0", "#d59bff", "#9ad8ff", "#ffffff", "#ff9fe0", "#b48cff", "#ffffff"],
    sigSolid: "#f3d4ff",
    sigShadow:
      "drop-shadow(0 0.03em 0.05em rgba(20, 0, 35, 0.65)) drop-shadow(0 0 0.14em rgba(214, 150, 255, 0.4))",
    num: ["#ffffff", "#f0d2ff", "#c9a2ff"],
    emb: "#2a0a4d",
    embLine: "#f0d6ff",
    chip: "#22083f",
    chipLine: "#f0d6ff",
    holo: ["#ff8ad8", "#c7a6ff", "#7fd4ff", "#9affd8", "#ffe08a", "#ff8ad8"],
    plate: "#14052a",
    deep: "#2a0a4d",
    glow: "#b48cff",
    light: "#ead6ff",
    label: "#cdb3f0",
    word: "#f8eeff",
    beam: "#d9b8ff",
  },
};

/**
 * The four paid finishes (BotolaGO+), after the owner's sketch. A paid edition replaces the tier's
 * metal on the frame, the face and the autograph's ink; the rating, the tier word and the layout
 * stay the card's. Same shape as a tier's metal, so every drawing (the card, the token, the share
 * art) reads it the same way. The holo edition is green, cyan and blue only: violet and pink are
 * LEGEND's.
 */
export type PaidEdition = Exclude<CardEdition, "standard">;
export const PAID_EDITIONS = ["holo", "electric", "pixel", "chrome"] as const;

export const EDITION_METAL: Readonly<Record<PaidEdition, Metal>> = {
  // deep teal ocean body, an iridescent wedge, a hue-turning chrome bezel; the live prism is CSS
  holo: {
    ...METAL.champion,
    // a little less light in the face than CHAMPION's, so the small text keeps 4.5:1 under the prism
    faceGlow:
      "radial-gradient(70% 40% at 78% 14%, rgba(30, 200, 200, 0.4), transparent), radial-gradient(60% 30% at 15% 60%, rgba(20, 140, 150, 0.16), transparent)",
    ink: "#f4fffd",
    ink2: "#d9fbf5",
    aura: "conic-gradient(from var(--sh-hue, 0deg), #3ee08a, #36c9f0, #5b7cff, #36c9f0, #3ee08a)",
  },
  electric: {
    dark: true,
    faceStops: ["#050a07", "#0b1710", "#14261c"],
    faceGlow:
      "radial-gradient(60% 36% at 80% 12%, rgba(40, 150, 90, 0.5), transparent), radial-gradient(60% 30% at 15% 62%, rgba(62, 224, 138, 0.1), transparent)",
    frame: ["#0d1a12", "#3a7a58", "#050807", "#7dffbd", "#0f2418", "#3a7a58", "#7dffbd"],
    ink: "#c4ffe0",
    ink2: "#a9f0c9",
    line: "#7dffbd",
    bandline: "rgba(125, 255, 189, 0.5)",
    rib: "linear-gradient(100deg, transparent 24%, rgba(62, 224, 138, 0.14) 40%, rgba(62, 224, 138, 0.34) 47%, rgba(62, 224, 138, 0.06) 53%, transparent 62%, rgba(62, 224, 138, 0.2) 68%, transparent 74%)",
    wedge:
      "linear-gradient(135deg, rgba(190, 255, 220, 0.55), rgba(62, 224, 138, 0.5) 45%, rgba(10, 60, 36, 0.4))",
    sig: ["#f3fff8", "#9dffcb", "#3ee08a", "#c8fff0", "#5fe3d1", "#f3fff8", "#7dffbd", "#effff6"],
    sigSolid: "#9dffcb",
    sigShadow:
      "drop-shadow(0 0 0.06em rgba(125, 255, 189, 0.9)) drop-shadow(0 0 0.22em rgba(62, 224, 138, 0.6))",
    num: ["#ffffff", "#d9ffea", "#7dffbd"],
    emb: "#06100a",
    embLine: "#7dffbd",
    chip: "#06100a",
    chipLine: "#7dffbd",
    holo: null,
    plate: "#050a07",
    deep: "#0b1710",
    glow: "#3ee08a",
    light: "#9dffcb",
    label: "#8fe9b9",
    word: "#d7ffe9",
    beam: "#7dffbd",
    pin: "repeating-linear-gradient(45deg, rgba(95, 227, 161, 0.07) 0 1px, transparent 1px 3px)",
    aura: "radial-gradient(closest-side, #3ee08a, transparent)",
  },
  pixel: {
    dark: true,
    faceStops: ["#14264a", "#0d1830", "#0a111e"],
    faceGlow:
      "radial-gradient(60% 36% at 78% 14%, rgba(40, 110, 170, 0.5), transparent), radial-gradient(60% 30% at 15% 62%, rgba(40, 90, 150, 0.2), transparent)",
    frame: ["#7dd3fc", "#86efac", "#7dd3fc", "#86efac", "#7dd3fc", "#86efac", "#7dd3fc"],
    ink: "#f2f9ff",
    ink2: "#d3e6f6",
    line: "#86efac",
    bandline: "rgba(134, 239, 172, 0.55)",
    rib: "linear-gradient(100deg, transparent 30%, rgba(125, 211, 252, 0.16) 46%, rgba(134, 239, 172, 0.14) 56%, transparent 70%)",
    wedge:
      "linear-gradient(135deg, rgba(224, 242, 254, 0.5), rgba(125, 211, 252, 0.42) 50%, rgba(134, 239, 172, 0.4))",
    sig: ["#f0f9ff", "#7dd3fc", "#86efac", "#e0f2fe", "#38bdf8", "#bbf7d0", "#f0f9ff", "#7dd3fc"],
    sigSolid: "#a5e1fb",
    sigShadow:
      "drop-shadow(0.05em 0.05em 0 #0b111e) drop-shadow(0 0 0.1em rgba(125, 211, 252, 0.45))",
    num: ["#f0f9ff", "#bfe9fb", "#86efac"],
    emb: "#0a1426",
    embLine: "#86efac",
    chip: "#0a1426",
    chipLine: "#7dd3fc",
    holo: null,
    plate: "#0a111e",
    deep: "#14264a",
    glow: "#7dd3fc",
    light: "#bfe9fb",
    label: "#9fd4ef",
    word: "#e0f2fe",
    beam: "#7dd3fc",
    checker: ["#7dd3fc", "#86efac"],
    frameBg: "repeating-conic-gradient(#7dd3fc 0 25%, #86efac 0 50%) 0 0 / 3.4cqw 3.4cqw",
    pin: "linear-gradient(rgb(255 255 255 / 0.045) 1px, transparent 1px) 0 0 / 100% 2cqw, linear-gradient(90deg, rgb(255 255 255 / 0.03) 1px, transparent 1px) 0 0 / 2cqw 100%",
    aura: "linear-gradient(135deg, #7dd3fc, #86efac)",
  },
  chrome: {
    dark: false,
    faceStops: ["#f6f7f8", "#dde0e5", "#f1f2f4", "#cdd2d8"],
    faceGlow:
      "radial-gradient(60% 34% at 20% 64%, rgba(255, 255, 255, 0.5), transparent), radial-gradient(70% 40% at 80% 12%, rgba(255, 255, 255, 0.35), transparent)",
    frame: ["#f2f4f7", "#8b929b", "#2a2e35", "#c9ced4", "#3b4049", "#e3e6ea", "#8b929b"],
    ink: "#2b2f36",
    ink2: "#2b2f36",
    line: "#9aa3ad",
    bandline: "rgba(255, 255, 255, 0.95)",
    rib: "transparent",
    wedge: "linear-gradient(135deg, #f7f8fa 0%, #aab1ba 34%, #eef0f3 52%, #7d858f 100%)",
    sig: ["#5a3e0e", "#a67f2c", "#e2c574", "#7a5718", "#2f7f8c", "#b8913c", "#e8cf86", "#3f6fb0"],
    sigSolid: "#7a5718",
    sigShadow:
      "drop-shadow(0 0.025em 0 rgba(255, 255, 255, 0.9)) drop-shadow(0 0.04em 0.05em rgba(60, 40, 0, 0.35))",
    num: ["#4a505a", "#2b2f36", "#5a616c"],
    emb: "#eceef0",
    embLine: "#2b2f36",
    chip: "#eceef0",
    chipLine: "#2b2f36",
    holo: null,
    plate: "#1b1f26",
    deep: "#3a414b",
    glow: "#c9ced4",
    light: "#f2f4f7",
    label: "#c2c9d2",
    word: "#f4f6f8",
    beam: "#e3e6ea",
    thick: true,
    // a gloss band (`--sh-sw`, swept by the stylesheet) over a polished gunmetal bezel
    frameBg:
      "linear-gradient(105deg, transparent calc(var(--sh-sw, -30%) - 10%), rgb(255 255 255 / 0.9) var(--sh-sw, -30%), transparent calc(var(--sh-sw, -30%) + 10%)), linear-gradient(180deg, #f2f4f7 0%, #8b929b 18%, #2a2e35 40%, #c9ced4 55%, #3b4049 75%, #e3e6ea 100%)",
    pin: "linear-gradient(112deg, transparent 31.6%, rgb(110 118 130 / 0.38) 31.8%, transparent 32.3%), linear-gradient(64deg, transparent 58.4%, rgb(110 118 130 / 0.3) 58.6%, transparent 59.1%), linear-gradient(98deg, transparent 12.6%, rgb(110 118 130 / 0.26) 12.8%, transparent 13.2%), repeating-linear-gradient(45deg, rgb(255 255 255 / 0.12) 0 1px, transparent 1px 3px)",
    aura: "linear-gradient(180deg, #9aa3ad, #2a2e35)",
  },
};

/** The paid edition a profile asks for, or null: absent, `standard` or unknown draw the free card. */
export function paidEdition(edition: unknown): PaidEdition | null {
  return typeof edition === "string" && Object.hasOwn(EDITION_METAL, edition)
    ? (edition as PaidEdition)
    : null;
}

/** The metal a card is drawn in: its edition's if it is paid, else the earned tier's. */
export const metalFor = (key: MetalKey, edition: PaidEdition | null): Metal =>
  edition ? EDITION_METAL[edition] : METAL[key];

/** The frame as CSS: a linear sweep of the metal, a turning prism on the holographic tiers. */
export function frameCss(m: Metal): string {
  if (m.frameBg) return m.frameBg;
  if (m.holo) {
    // the prism turns with the light (`--mc-ax`, written by the tilt; 0 at rest), and drifts on its own
    // on a paid edition (`--sh-hue`, animated on the frame layer; 0 anywhere else)
    return `conic-gradient(from calc(200deg + var(--mc-ax, 0) * 70deg + var(--sh-hue, 0deg)) at 50% 45%, ${[...m.frame].join(", ")})`;
  }
  return linear(160, m.frame);
}

/** The face as CSS: the tier's lights over its stops. */
export const faceCss = (m: Metal): string => `${m.faceGlow}, ${linear(165, m.faceStops)}`;

/** The autograph's foil as CSS (slides with `background-position`). */
export const sigCss = (m: Metal): string => linear(100, m.sig);

/**
 * Everything the stylesheet reads from the tier, as custom properties for the root's `style`.
 * Every value here is a literal of this file; nothing a manager supplies reaches it.
 */
export function cssVars(m: Metal): string {
  const vars: [string, string][] = [
    ["--sh-face", faceCss(m)],
    ["--sh-frame", frameCss(m)],
    ["--sh-edge", m.dark ? m.plate : m.frame[3]],
    ["--sh-ink", m.ink],
    ["--sh-ink2", m.ink2],
    ["--sh-line", m.line],
    ["--sh-bandline", m.bandline],
    ["--sh-rib", m.rib],
    ["--sh-wedge", m.wedge],
    ["--sh-sig", sigCss(m)],
    ["--sh-sig-shadow", m.sigShadow],
    ["--sh-num", m.num ? linear(180, m.num) : `linear-gradient(${m.ink}, ${m.ink})`],
    ["--sh-emb", m.emb],
    ["--sh-emb-line", m.embLine],
    ["--sh-chip", m.chip],
    ["--sh-chip-line", m.chipLine],
    ["--sh-glow", m.glow],
  ];
  if (m.pin) vars.push(["--sh-pin", m.pin]);
  if (m.aura) vars.push(["--sh-aura", m.aura]);
  if (m.holo) vars.push(["--sh-holo", linear(115, [...m.holo, ...m.holo.slice(1)])]);
  return vars.map(([k, val]) => `${k}:${val}`).join(";");
}

/** The material of a tier as the screens read it (`CardRenderer.palette`; `null`: no tier yet). */
export function tierPalette(tier: TierCode | null): CardPalette {
  const m = METAL[tier ?? "base"];
  return {
    plate: m.plate,
    deep: m.deep,
    glow: m.glow,
    light: m.light,
    label: m.label,
    word: m.word,
    metal: m.frame,
    beam: m.beam,
    prism: m.holo,
  };
}
