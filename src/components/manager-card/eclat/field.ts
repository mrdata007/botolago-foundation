/**
 * The field (plan 5.3, revision 3): a lit backboard in the tier's colour behind the shirt, clipped
 * to the shield window. In order: the field gradient, the honeycomb in its tier's mode (engraved
 * lines, raised cells, or foil seen through the cells), LASTREET's fence and brushed sheen, grain,
 * the centre circle and halfway line, the backlight, the floodlights, STADE's pool of light, the
 * vignette, the foot shade, a black shirt's aura and the shirt's cast shadow. The honeycomb's phase
 * is the card's fingerprint, seeded by its serial.
 *
 * Pure: the same card gives the same markup. The revision 2 ribbons, glitch bars and pixel rain are
 * gone (plan 16).
 */
import type { Foil } from "./foil";
import { mix, stops } from "./foil";
import { HEX_H, HEX_W, HEX_R, JT, OUTLINE, POINT_Y, SHIRT, hexTile, n2 } from "./geometry";

/** Where the travelling parts sit at the rest light, for a flat render (the share art). */
export const REST = {
  foil: "translate(12 -19.2)",
  spec: "translate(38.4 -64)",
  light: "translate(62.4 -140.8)",
  cast: "translate(-3.36 6.4)",
} as const;

/** `class="…"`, plus its rest transform when the markup is drawn without the stylesheet. */
export const moving = (cls: keyof typeof REST, flat: boolean): string =>
  `class="mc-${
    cls === "foil"
      ? "foil-shift"
      : cls === "spec"
        ? "spec-shift"
        : cls === "light"
          ? "light-follow"
          : "shirt-cast"
  }"${flat ? ` transform="${REST[cls]}"` : ""}`;

/** The card's fingerprint: a serial, else name and season, picks the honeycomb's phase. */
export function fingerprint(seed: string): { ox: number; oy: number } {
  let h = 0x811c9dc5;
  for (const ch of seed) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // mulberry32
  let a = h | 0;
  const rnd = (): number => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const ox = Math.floor(rnd() * HEX_W);
  const oy = Math.floor(rnd() * 52);
  return { ox, oy };
}

/** The masks' region: the whole card with a margin. */
export const MASK_BOX = `maskUnits="userSpaceOnUse" x="-20" y="-20" width="1040" height="1660"`;

