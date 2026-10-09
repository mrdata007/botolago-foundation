/**
 * The scarf's yarns, worked out from the club's two colours. A pure function of the profile's club:
 * every figure keeps its contrast on the ground before the knit's shadows are laid over it.
 */
import { contrastRatio, mixSrgb, parseHex, relativeLuminance, toHex, type Rgb } from "@/lib/colour";

import type { CardProfile } from "../types";

/** Undyed cream: selvedge, PRO's panel, the cast-on when the club's second colour is dark. */
export const CREAM = "#F2EEE4";
/** Logo Blue: the end-edge selvedge, the one fixed brand thread (owner's lab allowance, 2026-10-07). */
export const BLUE = "#0151FC";
/** Undyed wool: the ground when no club is chosen. */
export const WOOL = "#E8E1D0";
export const CHAR = "#2B2B2B";
/** The patch ground when the club's second colour is dark. */
export const PATCH_FALLBACK = "#ECE6D8";
export const INK = "#23252A";
export const INK_SOFT = "#4F4A42";
/** Bench-jacket graphite: LEGEND's figure and sleeves. */
export const SLEEVE = "#2f343c";
export const SLEEVE_LT = "#4f5763";

const rgb = (c: string): Rgb => parseHex(c) ?? [0, 0, 0];

/** WCAG relative luminance of a `#rrggbb` colour. */
export const lum = (c: string): number => relativeLuminance(rgb(c));
/** WCAG contrast ratio between two `#rrggbb` colours. */
export const contrast = (a: string, b: string): number => contrastRatio(rgb(a), rgb(b));
/** `a` moved `t` of the way toward `b`, in sRGB (the lab's mix). */
export const mix = (a: string, b: string, t: number): string =>
  toHex(mixSrgb(rgb(a), rgb(b), 1 - t));

/** The floor for knitted figures and the name, before the knit's shadows (WCAG 1.4.3, large text). */
export const FIGURE_MIN = 3.2;
/** The floor for stripes and tacking lines, which carry the count while a rating forms (1.4.11). */
export const STRIPE_MIN = 3;

/** The first candidate that reaches `min` against `bg`, else the one that comes closest. */
function pick(bg: string, candidates: readonly string[], min: number): string {
  const ok = candidates.find((c) => contrast(c, bg) >= min);
  if (ok) return ok;
  return candidates.reduce((best, c) => (contrast(c, bg) > contrast(best, bg) ? c : best));
}

/** The lightest (or darkest) tint of `g` that reaches `target` contrast, from `t0` up to 0.9. */
function reach(g: string, target: number, t0: number, toward: string): string {
  let t = t0;
  let c = mix(g, toward, t);
  while (contrast(c, g) < target && t < 0.9) {
    t += 0.04;
    c = mix(g, toward, t);
  }
  return c;
}

/**
 * HOMA's relief tint: the lab's direction (light on a dark ground, shade on a pale one) unless that
 * cannot clear the floor, as on a mid-tone orange, where the other direction can.
 */
function relief(g: string, target: number, t0: number, lightG: boolean): string {
  const first = reach(g, target, t0, lightG ? "#000000" : "#ffffff");
  if (contrast(first, g) >= FIGURE_MIN) return first;
  const other = reach(g, target, t0, lightG ? "#ffffff" : "#000000");
  return contrast(other, g) > contrast(first, g) ? other : first;
}

/**
 * What the rib the dash is knitted on reads as once the knit is on it: the ground, one stitch-shadow
 * darker. Measured on the rendered scarf (WP6b): the rib's two column shades average about half the
 * ground's luminance, which is this mix toward black.
 */
const RIB_SHADOW = 0.25;
/** The contrast the dash keeps against that rib tone, before the knit's own shadows on both. */
export const DASH_RIB_MIN = 4.5;

/**
 * The unknown-number dash on a pale ground: a mid-tone of the ground yarn, the lightest shade (in
 * steps of 5% toward black from 50%) that keeps `DASH_RIB_MIN` against the rib. Falls back to the
 * charcoal where no shade can (a ground too dark for a shade to read, which takes the cream anyway).
 */
export function dashShade(g: string): string {
  const rib = mix(g, "#000000", RIB_SHADOW);
  for (let t = 0.5; t <= 0.95; t += 0.05) {
    const shade = mix(g, "#000000", t);
    if (contrast(shade, rib) >= DASH_RIB_MIN && contrast(shade, g) >= FIGURE_MIN) return shade;
  }
  return CHAR;
}

