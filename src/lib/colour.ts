/**
 * Colour arithmetic for the club palette (`club-palette.ts`) and the kit table
 * (`kits.ts`): sRGB hex, OKLab / OKLCH, the two `color-mix()` interpolation
 * spaces the stylesheet uses, WCAG 2 relative luminance and contrast, and the
 * OKLab distance the home/away clash rule reads.
 *
 * Pure functions over numbers. No DOM, no React, no theme: a caller passes the
 * colours it means, including the token values it is measuring against.
 *
 * Why it computes rather than asks the browser: a club colour arrives at
 * runtime (a hex from data, or the kit table), while the foreground that sits
 * on it has to be decided BEFORE it is painted and for both themes at once —
 * the dark theme is dormant and nothing in the running app can measure it.
 * CSS `contrast-color()` would be the native answer once browsers ship it.
 */

/** Gamma-encoded sRGB, each channel 0..1. */
export type Rgb = readonly [number, number, number];
/** OKLab: L 0..1, a and b roughly -0.4..0.4. */
export type Oklab = readonly [number, number, number];

const clamp01 = (value: number) => Math.min(1, Math.max(0, value));

/** `#rgb` or `#rrggbb` (case-insensitive) → sRGB. Anything else is `null`. */
export function parseHex(value: string | null | undefined): Rgb | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec((value ?? "").trim());
  if (!match) return null;
  const digits =
    match[1].length === 3
      ? match[1]
          .split("")
          .map((c) => c + c)
          .join("")
      : match[1];
  const n = parseInt(digits, 16);
  return [((n >> 16) & 0xff) / 255, ((n >> 8) & 0xff) / 255, (n & 0xff) / 255];
}

/** A real `#rrggbb` colour, lower-cased, or `null` for anything that is not one. */
export function normaliseHex(value: string | null | undefined): string | null {
  const rgb = parseHex(value);
  return rgb ? toHex(rgb) : null;
}

/** sRGB → `#rrggbb`. Channels are clipped to the gamut and rounded. */
export function toHex(rgb: Rgb): string {
  return `#${rgb
    .map((c) =>
      Math.round(clamp01(c) * 255)
        .toString(16)
        .padStart(2, "0"),
    )
    .join("")}`;
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
const fromLinear = (c: number) =>
  c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055;

/** sRGB → OKLab (Björn Ottosson's matrices, as CSS Color 4 specifies). */
export function rgbToOklab(rgb: Rgb): Oklab {
  const [r, g, b] = rgb.map(toLinear);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** OKLab → sRGB, clipped per channel to the gamut. */
export function oklabToRgb(lab: Oklab): Rgb {
  const [L, a, b] = lab;
  const l = Math.pow(L + 0.3963377774 * a + 0.2158037573 * b, 3);
  const m = Math.pow(L - 0.1055613458 * a - 0.0638541728 * b, 3);
  const s = Math.pow(L - 0.0894841775 * a - 1.291485548 * b, 3);
  return [
    clamp01(fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s)),
    clamp01(fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s)),
    clamp01(fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s)),
  ];
}

/**
 * `oklch(L C H)` as the stylesheet writes it — L as a number (0..1) or a
 * percentage, C a number, H in degrees — → sRGB. Anything else is `null`.
 */
export function parseOklch(value: string): Rgb | null {
  const match = /^oklch\(\s*([\d.]+)(%?)\s+([\d.]+)\s+([\d.]+)(?:deg)?\s*\)$/i.exec(value.trim());
  if (!match) return null;
  const L = Number(match[1]) / (match[2] ? 100 : 1);
  const C = Number(match[3]);
  const h = (Number(match[4]) * Math.PI) / 180;
  return oklabToRgb([L, C * Math.cos(h), C * Math.sin(h)]);
}

/** A hex or an `oklch()` literal → sRGB, or `null`. */
export function parseColour(value: string): Rgb | null {
  return parseHex(value) ?? parseOklch(value);
}

/** `color-mix(in oklab, a <weightA>, b)` for two opaque colours. `weightA` is 0..1. */
export function mixOklab(a: Rgb, b: Rgb, weightA: number): Rgb {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  return oklabToRgb([
    la[0] * weightA + lb[0] * (1 - weightA),
    la[1] * weightA + lb[1] * (1 - weightA),
    la[2] * weightA + lb[2] * (1 - weightA),
  ]);
}

/** `color-mix(in srgb, a <weightA>, b)` for two opaque colours. `weightA` is 0..1. */
export function mixSrgb(a: Rgb, b: Rgb, weightA: number): Rgb {
  return [
    a[0] * weightA + b[0] * (1 - weightA),
    a[1] * weightA + b[1] * (1 - weightA),
    a[2] * weightA + b[2] * (1 - weightA),
  ];
}

/** WCAG 2 relative luminance. */
export function relativeLuminance(rgb: Rgb): number {
  const [r, g, b] = rgb.map(toLinear);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio, 1..21, order-independent. */
export function contrastRatio(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** Euclidean distance in OKLab (ΔEok). Multiply by 100 for the usual 0..100 scale. */
export function deltaEOk(a: Rgb, b: Rgb): number {
  const la = rgbToOklab(a);
  const lb = rgbToOklab(b);
  return Math.hypot(la[0] - lb[0], la[1] - lb[1], la[2] - lb[2]);
}
