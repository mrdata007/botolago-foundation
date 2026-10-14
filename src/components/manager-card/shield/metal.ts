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
import type { TierCode } from "../types";

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

/** The frame as CSS: a linear sweep of the metal, a turning prism on the holographic tiers. */
export function frameCss(m: Metal): string {
  if (m.holo) {
    // the prism turns with the light (`--mc-ax`, written by the tilt; 0 at rest)
    return `conic-gradient(from calc(200deg + var(--mc-ax, 0) * 70deg) at 50% 45%, ${[...m.frame].join(", ")})`;
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
