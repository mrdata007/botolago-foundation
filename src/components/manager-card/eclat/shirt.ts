/**
 * The shirt (plan 5.1, revision 3): the club's match shirt at measured flat-lay proportions, drawn in
 * 3D with vector shading only: a piqué knit, sleeve volume across each sleeve's axis, the body as a
 * cylinder (shadow, specular ridge, key light), pectoral and chest-shadow volume, creases in
 * dark-and-light pairs, the collar's rib and V, armhole seams, the hem's stitch line and underside,
 * cuffs, rim and edge light, and the chest disc where a crest would be (never a crest, no text).
 *
 * Colour fidelity: every light overlay uses the shirt's own highlight tint, so a club colour is
 * lit and shaded, not washed out. No club: the neutral shirt.
 *
 * Shapes only, in jersey space, placed on the card by `JT`; the caller mirrors the layer in Arabic.
 */
import type { CardClub } from "../types";
import type { Foil, ShirtColours } from "./foil";
import { mix } from "./foil";
import { COLLAR_V, CUFF_L, CUFF_R, HEM, JT, NECK_IN, SHIRT, SLEEVE_L, SLEEVE_R } from "./geometry";

export interface ShirtOpts {
  /** The face-à-face card: no piqué. */
  compact: boolean;
  colours: ShirtColours;
}

