/**
 * The number, printed on the chest (plan 5.2, revision 3): the manager's rating as a shirt number,
 * fitted inside the chest box with room for its outlines, outlined like tackle-twill, raised with a
 * highlight and a shade that follow the light, printed on the cloth (the chest crease and the body's
 * falloff pass over it), with « OVR » under it. Never outside the shirt; a dash when there is no
 * rating yet, never 0.
 *
 * The number is its own group, `<g data-mc="ovr">`, with a transparent hit rectangle: it is the one
 * thing in the card that takes the pointer, it is never inside an animated element, a mask or a clip
 * that changes, and the light moves only the shade and highlight copies that sit outside it.
 */
import type { ShirtColours } from "./foil";
import { mix } from "./foil";
import { CHEST, DASH_FIT, DASH_HIT, JT, JT_DX, JT_DY, JT_SCALE, OUTLINE_HALF } from "./geometry";
import type { Ink, Measure } from "./measure";
import { centreCrease } from "./shirt";
import type { TextSpec } from "./text";
import { esc } from "./view";

export interface FitBox {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  cy?: number;
}

export interface NumberFit {
  size: number;
  /** For `text-anchor="middle"`. */
  x: number;
  /** The baseline. */
  y: number;
  /** The ink at this size, as `[x0, x1, a, d]` relative to the anchor and baseline would need. */
  ink: Ink;
}

/**
 * Fits the ink of `text` (not the em box) plus its outline and a 12 unit margin inside `box`,
 * centred on it: `size = min(max, (width − 2 half − 12) ÷ ink width, (height − 2 half − 12) ÷ ink
 * height)`; the anchor and the baseline then put the ink's centre on the box's centre.
 */
export function fitNumber(
  text: string,
  box: FitBox,
  half: number,
  maxSize: number,
  measure: Measure,
): NumberFit {
  const m = measure(text, "d");
  const w1 = m.x1 - m.x0;
  const h1 = m.a + m.d;
  const bw = box.x1 - box.x0 - 2 * half - 12;
  const bh = box.y1 - box.y0 - 2 * half - 12;
  const size = Math.min(maxSize, bw / w1, bh / h1);
  const cx = (box.x0 + box.x1) / 2;
  const cy = box.cy ?? (box.y0 + box.y1) / 2;
  return {
    size,
    x: cx + (m.w / 2 - (m.x0 + m.x1) / 2) * size,
    y: cy + ((m.a - m.d) / 2) * size,
    ink: m,
  };
}

/** The number to print, its fit and its hit box (jersey space). */
export interface Print {
  text: string;
  fit: NumberFit;
  hit: { x0: number; x1: number; y0: number; y1: number };
}

export function printOf(ovr: number | null, measure: Measure): Print {
  if (ovr == null) {
    return { text: "—", fit: fitNumber("—", DASH_FIT, OUTLINE_HALF, 220, measure), hit: DASH_HIT };
  }
  const text = String(ovr);
  return { text, fit: fitNumber(text, CHEST, OUTLINE_HALF, 300, measure), hit: CHEST };
}

/** The print's light gradient, over the fill. */
export const numberDefs = (id: string): string =>
  `<linearGradient id="${id}-numlight" x1="0" y1="${CHEST.y0}" x2="0" y2="${CHEST.y1}" gradientUnits="userSpaceOnUse"><stop offset="0" stop-color="#fff" stop-opacity=".22"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`;

export interface NumberOpts {
  id: string;
  print: Print;
  colours: ShirtColours;
  /** The face-à-face card: no mesh, no « OVR ». */
  compact: boolean;
  /** « OVR », or null where it is not drawn (a dash has none). */
  label: string | null;
}