/** The field's gradients, patterns and masks (inside the base layer's one `<defs>`). */
export function fieldDefs(F: Foil, id: string, seed: string, flat = false): string {
  const { ox, oy } = fingerprint(seed);
  const phase = (dx: number, dy: number) =>
    `patternTransform="translate(${n2(ox + dx)} ${n2(oy + dy)})"`;
  const beamCol = F.beamCol ?? F.light;
  const pat = `width="${HEX_W}" height="${HEX_H}" patternUnits="userSpaceOnUse"`;
  const hexTint = F.hex.tint ? F.glow : F.light;
  const hexTintOp = F.hex.tint ? 0.32 : 0.12;
  return `
    <linearGradient id="${id}-field" x1="0" y1="22" x2="0" y2="${POINT_Y}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.deep}"/><stop offset=".55" stop-color="${mix(F.deep, F.plate, F.fieldMix ?? 0.62)}"/><stop offset="1" stop-color="${F.plate}"/></linearGradient>
    <radialGradient id="${id}-back" cx="500" cy="560" r="470" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.glow}" stop-opacity=".9"/><stop offset=".5" stop-color="${F.glow}" stop-opacity=".3"/><stop offset="1" stop-color="${F.glow}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-vig" cx="500" cy="540" r="740" gradientUnits="userSpaceOnUse"><stop offset=".5" stop-color="${F.plate}" stop-opacity="0"/><stop offset="1" stop-color="${F.plate}" stop-opacity=".9"/></radialGradient>
    <linearGradient id="${id}-foot" x1="0" y1="760" x2="0" y2="${POINT_Y}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.plate}" stop-opacity="0"/><stop offset="1" stop-color="${F.plate}" stop-opacity=".75"/></linearGradient>
    <linearGradient id="${id}-beam" x1="0" y1="22" x2="0" y2="980" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${beamCol}" stop-opacity="1"/><stop offset=".55" stop-color="${beamCol}" stop-opacity=".35"/><stop offset="1" stop-color="${beamCol}" stop-opacity="0"/></linearGradient>
    <radialGradient id="${id}-lamp"><stop offset="0" stop-color="#fff" stop-opacity="1"/><stop offset=".35" stop-color="${beamCol}" stop-opacity=".6"/><stop offset="1" stop-color="${beamCol}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-pool" cx="500" cy="930" r="320" gradientTransform="translate(0 698) scale(1 .25)" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.light}" stop-opacity=".55"/><stop offset="1" stop-color="${F.light}" stop-opacity="0"/></radialGradient>
    <radialGradient id="${id}-hexfadeG" cx="500" cy="560" r="640" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".12"/><stop offset=".42" stop-color="#fff" stop-opacity=".3"/><stop offset=".75" stop-color="#fff" stop-opacity=".72"/><stop offset="1" stop-color="#fff" stop-opacity=".5"/></radialGradient>
    <mask id="${id}-hexfade" ${MASK_BOX}><rect width="1000" height="1618" fill="url(#${id}-hexfadeG)"/></mask>
    <pattern id="${id}-hexD" ${pat} ${phase(1.6, 2.2)}><path d="${hexTile(HEX_R)}" fill="none" stroke="#000" stroke-opacity=".55" stroke-width="2.6"/></pattern>
    <pattern id="${id}-hexL" ${pat} ${phase(-1, -1.2)}><path d="${hexTile(HEX_R)}" fill="none" stroke="#fff" stroke-opacity=".2" stroke-width="1.4"/></pattern>
    <pattern id="${id}-hexM" ${pat} ${phase(0, 0)}><path d="${hexTile(HEX_R)}" fill="none" stroke="${hexTint}" stroke-opacity="${hexTintOp}" stroke-width="1.3"/></pattern>
    <linearGradient id="${id}-cell" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".16"/><stop offset=".45" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".45"/></linearGradient>
    <pattern id="${id}-hexC" ${pat} ${phase(0, 0)}><path d="${hexTile(27)}" fill="${F.deep}" fill-opacity=".75"/><path d="${hexTile(27)}" fill="url(#${id}-cell)"/></pattern>
    <pattern id="${id}-hexW" ${pat} ${phase(0, 0)}><path d="${hexTile(27)}" fill="#fff"/></pattern>
    <mask id="${id}-cells" ${MASK_BOX}><rect width="1000" height="1618" fill="url(#${id}-hexW)"/></mask>
    ${F.foil ? `<linearGradient id="${id}-foil" x1="0" y1="0" x2="260" y2="180" gradientUnits="userSpaceOnUse" spreadMethod="reflect">${stops(F.foil)}</linearGradient>` : ""}
    ${F.hex.follow ? `<radialGradient id="${id}-lightG"><stop offset="0" stop-color="#fff"/><stop offset=".55" stop-color="#fff" stop-opacity=".6"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient><mask id="${id}-lightm" maskUnits="userSpaceOnUse" x="-400" y="-400" width="1800" height="2400"><ellipse ${moving("light", flat)} cx="500" cy="560" rx="380" ry="380" fill="url(#${id}-lightG)"/></mask>` : ""}
    ${F.cage ? `<pattern id="${id}-cage" width="44" height="44" patternUnits="userSpaceOnUse"><path d="M0 22L22 0L44 22L22 44Z" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="1.6" transform="translate(1 1)"/><path d="M0 22L22 0L44 22L22 44Z" fill="none" stroke="${F.light}" stroke-opacity=".5" stroke-width="1.6"/></pattern><linearGradient id="${id}-cagefadeG" x1="0" y1="22" x2="0" y2="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient><mask id="${id}-cagefade" ${MASK_BOX}><rect width="1000" height="1618" fill="url(#${id}-cagefadeG)"/></mask><linearGradient id="${id}-cageinvG" x1="0" y1="22" x2="0" y2="560" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#fff"/></linearGradient><mask id="${id}-cageinv" ${MASK_BOX}><rect width="1000" height="1618" fill="url(#${id}-cageinvG)"/></mask>` : ""}`;
}

export interface FieldOpts {
  /** The face-à-face card: no grain. */
  compact: boolean;
  /** A black shirt: a stronger backlight, an aura, a lighter cast shadow. */
  darkShirt: boolean;
  /** Write the rest transforms of the travelling parts (the share art has no stylesheet). */
  flat: boolean;
}

/** The honeycomb and what is drawn with it, for the tier's mode. */
function honeycomb(F: Foil, id: string, o: FieldOpts): string {
  const R = (fill: string, extra = ""): string =>
    `<rect width="1000" height="${POINT_Y}" fill="url(#${id}-${fill})" ${extra}/>`;
  let hex: string;
  if (F.hex.mode === "line") hex = R("hexD") + R("hexL") + R("hexM");
  else if (F.hex.mode === "cells") hex = R("hexC") + R("hexL");
  else {
    const foilRect = `<rect ${moving("foil", o.flat)} x="-50" y="-30" width="1050" height="1120" fill="url(#${id}-foil)"/>`;
    hex =
      R("hexD", `opacity=".45"`) +
      `<g mask="url(#${id}-cells)" opacity="${F.hex.op}">${F.hex.follow ? `<g mask="url(#${id}-lightm)">${foilRect}</g>` : foilRect}</g>` +
      R("hexL");
  }
  if (F.cage) hex = `<g mask="url(#${id}-cageinv)">${hex}</g>`;
  return `<g mask="url(#${id}-hexfade)"${F.hex.mode === "holo" ? "" : ` opacity="${F.hex.op}"`}>${hex}</g>`;
}

/** One floodlight: a soft beam, STADE's narrow core, and the lamp. */
function beam(F: Foil, id: string, x0: number, xl: number, xr: number, op: number): string {
  if (!op) return "";
  let s = `<path d="M${x0 - 16} 22L${x0 + 16} 22L${xr} 980L${xl} 980Z" fill="url(#${id}-beam)" opacity="${op}" filter="url(#${id}-b14)"/>`;
  if (F.core) {
    const c = (xr - xl) * 0.32;
    s += `<path d="M${x0 - 5} 22L${x0 + 5} 22L${n2(xr - c)} 900L${n2(xl + c)} 900Z" fill="url(#${id}-beam)" opacity="${(op * 0.9).toFixed(2)}" filter="url(#${id}-b5)"/>`;
  }
  return `${s}<ellipse cx="${x0}" cy="30" rx="80" ry="30" fill="url(#${id}-lamp)" opacity="${Math.min(1, op * 3.2).toFixed(2)}"/>`;
}

/** The outline filled with the plate: all the base layer a crop of the plate needs. */
export const plateBase = (F: Foil): string =>
  `<path d="${OUTLINE}" fill="${F.plate}" stroke="${mix(F.metal[3], "#000000", 0.71)}" stroke-width="2"/>`;

/**
 * The base layer: the outline filled with the plate, and, clipped to the shield window, the whole
 * field. Shapes only (the caller mirrors the group in Arabic).
 */
export function baseLayer(F: Foil, id: string, o: FieldOpts): string {
  const [bA, bB] = F.beams;
  const R = (fill: string, extra = ""): string =>
    `<rect width="1000" height="${POINT_Y}" fill="url(#${id}-${fill})" ${extra}/>`;
  const back = Math.min(0.9, F.back + (o.darkShirt ? 0.15 : 0)).toFixed(2);
  return `${plateBase(F)}
    <g clip-path="url(#${id}-win)">
      <rect width="1000" height="${POINT_Y + 4}" fill="url(#${id}-field)"/>
      <g class="mc-field">
        ${honeycomb(F, id, o)}
        ${F.cage ? R("cage", `mask="url(#${id}-cagefade)" opacity=".38"`) : ""}
        ${F.brushed ? R("brush", `opacity=".5"`) : ""}
        ${o.compact ? "" : R("grain")}
        <circle cx="500" cy="630" r="318" fill="none" stroke="#000" stroke-opacity=".4" stroke-width="5" transform="translate(2 3)"/>
        <circle cx="500" cy="630" r="318" fill="none" stroke="${F.light}" stroke-opacity=".16" stroke-width="3"/>
        <path d="M62 630H938" stroke="#000" stroke-opacity=".4" stroke-width="5" transform="translate(0 3)"/>
        <path d="M62 630H938" stroke="${F.light}" stroke-opacity=".16" stroke-width="3"/>
      </g>
      ${R("back", `opacity="${back}"`)}
      <g class="mc-flood">${beam(F, id, 262, 330, 640, bA)}${beam(F, id, 846, 380, 720, bB)}</g>
      ${F.pool ? `<ellipse cx="500" cy="930" rx="330" ry="84" fill="url(#${id}-pool)"/>` : ""}
      ${R("vig")}
      ${R("foot")}
      ${o.darkShirt ? `<path d="${SHIRT}" fill="${F.glow}" opacity=".55" filter="url(#${id}-b18)" transform="translate(500 603) scale(1.06) translate(-500 -603) ${JT}"/>` : ""}
      <g ${moving("cast", o.flat)}><path d="${SHIRT}" fill="#000" opacity="${o.darkShirt ? 0.4 : 0.7}" filter="url(#${id}-b18)" transform="translate(-20 30) ${JT}"/></g>
    </g>`;
}