export interface Palette {
  /** The ground yarn: the club's primary, or undyed wool. */
  G: string;
  /** The second yarn: the club's secondary, or cream (charcoal with no club). */
  L: string;
  C: string;
  B: string;
  /** The knitted name. */
  N: string;
  /** The year (·26). */
  Y: string;
  /** HOMA's relief tint (figures) and its second, for tokens. */
  R: string;
  R2: string;
  /** The stripe yarn. */
  S: string;
  /** The drop-shadow yarn behind CHAMPION's and LEGEND's figures. */
  D: string;
  /** PRO's figures on the cream panel. */
  K: string;
  /** CHAMPION's and LEGEND's figures. */
  F: string;
  /** STADE's figures. */
  Sd: string;
  /** The tier word on its strip. */
  T: string;
  /** The dash of an unrated card. */
  dash: string;
  /** The base scarf's tone-on-tone name band. */
  Q: string;
  /** The founder's cast-on and the ink that knits 2026 into it. */
  cast: string;
  castInk: string;
  /** The woven patch ground. */
  patch: string;
  /** True when no club is chosen (undyed wool). */
  wool: boolean;
  Gdk: string;
  Gxd: string;
  Glt: string;
}

const cache = new Map<string, Palette>();

export function palette(p: Pick<CardProfile, "club">): Palette {
  const hex = (v: unknown): string | null => (typeof v === "string" && parseHex(v) ? v : null);
  const primary = hex(p.club?.primary);
  const secondary = primary ? hex(p.club?.secondary) : null;
  const key = `${primary ?? ""}|${secondary ?? ""}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const made = build(primary, secondary);
  if (cache.size > 64) cache.clear();
  cache.set(key, made);
  return made;
}

function build(club: string | null, second: string | null): Palette {
  const G = club ?? WOOL;
  const L = club ? (second ?? CREAM) : CHAR;
  const lightG = lum(G) > 0.42;
  // the knitted name: cream on a dark ground, charcoal on a pale one, whichever clears the floor
  const N = pick(G, [lightG ? CHAR : CREAM, lightG ? CREAM : CHAR], FIGURE_MIN);
  // the year (·26): the club's second colour, unless it would vanish on the ground
  const Y = contrast(L, G) >= FIGURE_MIN ? L : N;
  // the founder's cast-on: the club's second colour when it is light enough to read as cream
  const cast = lum(L) > 0.55 ? L : CREAM;
  const castInk = [G, L, CHAR].find((c) => contrast(c, cast) >= 3.2) ?? CHAR;
  const patch = lum(L) > 0.55 ? L : PATCH_FALLBACK;
  // HOMA's single-colour relief: the raised stitches catch the light (or, on a pale ground, the
  // shade). Pushed until the figures clear 6:1 before the stitch texture, so they stay above 3:1
  // on the card once the knit's shadows are on them, and above 4.5:1 on tokens.
  const R = relief(G, 6.2, 0.55, lightG);
  const R2 = relief(G, 5.0, 0.5, lightG);
  // the stripe yarn: the second colour, or cream when the second colour is too close to the ground
  const S = pick(G, [L, CREAM, CHAR], STRIPE_MIN);
  // the knitted drop shadow behind CHAMPION's and LEGEND's figures: a third, near-black yarn
  const D = lightG ? mix(G, "#000000", 0.45) : mix(G, "#000000", 0.62);
  // PRO's figures on the cream panel: the ground yarn, or the second yarn when the ground is too pale
  const K = pick(CREAM, [G, L, CHAR], FIGURE_MIN);
  // CHAMPION's and LEGEND's cream figures, or the second yarn on a pale ground
  const F = pick(G, [CREAM, L, CHAR], FIGURE_MIN);
  // STADE's figures: the second yarn on the ground, the lab's choice, unless it is too close
  const Sd = pick(G, [L, CREAM, CHAR], FIGURE_MIN);
  // the word on the tier strip (the strip is the stripe yarn)
  const T = pick(S, [G, CREAM, CHAR], FIGURE_MIN);
  // the base scarf (no tier yet): the dash is cream where the ground is dark, as before. On a pale
  // ground (undyed wool included) it is no longer charcoal, which knitted as a censoring bar; it is a
  // mid-tone of the ground yarn itself, the lightest shade that stays 4.5:1 from the rib tone it is
  // knitted on (see `dashShade`), and a tone-on-tone name band, a darker lot of the ground yarn,
  // which keeps the name's own colour legible on it
  const dash = contrast(CREAM, G) >= contrast(CHAR, G) ? CREAM : dashShade(G);
  const Q = lightG ? mix(G, "#000000", 0.14) : mix(G, "#000000", 0.4);
  return {
    G,
    L,
    C: CREAM,
    B: BLUE,
    N,
    Y,
    R,
    R2,
    S,
    D,
    K,
    F,
    Sd,
    T,
    dash,
    Q,
    cast,
    castInk,
    patch,
    wool: !club,
    Gdk: mix(G, "#000000", 0.3),
    Gxd: mix(G, "#000000", 0.5),
    Glt: mix(G, "#ffffff", 0.18),
  };
}
