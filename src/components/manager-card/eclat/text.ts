/**
 * The card's text, described once and drawn twice: as `<text>` in the card's SVG, or as the runs the
 * share picture draws on a canvas over its text-free art (plan 7, "Share picture"). A layer builder
 * returns its shapes as markup and its text as `TextSpec`s; `textEl` and `toRun` turn the specs into
 * either.
 *
 * Every string goes through `esc`. A text is never mirrored by a transform: the builder puts the
 * already mirrored x in the spec and sets `dir`.
 */
import { parseHex } from "@/lib/colour";

import type { TextRun } from "../renderer";
import { n2 } from "./geometry";
import { esc } from "./view";

/** The faces as the SVG classes name them. */
export type TextFace = "d" | "dl" | "s" | "b" | "a";

export interface TextSpec {
  text: string;
  /** Card units, already mirrored for Arabic. With `transform`, the pivot is that transform's. */
  x: number;
  y: number;
  size: number;
  face: TextFace;
  /** For Manrope and Noto Sans Arabic (Changa's weight is the class's). */
  weight?: number;
  fill: string;
  fillOpacity?: number;
  dir: "ltr" | "rtl";
  /** Isolate an Arabic run from its surroundings (`unicode-bidi: isolate`). */
  isolate?: boolean;
  /** Letter spacing in em (a Latin run only). */
  tracking?: number;
  /** Fit a run to this many units by spacing, never by squeezing the glyphs. */
  textLength?: number;
  /**
   * Set the run in a frame of its own: `translate(tx ty) rotate(rotate)`, with `x`/`y` in that frame
   * (the rail's wordmark, the founder's mark along the cut corner).
   */
  place?: { tx: number; ty: number; rotate: number };
  /** Centre the glyphs on y (`dominant-baseline: central`). */
  central?: boolean;
  dy?: number;
  tabular?: boolean;
  /** `data-*` attributes (`meta`, `tier`, `stat` …), for the tests and the probes. */
  data?: Readonly<Record<string, string>>;
  /** Not drawn in the share picture (the rail's wordmark). */
  noImage?: true;
}

const attr = (name: string, value: string | number | undefined): string =>
  value === undefined ? "" : ` ${name}="${esc(value)}"`;

/** One `<text>` element. */
export function textEl(t: TextSpec): string {
  const data = t.data
    ? Object.entries(t.data)
        .map(([k, v]) => ` data-${k}="${esc(v)}"`)
        .join("")
    : "";
  return (
    `<text x="${n2(t.x)}" y="${n2(t.y)}"` +
    (t.place
      ? ` transform="translate(${n2(t.place.tx)} ${n2(t.place.ty)}) rotate(${t.place.rotate})"`
      : "") +
    ` class="mc-f-${t.face}"` +
    attr("font-weight", t.weight) +
    ` font-size="${n2(t.size)}" text-anchor="middle" fill="${t.fill}"` +
    (t.fillOpacity !== undefined ? ` fill-opacity="${t.fillOpacity}"` : "") +
    (t.tabular ? ' style="font-variant-numeric:tabular-nums"' : "") +
    (t.central ? ' dominant-baseline="central"' : "") +
    (t.dy !== undefined ? ` dy="${t.dy}"` : "") +
    (t.tracking !== undefined ? ` letter-spacing="${t.tracking}em"` : "") +
    (t.textLength !== undefined ? ` textLength="${n2(t.textLength)}" lengthAdjust="spacing"` : "") +
    ` direction="${t.dir}"` +
    (t.isolate ? ' unicode-bidi="isolate"' : "") +
    data +
    `>${esc(t.text)}</text>`
  );
}

/** `#rgb`/`#rrggbb` and an opacity as a CSS colour for a canvas. */
export function cssColour(hex: string, opacity = 1): string {
  const rgb = parseHex(hex);
  if (!rgb) return hex;
  const [r, g, b] = rgb.map((c) => Math.round(c * 255));
  return opacity >= 1
    ? `#${[r, g, b].map((c) => c!.toString(16).padStart(2, "0")).join("")}`
    : `rgba(${r}, ${g}, ${b}, ${opacity})`;
}

const FACE: Readonly<Record<TextFace, { face: TextRun["face"]; weight: TextRun["weight"] }>> = {
  d: { face: "display", weight: 800 },
  dl: { face: "displayLight", weight: 300 },
  s: { face: "serif", weight: 400 },
  b: { face: "body", weight: 800 },
  a: { face: "arabic", weight: 700 },
};

/** The same text as a canvas run, `scale` image pixels per card unit. */
export function toRun(t: TextSpec, scale: number): TextRun {
  const f = FACE[t.face];
  const weight = (t.weight ?? f.weight) as TextRun["weight"];
  // a central baseline is the middle of the cap height: about .36 em above the alphabetic one
  let x = t.x;
  let y = (t.central ? t.y + t.size * 0.36 : t.y + (t.dy ?? 0)) + 0;
  if (t.place) {
    const a = (t.place.rotate * Math.PI) / 180;
    const px = x;
    x = t.place.tx + px * Math.cos(a) - y * Math.sin(a);
    y = t.place.ty + px * Math.sin(a) + y * Math.cos(a);
  }
  return {
    text: t.text,
    x: round2(x * scale),
    y: round2(y * scale),
    size: round2(t.size * scale),
    weight: t.face === "d" || t.face === "dl" || t.face === "s" ? f.weight : weight,
    face: f.face,
    anchor: "middle",
    dir: t.dir,
    colour: cssColour(t.fill, t.fillOpacity ?? 1),
    ...(t.tracking ? { tracking: round2(t.tracking * t.size * scale) } : {}),
    ...(t.place?.rotate ? { rotate: t.place.rotate } : {}),
  };
}

const round2 = (v: number): number => Math.round(v * 100) / 100;
