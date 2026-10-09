/**
 * Tokens and minis (plan 7): the card at 24 to 80 px, one flat SVG in a `<span>` of its own size. No
 * 3D layers, no foil overlay, no beats, no filters, no blur, no patterns, no masks. They are redrawn
 * per size, not shrunk: below the full card the frame's furniture, the plate's text and every
 * texture are unreadable, so each size keeps only the rating, the tier's identity (the metal and the
 * field colour) and the jersey, and the jersey is enlarged inside the silhouette so the number stays
 * legible (it never gets smaller as the token grows).
 *
 *   card (80 px)    the shield window, the token shirt, the tier bar, the metal edge, the number
 *   jersey (28-64)  the whole outline as the field, a 2 px ring in the tier's metal (foil on
 *                   CHAMPION and LEGEND), the token shirt, a tier bar (64) or a foot band (28-56)
 *   mini (< 28)     as the jersey without the number (the row prints it)
 */
import type { CardTheme, TokenSize } from "../types";
import { mix, stops } from "./foil";
import {
  NECK_TOKEN,
  OUTLINE,
  SHIRT_TOKEN,
  TIER_BAR,
  TOKEN_BODY,
  TOKEN_WINDOW,
  CHEST,
  VIEW_BOX,
  mirror,
  n2,
} from "./geometry";
import { uid } from "./ids";
import { measureText, type Measure } from "./measure";
import { fitNumber } from "./number";
import { esc, makeView, tokenLabel, type View } from "./view";
import { shirtColours } from "./foil";

/** The token's box: `size` tall and 0.618 of it wide, for every profile. */
export const tokenWidth = (size: number): number => Math.round(size * 0.618);

type Level = "card" | "jersey" | "mini";
const levelOf = (size: number): Level => (size >= 80 ? "card" : size >= 28 ? "jersey" : "mini");

/** The enlarged shirt's scale and the height of its centre, per size. */
function placement(size: number): readonly [k: number, yc: number] {
  if (size >= 80) return [1.86, 720];
  if (size >= 64) return [1.82, 780];
  if (size >= 44) return [2.04, 820];
  return [2.21, 820];
}