/** The shirt's gradients, patterns, masks and clip paths. */
export function shirtDefs(id: string, o: ShirtOpts): string {
  const { hl, dark } = o.colours;
  const dot = dark ? 0.03 : 0.05;
  return `
    <clipPath id="${id}-shirt"><path d="${SHIRT}"/></clipPath>
    <clipPath id="${id}-collar"><path d="${SHIRT}"/><rect x="400" y="300" width="200" height="100"/></clipPath>
    <pattern id="${id}-knit" width="7" height="6" patternUnits="userSpaceOnUse"><circle cx="1.75" cy="1.5" r="1.2" fill="#000" fill-opacity=".08"/><circle cx="5.25" cy="4.5" r="1.2" fill="#000" fill-opacity=".08"/><circle cx="1.35" cy="1.1" r=".7" fill="#fff" fill-opacity="${dot}"/><circle cx="4.85" cy="4.1" r=".7" fill="#fff" fill-opacity="${dot}"/></pattern>
    <linearGradient id="${id}-knitmG" x1="292" y1="0" x2="708" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff"/><stop offset="1" stop-color="#fff" stop-opacity=".7"/></linearGradient>
    <mask id="${id}-knitm" maskUnits="userSpaceOnUse" x="150" y="260" width="700" height="680"><rect x="150" y="260" width="700" height="680" fill="url(#${id}-knitmG)"/></mask>
    <linearGradient id="${id}-volX" x1="292" y1="0" x2="708" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity=".34"/><stop offset=".1" stop-color="#000" stop-opacity=".12"/><stop offset=".2" stop-color="#000" stop-opacity="0"/><stop offset=".34" stop-color="${hl}" stop-opacity=".1"/><stop offset=".56" stop-color="${hl}" stop-opacity=".44"/><stop offset=".72" stop-color="${hl}" stop-opacity=".1"/><stop offset=".82" stop-color="#000" stop-opacity="0"/><stop offset=".92" stop-color="#000" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".36"/></linearGradient>
    <linearGradient id="${id}-volY" x1="0" y1="300" x2="0" y2="906" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hl}" stop-opacity=".24"/><stop offset=".4" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".12"/></linearGradient>
    <radialGradient id="${id}-key" cx="660" cy="360" r="380" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${hl}" stop-opacity=".36"/><stop offset="1" stop-color="${hl}" stop-opacity="0"/></radialGradient>
    <linearGradient id="${id}-slvL" x1="254" y1="374" x2="328" y2="482" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".14"/><stop offset=".45" stop-color="#000" stop-opacity=".04"/><stop offset="1" stop-color="#000" stop-opacity=".35"/></linearGradient>
    <linearGradient id="${id}-slvR" x1="746" y1="374" x2="672" y2="482" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".18"/><stop offset=".5" stop-color="#fff" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></linearGradient>
    <linearGradient id="${id}-rib" x1="0" y1="290" x2="0" y2="390" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset="1" stop-color="#000" stop-opacity=".3"/></linearGradient>
    <linearGradient id="${id}-edgelt" x1="190" y1="0" x2="520" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity="${dark ? 0.3 : 0.18}"/><stop offset=".55" stop-color="#fff" stop-opacity="${dark ? 0.24 : 0.14}"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
}

/** The rim light's gradient depends on the tier's light colour. */
export function shirtRimDef(F: Foil, id: string): string {
  return `<linearGradient id="${id}-rim" x1="320" y1="760" x2="760" y2="340" gradientUnits="userSpaceOnUse"><stop offset=".55" stop-color="${F.light}" stop-opacity="0"/><stop offset="1" stop-color="${F.light}" stop-opacity=".7"/></linearGradient>`;
}

/**
 * A crease: a dark line and a light line 5 units toward the light (up and right), the light half as
 * wide. `hl` is the shirt's own highlight tint.
 */
export const crease = (d: string, w: number, op: number, lop: number, hl: string): string =>
  `<path d="${d}" stroke="#000" stroke-opacity="${op}" stroke-width="${w}" fill="none"/><path d="${d}" stroke="${hl}" stroke-opacity="${(lop * 1.6).toFixed(2)}" stroke-width="${Math.round(w / 2)}" fill="none" transform="translate(5 -3)"/>`;

/**
 * The chest crease, the one fold that passes under the number: the print follows it (plan 5.2).
 */
export const centreCrease = (hl: string): string =>
  `<path d="M512 400C504 540 512 700 504 862" stroke="${hl}" stroke-opacity=".18" stroke-width="16" fill="none"/>` +
  crease("M470 560C478 660 470 760 476 860", 10, 0.24, 0.12, hl);

/** The shirt layer's content (a `<g>` clipped to the window by the caller's layer). */
export function shirtLayer(club: CardClub | null, id: string, o: ShirtOpts): string {
  const { primary, secondary, hl } = o.colours;
  const disc = club
    ? `<circle cx="600" cy="428" r="24" fill="${mix(club.primary, "#000000", 0.22)}" stroke="${secondary}" stroke-width="3.5"/><circle cx="600" cy="428" r="24" fill="url(#${id}-rib)" opacity=".6"/>`
    : "";
  return `<g clip-path="url(#${id}-win)"><g transform="${JT}">
    <path d="${SHIRT}" fill="${primary}"/>
    <path d="${NECK_IN}" fill="${mix(primary, "#000000", 0.55)}"/>
    <g clip-path="url(#${id}-shirt)">
      ${o.compact ? "" : `<path d="${SHIRT}" fill="url(#${id}-knit)" mask="url(#${id}-knitm)"/>`}
      <path d="${SLEEVE_L}" fill="url(#${id}-slvL)"/>
      <path d="${SLEEVE_R}" fill="url(#${id}-slvR)"/>
      <path d="${SHIRT}" fill="url(#${id}-volX)"/>
      <path d="${SHIRT}" fill="url(#${id}-volY)"/>
      <path d="${SHIRT}" fill="url(#${id}-key)"/>
      <g filter="url(#${id}-b14)">
        <ellipse cx="420" cy="410" rx="95" ry="55" fill="${hl}" fill-opacity=".34"/>
        <ellipse cx="590" cy="410" rx="95" ry="55" fill="${hl}" fill-opacity=".34"/>
        <ellipse cx="500" cy="520" rx="190" ry="30" fill="#000" fill-opacity=".16"/>
      </g>
      <g filter="url(#${id}-b4)">
        ${crease("M300 520C318 600 328 680 332 770", 12, 0.32, 0.16, hl)}
        ${crease("M700 520C682 600 672 680 668 770", 12, 0.24, 0.2, hl)}
        ${centreCrease(hl)}
        ${crease("M300 846C360 830 420 862 500 850S640 832 700 848", 10, 0.3, 0.14, hl)}
        ${crease("M296 470C270 486 248 510 232 540", 10, 0.3, 0.12, hl)}
        ${crease("M704 470C730 486 752 510 768 540", 10, 0.2, 0.14, hl)}
      </g>
      <path d="M418 304L500 392L582 304" stroke="#000" stroke-opacity=".45" stroke-width="22" fill="none" transform="translate(0 10)" filter="url(#${id}-b8)"/>
      <path d="M318 330C306 380 298 440 292 492M682 330C694 380 702 440 708 492" stroke="#000" stroke-opacity=".32" stroke-width="3" fill="none"/>
      <path d="M321 334C309 384 301 444 295 496M685 334C697 384 705 444 711 496" stroke="#fff" stroke-opacity=".14" stroke-width="1.4" fill="none"/>
      <path d="${HEM}" fill="#000" fill-opacity=".14"/>
      <path d="M300 868Q500 890 700 868" stroke="#fff" stroke-opacity=".18" stroke-width="1.6" fill="none"/>
      <path d="M311 889Q500 907 689 889" stroke="#000" stroke-opacity=".45" stroke-width="5" fill="none"/>
      <path d="${CUFF_L}" fill="${secondary}"/><path d="${CUFF_R}" fill="${secondary}"/>
      <path d="${CUFF_L}" fill="url(#${id}-slvL)"/><path d="${CUFF_R}" fill="url(#${id}-slvR)"/>
      <path d="${SHIRT}" fill="none" stroke="url(#${id}-rim)" stroke-width="10"/>
      <path d="${SHIRT}" fill="none" stroke="url(#${id}-edgelt)" stroke-width="6"/>
    </g>
    <g clip-path="url(#${id}-collar)">
      <path d="M422 300Q500 316 578 300" stroke="${secondary}" stroke-width="14" fill="none"/>
      <path d="M422 300Q500 316 578 300" stroke="url(#${id}-rib)" stroke-width="14" fill="none"/>
      <path d="M429.7 292.9L500 368.4L570.3 292.9" stroke="#000" stroke-opacity=".35" stroke-width="3" fill="none" transform="translate(0 3)"/>
      <path d="${COLLAR_V}" stroke="${secondary}" stroke-width="18" fill="none" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt"/>
      <path d="${COLLAR_V}" stroke="url(#${id}-rib)" stroke-width="18" fill="none" stroke-linejoin="miter" stroke-miterlimit="4" stroke-linecap="butt"/>
      <path d="M428.6 293.9L500 371.7L571.4 293.9" stroke="#fff" stroke-opacity=".3" stroke-width="1.4" fill="none"/>
    </g>
    ${disc}
  </g></g>`;
}
