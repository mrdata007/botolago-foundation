/**
 * Tokens and minis: the shield at 24 to 80 px tall, one flat SVG in a `<span>` of its own size. No
 * layers, no foil overlay, no beats, no filters. Below the full card the autograph, the stats and
 * the micro text are unreadable, so a token keeps the tier's metal (the frame), its face, and the
 * rating large in the middle; a holographic tier's frame is its prism (`…-foil`).
 *
 *   token (44-80)  frame, face, inner line, the rating (or the dash)
 *   mini (28-32)   frame and face, the rating larger still
 *   mini (24)      frame and face only (the row prints the number beside it)
 */
import type { CardTheme, TokenSize } from "../types";
import { ASPECT } from "./estimate";
import { SHIELD, inset } from "./geometry";
import { uid } from "./ids";
import type { Metal } from "./metal";
import { esc, eclatView, makeView, mix, ovrText, tokenLabel } from "./view";
import type { CardProfile, CardStrings } from "../types";

/** The token's box: `size` tall and the shield's width for it. */
export const tokenWidth = (size: number): number => Math.round(size / ASPECT);

export const stops = (colours: readonly string[]): string =>
  colours
    .map((c, i, all) => `<stop offset="${(i / (all.length - 1)).toFixed(3)}" stop-color="${c}"/>`)
    .join("");

/** The gradients a shield drawing needs, under `id`. */
export function shieldDefs(id: string, m: Metal, cell = 3.4): string {
  const c = cell.toFixed(2);
  const chk = m.checker
    ? `<pattern id="${id}-chk" width="${(cell * 2).toFixed(2)}" height="${(cell * 2).toFixed(2)}" patternUnits="userSpaceOnUse"><rect width="${(cell * 2).toFixed(2)}" height="${(cell * 2).toFixed(2)}" fill="${m.checker[0]}"/><rect width="${c}" height="${c}" fill="${m.checker[1]}"/><rect x="${c}" y="${c}" width="${c}" height="${c}" fill="${m.checker[1]}"/></pattern>`
    : "";
  return (
    chk +
    `<linearGradient id="${id}-face" x1="0" y1="0" x2="0.35" y2="1">${stops(m.faceStops)}</linearGradient>` +
    `<linearGradient id="${id}-metal" x1="0" y1="0" x2="0.6" y2="1">${stops(m.frame)}</linearGradient>` +
    (m.holo
      ? `<linearGradient id="${id}-foil" x1="0" y1="0" x2="1" y2="1">${stops(m.holo)}</linearGradient>`
      : "") +
    (m.num
      ? `<linearGradient id="${id}-num" x1="0" y1="0" x2="0" y2="1">${stops(m.num)}</linearGradient>`
      : "")
  );
}

export function tokenMarkup(
  profile: CardProfile,
  strings: CardStrings,
  size: TokenSize,
  theme: CardTheme,
): string {
  const v = makeView(profile, strings);
  const { m } = v;
  const id = uid("mc-t");
  const frame = m.checker ? `url(#${id}-chk)` : m.holo ? `url(#${id}-foil)` : `url(#${id}-metal)`;
  // the page edge: a hairline that keeps a light metal on a light page (and a dark one on a dark
  // page) from melting into it
  const edge =
    theme === "dark" ? "rgba(255,255,255,0.28)" : m.dark ? "rgba(0,0,0,0.18)" : "rgba(0,0,0,0.32)";
  const u = 136.6 / size; // units per CSS pixel
  let art = `<path d="${SHIELD}" fill="${frame}"/>`;
  const faceScale = size >= 44 ? [0.9, 0.93] : [0.86, 0.9];
  art += `<path d="${SHIELD}" fill="url(#${id}-face)" transform="${inset(faceScale[0]!, faceScale[1]!)}"/>`;
  if (size >= 44) {
    art += `<path d="${SHIELD}" fill="none" stroke="${m.line}" stroke-opacity=".8" stroke-width="${(0.9 * u).toFixed(2)}" transform="${inset(0.84, 0.885)}"/>`;
  }
  art += `<path d="${SHIELD}" fill="none" stroke="${edge}" stroke-width="${(0.9 * u).toFixed(2)}"/>`;
  if (size >= 28) {
    const text = ovrText(v);
    const fontSize = size >= 44 ? 50 : 58;
    const fill = m.num ? `url(#${id}-num)` : m.ink;
    // a dark rim under the digits on the light metals, a light one under them on the dark faces
    const halo = mix(m.faceStops[1]!, m.dark ? "#000000" : "#ffffff", 0.35);
    const digits = (extra: string) =>
      `<text x="50" y="${(76 + fontSize * 0.35).toFixed(1)}" font-family="Changa, sans-serif" font-weight="800" font-size="${fontSize}" text-anchor="middle" direction="ltr" ${extra}>${esc(text)}</text>`;
    art += `<g data-mc="ovr">${digits(`fill="none" stroke="${halo}" stroke-width="${(1.6 * u).toFixed(2)}" stroke-linejoin="round"`)}${digits(`fill="${fill}"`)}</g>`;
  }
  return (
    `<span class="mc-tok mc-tok--${size} mc-tok--${v.key}${v.edition ? ` mc-tok--ed-${v.edition}` : ""}" role="img" aria-label="${esc(tokenLabel(eclatView(profile, strings)))}" dir="${v.ar ? "rtl" : "ltr"}" style="width:${tokenWidth(size)}px;height:${size}px">` +
    `<svg viewBox="0 0 100 136.6" aria-hidden="true" focusable="false" style="direction:ltr;display:block;width:100%;height:100%"><defs>${shieldDefs(id, m, Math.max(3.4, 2 * u))}</defs>${art}</svg>` +
    `</span>`
  );
}
