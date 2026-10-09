/**
 * The layer stack (plan 3.2 and 8.1): five SVG layers of one box, plus seven rim walls, in the
 * order the card is built from the back: the base (plate, field), the rims (the card's thickness in
 * the tier's metal, darkest at the back), the shirt, the number, the frame, the holo layer
 * (CHAMPION and LEGEND), and an HTML foil overlay for the sheen. At rest the stack is flat 2D; the
 * stylesheet turns it into real depth while a pointer moves (`eclat.css`, "3D").
 */
import type { CardTheme } from "../types";
import { mix } from "./foil";
import { RING, VIEW_BOX, mirror } from "./geometry";
import type { View } from "./view";
import type { BeatName } from "../types";

/** The layers' SVG content, drawn left to right (the layer builders mirror their own shapes). */
export interface Parts {
  /** The one `<defs>` of the card (gradients, patterns, masks, filters, clip paths). */
  defs: string;
  base: string;
  shirt: string;
  num: string;
  frame: string;
  /** "" for a tier with no foil. */
  holo: string;
}

const svg = (layer: string, body: string): string =>
  `<svg class="mc-l mc-l--${layer}" viewBox="${VIEW_BOX}" aria-hidden="true" focusable="false" style="direction:ltr">${body}</svg>`;

/** The seven walls of the card's thickness (k 1 at the back, the darkest; k 7 next to the face). */
export function rims(v: View): string {
  let out = "";
  for (let k = 1; k <= 7; k++) {
    const fill = mix(v.F.metal[3], "#000000", 0.35 + (7 - k) * 0.06);
    out += `<svg class="mc-l mc-rim" style="--k:${k};--o:${8 - k}" viewBox="${VIEW_BOX}" aria-hidden="true" focusable="false">${mirror(`<path d="${RING}" fill-rule="evenodd" fill="${fill}"/>`, v.ar)}</svg>`;
  }
  return out;
}

export interface RootOptions {
  theme: CardTheme;
  beat: BeatName | "";
  compact: boolean;
  /** The escaped aria-label. */
  label: string;
  /** Extra data attributes for the root (already escaped). */
  extra?: string;
}

/** The root element and the stack inside it. */
export function stack(v: View, parts: Parts, o: RootOptions): string {
  const { F, tierKey, ar } = v;
  const cls = [
    "mc-eclat",
    `mc-eclat--${tierKey}`,
    `mc-eclat--${o.theme}`,
    F.holo ? "mc-holo" : "",
    o.beat ? `mc-eclat--beat-${o.beat}` : "",
    o.compact ? "mc-eclat--compact" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const vars = `--mc-sheen:${F.sheen};--mc-holo:${F.holo ? F.holo.css : 0}`;
  return (
    `<div class="${cls}" role="img" aria-label="${o.label}" dir="${ar ? "rtl" : "ltr"}" style="${vars}"${o.extra ?? ""}>` +
    `<div class="mc-eclat__shadow" aria-hidden="true"></div>` +
    `<div class="mc-eclat__persp"><div class="mc-eclat__tilt">` +
    svg("base", parts.defs + parts.base) +
    rims(v) +
    svg("shirt", parts.shirt) +
    svg("num", parts.num) +
    svg("frame", parts.frame) +
    (parts.holo ? svg("holo", parts.holo) : "") +
    `<div class="mc-eclat__foil" aria-hidden="true"></div>` +
    `</div></div></div>`
  );
}

/**
 * The layers flattened into one SVG body, at the rest pose: for the founder's detail and the share
 * art. The builders are called with `flat` for it, so the travelling parts carry their rest
 * transforms and need no stylesheet.
 */
export const flatten = (parts: Parts): string =>
  parts.defs + parts.base + parts.shirt + parts.num + parts.frame + parts.holo;