export function tokenMarkup(
  v: View,
  size: TokenSize,
  theme: CardTheme,
  measure: Measure = measureText,
): string {
  const { F, p, ar } = v;
  const id = uid("mc-t");
  const u = 1618 / size; // viewBox units per CSS pixel
  const edge = theme === "dark" ? F.edgeD : F.edgeL;
  const col = shirtColours(p.club, F);
  const level = levelOf(size);
  const [k, yc] = placement(size);
  const T = `translate(500 ${yc}) scale(${k}) translate(-500 -603)`;
  const metal = F.foil ? `url(#${id}-foil)` : `url(#${id}-metal)`;
  const ringPaint = F.foil
    ? `url(#${id}-foil)`
    : level === "card"
      ? `url(#${id}-metal)`
      : F.tokEdge!;
  const defs =
    `<defs><clipPath id="${id}-out"><path d="${OUTLINE}"/></clipPath>${level === "card" ? `<clipPath id="${id}-win"><path d="${TOKEN_WINDOW}"/></clipPath>` : ""}` +
    `<linearGradient id="${id}-metal" x1="0" y1="0" x2="1000" y2="1618" gradientUnits="userSpaceOnUse">${stops(F.metal)}</linearGradient>` +
    (F.foil
      ? `<linearGradient id="${id}-foil" x1="0" y1="0" x2="1000" y2="1618" gradientUnits="userSpaceOnUse">${stops(F.foil)}</linearGradient>`
      : "") +
    `<linearGradient id="${id}-field" x1="0" y1="0" x2="0" y2="1618" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${mix(F.deep, F.glow, 0.25)}"/><stop offset=".6" stop-color="${F.deep}"/><stop offset="1" stop-color="${F.plate}"/></linearGradient>` +
    `<radialGradient id="${id}-back" cx="500" cy="660" r="620" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="${F.glow}" stop-opacity=".55"/><stop offset="1" stop-color="${F.glow}" stop-opacity="0"/></radialGradient>` +
    `<linearGradient id="${id}-vol" x1="316" y1="0" x2="684" y2="0" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#000" stop-opacity=".26"/><stop offset=".62" stop-color="#fff" stop-opacity=".12"/><stop offset="1" stop-color="#000" stop-opacity=".22"/></linearGradient></defs>`;

  // static depth: the outline copy under the card, a pixel down and away from the light. It sits in
  // the group that is mirrored in Arabic, so the same offset lands on the other side of the screen
  // (the card's thickness shows at the trailing edge in both languages, as the full card's rims do)
  let art = `<path d="${OUTLINE}" fill="${mix(edge, "#000000", 0.45)}" transform="translate(${n2(u)} ${n2(u)})"/>`;
  art += `<path d="${OUTLINE}" fill="${F.plate}"/>`;
  const inner = level === "card" ? TOKEN_WINDOW : OUTLINE;
  art += `<g clip-path="url(#${id}-out)"><path d="${inner}" fill="url(#${id}-field)"/><path d="${inner}" fill="url(#${id}-back)"/>`;
  // below 80 px: a 2 px ring in the tier's edge colour (foil on CHAMPION and LEGEND), under the jersey
  if (level !== "card")
    art += `<path d="${OUTLINE}" fill="none" stroke="${ringPaint}" stroke-width="${n2(4 * u)}"/>`;
  let shirt = `<path d="${SHIRT_TOKEN}" fill="${col.primary}"/>`;
  shirt += `<path d="${NECK_TOKEN}" fill="${mix(col.primary, "#000000", 0.55)}"/>`;
  shirt += `<path d="${SHIRT_TOKEN}" fill="url(#${id}-vol)"/>`;
  shirt += `<path d="M424 300L500 380L576 300" stroke="${col.secondary}" stroke-width="${level === "card" ? 24 : 30}" fill="none" stroke-linejoin="miter" stroke-linecap="butt"/>`;
  shirt += p.club
    ? `<path d="${SHIRT_TOKEN}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${n2((u * 0.9) / k)}"/>`
    : `<path d="${SHIRT_TOKEN}" fill="none" stroke="${F.light}" stroke-opacity=".6" stroke-width="${n2(u / k)}"/>`;
  art += `<g clip-path="url(#${id}-${level === "card" ? "win" : "out"})"><g transform="${T}">${shirt}</g></g>`;
  if (level === "card") {
    art += `<path d="${TOKEN_WINDOW}" fill="none" stroke="${metal}" stroke-width="${n2(2 * u)}"/>`;
    art += `<path d="${TIER_BAR}" fill="${metal}"/>`;
  } else if (size >= 64) {
    art += `<path d="${TIER_BAR}" fill="${ringPaint}"/>`;
  } else {
    // a foot band in the tier's edge colour carries the tier identity
    art += `<rect x="0" y="${n2(1618 - 3 * u)}" width="1000" height="${n2(3 * u)}" fill="${ringPaint}"/>`;
  }
  art += `</g>`;
  // the edge: at 80 one pixel of the tier metal inside; always the theme edge on the outline
  if (level === "card")
    art += `<g clip-path="url(#${id}-out)"><path d="${OUTLINE}" fill="none" stroke="${metal}" stroke-width="${n2(2 * u)}"/></g>`;
  art += `<path d="${OUTLINE}" fill="none" stroke="${edge}" stroke-width="${n2(0.9 * u)}"/>`;
  let body = defs + mirror(art, ar);

  // the number (not on the 24 px mini): inside the scaled chest box, or the body at chest height
  if (level !== "mini") {
    const text = p.ovr == null ? "—" : String(p.ovr);
    const half = level === "card" ? 1.1 * u : 0.8 * u;
    const B = level === "card" ? CHEST : TOKEN_BODY;
    const box = {
      x0: 500 + (B.x0 - 500) * k,
      x1: 500 + (B.x1 - 500) * k,
      y0: yc + (B.y0 - 603) * k,
      y1: yc + (B.y1 - 603) * k,
      cy: yc + (B.cy - 603) * k,
    };
    const f = fitNumber(text, box, half, 10000, measure);
    const out = col.numberFill === "#FFFFFF" ? mix(col.primary, "#000000", 0.6) : "#FFFFFF";
    const digits = (extra: string) =>
      `<text x="${f.x.toFixed(1)}" y="${f.y.toFixed(1)}" class="mc-f-d" font-size="${f.size.toFixed(1)}" text-anchor="middle" direction="ltr" ${extra}>${esc(text)}</text>`;
    body += `<g data-mc="ovr">${digits(`fill="none" stroke="${out}" stroke-width="${(2 * half).toFixed(1)}" stroke-linejoin="round"`)}${digits(`fill="${col.numberFill}"`)}</g>`;
  }
  return (
    `<span class="mc-tok mc-tok--${size}" role="img" aria-label="${esc(tokenLabel(v))}" dir="${ar ? "rtl" : "ltr"}" style="width:${tokenWidth(size)}px;height:${size}px">` +
    `<svg viewBox="${VIEW_BOX}" aria-hidden="true" focusable="false" style="direction:ltr">${body}</svg>` +
    `</span>`
  );
}