/** The number layer's content, in jersey space (`JT`), including the clip of its glyphs. */
export function numberLayer(o: NumberOpts): string {
  const { id, print, colours } = o;
  const { fit, text, hit } = print;
  const nt = (cls: string, extra: string): string =>
    `<text x="${fit.x.toFixed(1)}" y="${fit.y.toFixed(1)}" class="mc-f-d mc-numtxt${cls ? ` ${cls}` : ""}" font-size="${fit.size.toFixed(1)}" text-anchor="middle" direction="ltr" ${extra}>${esc(text)}</text>`;
  const outline = mix(colours.primary, "#000000", 0.55);
  let s =
    `<defs><clipPath id="${id}-numclip">${nt("", "")}</clipPath></defs><g transform="${JT}">` +
    nt("", `fill="#000" opacity=".35" filter="url(#${id}-b5)" transform="translate(0 8)"`) +
    nt("mc-num-sh", `fill="#000" opacity=".38"`) +
    nt("mc-num-hi", `fill="#fff" opacity=".42"`) +
    `<g data-mc="ovr"><rect x="${hit.x0}" y="${hit.y0}" width="${hit.x1 - hit.x0}" height="${hit.y1 - hit.y0}" fill="transparent"/>` +
    nt(
      "",
      `fill="none" stroke="${outline}" stroke-opacity=".8" stroke-width="${2 * OUTLINE_HALF}" stroke-linejoin="round"`,
    ) +
    nt("", `fill="none" stroke="${colours.twill}" stroke-width="10" stroke-linejoin="round"`) +
    nt("", `fill="${colours.numberFill}"`) +
    (o.compact ? "" : nt("", `fill="url(#${id}-knit)" opacity=".3"`)) +
    nt("", `fill="url(#${id}-numlight)"`) +
    `</g>` +
    // the print follows the cloth: the chest crease and the body's falloff, clipped to the glyphs
    // (static, outside the group)
    `<g clip-path="url(#${id}-numclip)" opacity=".55"><g filter="url(#${id}-b4)">${centreCrease("#ffffff")}</g><rect x="292" y="300" width="416" height="606" fill="url(#${id}-volX)" opacity=".5"/></g>`;
  if (o.label) {
    const halo =
      colours.numberFill === "#FFFFFF"
        ? mix(colours.primary, "#000000", 0.55)
        : mix(colours.primary, "#ffffff", 0.45);
    s += `<text x="503.2" y="830" class="mc-f-b" font-weight="800" font-size="32" text-anchor="middle" fill="${colours.numberFill}" stroke="${halo}" stroke-width="6" stroke-linejoin="round" paint-order="stroke" letter-spacing=".2em" direction="ltr" data-ovrlabel="1">${esc(o.label)}</text>`;
  }
  return `${s}</g>`;
}

const EIGHT = [0, 45, 90, 135, 180, 225, 270, 315] as const;

/**
 * The number as the runs the share picture draws over its art (card units): an outline and a twill
 * ring made of eight offset copies, then the fill; and « OVR » with its halo. A canvas run has a
 * fill only, so the rings are stood up the way an embroidered outline is: copies pushed outward.
 */
export function numberSpecs(o: NumberOpts): TextSpec[] {
  const { print, colours } = o;
  const { fit, text } = print;
  const card = (x: number, y: number) => [x * JT_SCALE + JT_DX, y * JT_SCALE + JT_DY] as const;
  const [cx, cy] = card(fit.x, fit.y);
  const size = fit.size * JT_SCALE;
  const ring = (radius: number, fill: string, opacity?: number): TextSpec[] =>
    EIGHT.map((deg) => ({
      text,
      x: cx + radius * Math.cos((deg * Math.PI) / 180),
      y: cy + radius * Math.sin((deg * Math.PI) / 180),
      size,
      face: "d" as const,
      fill,
      ...(opacity !== undefined ? { fillOpacity: opacity } : {}),
      dir: "ltr" as const,
    }));
  const specs: TextSpec[] = [
    ...ring(OUTLINE_HALF * JT_SCALE, mix(colours.primary, "#000000", 0.55), 0.8),
    ...ring(5 * JT_SCALE, colours.twill),
    {
      text,
      x: cx,
      y: cy,
      size,
      face: "d",
      fill: colours.numberFill,
      dir: "ltr",
      data: { mc: "ovr" },
    },
  ];
  if (o.label) {
    const [lx, ly] = card(503.2, 830);
    const halo =
      colours.numberFill === "#FFFFFF"
        ? mix(colours.primary, "#000000", 0.55)
        : mix(colours.primary, "#ffffff", 0.45);
    const base = {
      text: o.label,
      size: 32 * JT_SCALE,
      face: "b" as const,
      weight: 800,
      dir: "ltr" as const,
      tracking: 0.2,
    };
    for (const deg of EIGHT) {
      specs.push({
        ...base,
        x: lx + 3 * JT_SCALE * Math.cos((deg * Math.PI) / 180),
        y: ly + 3 * JT_SCALE * Math.sin((deg * Math.PI) / 180),
        fill: halo,
      });
    }
    specs.push({ ...base, x: lx, y: ly, fill: colours.numberFill });
  }
  return specs;
}

/** For the tests: the painted ink box of a print, plus its outline, in jersey space. */
export function printInkBox(print: Print): { x0: number; x1: number; y0: number; y1: number } {
  const { fit } = print;
  const left = fit.x - (fit.ink.w / 2) * fit.size + fit.ink.x0 * fit.size;
  const right = fit.x - (fit.ink.w / 2) * fit.size + fit.ink.x1 * fit.size;
  return {
    x0: left - OUTLINE_HALF,
    x1: right + OUTLINE_HALF,
    y0: fit.y - fit.ink.a * fit.size - OUTLINE_HALF,
    y1: fit.y + fit.ink.d * fit.size + OUTLINE_HALF,
  };
}
