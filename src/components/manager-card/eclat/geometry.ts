/**
 * Every coordinate of the card (plan 3, 5.1, 5.2, 7), as named constants and the few helpers that
 * build paths from them. Pure numbers and strings: no markup is assembled here.
 *
 * Units. Each layer is an SVG with `viewBox="0 0 1000 1618"`; one unit is a thousandth of the
 * card's width. Shapes are drawn left to right and mirrored as a group in Arabic (`mirror`); a text
 * is never mirrored by a transform, its x is mirrored instead (`mx`). The shirt and the number are
 * drawn in their own "jersey space" and put on the card by `JT`.
 */
import { ASPECT } from "./estimate";

export { ASPECT };

export const VB_W = 1000;
export const VB_H = 1618;
export const VIEW_BOX = `0 0 ${VB_W} ${VB_H}`;

/** `x` as the card draws it: mirrored about the vertical axis in Arabic. */
export const mx = (x: number, ar: boolean): number => (ar ? VB_W - x : x);

/** The shapes of a layer, mirrored as a group in Arabic. Text never goes through this. */
export const mirror = (shapes: string, ar: boolean): string =>
  ar ? `<g transform="matrix(-1 0 0 1 ${VB_W} 0)">${shapes}</g>` : shapes;

/** A number for markup: at most two decimals, no trailing zeros, no "-0". */
export const n2 = (value: number): string => {
  const rounded = Math.round(value * 100) / 100;
  return String(Object.is(rounded, -0) ? 0 : rounded);
};

/* ---------------------------------------------------------------------------------------------
   The outline, the shield window, the tab (plan 3.1, 3.2)
   --------------------------------------------------------------------------------------------- */

/** The asymmetric silhouette: a raised tab at the top-leading corner, a cut bottom-trailing corner. */
export const OUTLINE =
  "M0 40Q0 0 40 0L206 0L216 10L972 10Q1000 10 1000 38L1000 1418L800 1618L28 1618Q0 1618 0 1590Z";
/** The art window: a heater shield, flat top, straight sides to y 830, two curves to a point. */
export const WINDOW =
  "M62 46Q62 22 86 22H914Q938 22 938 46V830C938 935 600 985 500 1056C400 985 62 935 62 830Z";
/** LEGEND's second foil hairline: the shield 16 units inside `WINDOW`. */
export const WINDOW_IN =
  "M78 62Q78 38 102 38H898Q922 38 922 62V830C922 925 595 970 500 1036C405 970 78 925 78 830Z";
/** The shield's point. */
export const POINT_Y = 1056;
/**
 * The theme edge's stroke (the outer line of the frame, in the tier's edge colour against the page),
 * in card units. It is centred on `OUTLINE`, which touches the layer's box, so the half outside is
 * clipped and what shows is half of it: 5 units, 1.5 px on a 296 px card and 1.7 px on 336. The
 * first version was 3 units (0.4 px): at rest it held 3:1, but the tilt resamples the layer and a
 * line under one device pixel wide lost its contrast (round 2 review: 1.5 to 2.9 against the page
 * with the pointer on the card). The holo layer leaves the same band clear of foil (`holo.ts`), which
 * had washed the line out on CHAMPION and LEGEND.
 */
export const EDGE_W = 10;
/** The frame: the outline with the shield cut out (`fill-rule="evenodd"`). */
export const RING = OUTLINE + WINDOW;
/** The raised tab that carries the club disc and the season. */
export const TAB = "M0 40Q0 0 40 0L206 0L206 280Q206 302 184 302L0 302Z";
/**
 * The foil overlay's clip: the outline in % with the tab cut out (the tab is 206 × 302 of 1000 ×
 * 1618, so 20.6% × 18.7%): no foil, sheen or diffraction crosses the club disc or the season. The
 * stylesheet holds the same polygon (and its Arabic mirror), and `holo.test.ts` compares the two.
 */
export const FOIL_CLIP =
  "20.6% 0.6%, 100% 0.6%, 100% 87.6%, 80% 100%, 0 100%, 0 18.7%, 20.6% 18.7%";

/* ---------------------------------------------------------------------------------------------
   The shirt, in jersey space (plan 5.1): flat-lay front view
   --------------------------------------------------------------------------------------------- */

/** High point of the shoulder y 300, hem apex y 899.8, pit-to-pit 416, span across the sleeves 620. */
export const SHIRT =
  "M422 300L318 330L190 418L226 552L292 492C294 580 304 640 304 700C304 770 300 830 300 878Q300 889 311 890.6Q500 909 689 890.6Q700 889 700 878C700 830 696 770 696 700C696 640 706 580 708 492L774 552L810 418L682 330L578 300Q500 316 422 300Z";
export const SLEEVE_L = "M318 330L190 418L226 552L292 492C298 440 308 380 318 330Z";
export const SLEEVE_R = "M682 330L810 418L774 552L708 492C702 440 692 380 682 330Z";
/** The inside of the back, seen through the V. */
export const NECK_IN = "M422 300Q500 316 578 300L500 384Z";
export const HEM =
  "M300 866Q500 888 700 866L700 878Q700 889 689 890.6Q500 909 311 890.6Q300 889 300 878Z";
export const CUFF_L = "M190 418L226 552L244 539L208 405Z";
export const CUFF_R = "M810 418L774 552L756 539L792 405Z";
/** The V of the collar. */
export const COLLAR_V = "M422 300L500 384L578 300";

/** The chest box (jersey space): the number, outlines included, must lie inside it. */
export const CHEST = { x0: 336, x1: 664, y0: 476, y1: 796, cy: 636 } as const;
/** The dash's box. */
export const DASH_FIT = { x0: 380, x1: 620, y0: 560, y1: 640, cy: 600 } as const;
/** The dash's hit box. */
export const DASH_HIT = { x0: 380, x1: 620, y0: 556, y1: 644 } as const;
/** Half the number's outer outline (stroke 20). */
export const OUTLINE_HALF = 10;

/** Jersey space to card space: x' = 1.12 x − 60, y' = 1.12 y − 86 (symmetric about x 500). */
export const JT = "matrix(1.12 0 0 1.12 -60 -86)";
export const JT_SCALE = 1.12;
export const JT_DX = -60;
export const JT_DY = -86;

/* ---------------------------------------------------------------------------------------------
   The plate's text block (plan 3.3)
   --------------------------------------------------------------------------------------------- */

/** The rule between the name and the stats. */
export const RULE_Y = 1404;
/** Stat centres (pitch 165.3, centred on x 500) and the dividers between them. */
export const STAT_X = [252, 417, 583, 748] as const;
export const STAT_DIV = [335, 500, 665] as const;
/** The width every name line is fitted to (x 105–895). */
export const NAME_BUDGET = 790;
/** The width an Arabic stat label is fitted to. */
export const LABEL_BUDGET = 165;

/** The tab's disc and the placeholder's hexagon. */
export const DISC = { cx: 103, cy: 134 } as const;

/* ---------------------------------------------------------------------------------------------
   Tokens and minis (plan 7)
   --------------------------------------------------------------------------------------------- */

/** Short raised sleeves so the span stays inside the silhouette when the shirt is enlarged. */
export const SHIRT_TOKEN =
  "M424 300L352 318L276 372L298 452L324 438C320 600 318 760 316 888Q500 906 684 888C682 760 680 600 676 438L702 452L724 372L648 318L576 300Q500 316 424 300Z";
export const NECK_TOKEN = "M424 300Q500 316 576 300L500 384Z";
/** A taller shield, its point at 1490 (80 px). */
export const TOKEN_WINDOW =
  "M62 46Q62 22 86 22H914Q938 22 938 46V1150C938 1270 600 1410 500 1490C400 1410 62 1270 62 1150Z";
/** The plaque, without its word. */
export const TIER_BAR = "M320 1540L346 1506H654L680 1540L654 1574H346Z";
/** The number's box on the body of a jersey-composition token. */
export const TOKEN_BODY = { x0: 322, x1: 678, y0: 440, y1: 840, cy: 640 } as const;

/* ---------------------------------------------------------------------------------------------
   Honeycomb and small shapes (plan 5.3)
   --------------------------------------------------------------------------------------------- */

/** The honeycomb's tile: flat-top hexagons of radius 30, five per tile. */
export const HEX_W = 90;
export const HEX_H = 51.96;
export const HEX_R = 30;

/** A hexagon (flat top) as a closed path, two decimals. */
export function hexPath(cx: number, cy: number, r: number): string {
  let d = "";
  for (let k = 0; k < 6; k++) {
    const a = (Math.PI / 3) * k;
    d += `${k ? "L" : "M"}${(cx + r * Math.cos(a)).toFixed(2)} ${(cy + r * Math.sin(a)).toFixed(2)}`;
  }
  return `${d}Z`;
}

const HEX_CENTRES: readonly (readonly [number, number])[] = [
  [0, 0],
  [90, 0],
  [0, 51.96],
  [90, 51.96],
  [45, 25.98],
];
/** The five hexagons of one honeycomb tile at radius `r`. */
export const hexTile = (r: number): string =>
  HEX_CENTRES.map(([x, y]) => hexPath(x, y, r)).join("");

/** A four-point star (a glint, the founder's mark). */
export const star = (x: number, y: number, s: number): string =>
  `M${x} ${y - s}Q${x} ${y} ${x + s} ${y}Q${x} ${y} ${x} ${y + s}Q${x} ${y} ${x - s} ${y}Q${x} ${y} ${x} ${y - s}Z`;

/** The rest light: where the travelling parts sit when nothing moves the pointer (plan 8.2). */
export const REST_AX = 0.24;
export const REST_AY = 0.64;
