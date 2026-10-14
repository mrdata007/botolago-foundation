/**
 * The shield's shapes, in the card's own units: 100 wide and 136.6 tall (`ASPECT`). Pure numbers
 * and strings; nothing here reads the DOM.
 *
 * The silhouette: a crown tip with a small notch each side of it, the shoulders falling to a small
 * ear step at each top corner, vertical sides down to 87 % of the height, then a rounded bottom
 * that closes to a shallow point. Our own drawing (no third party's card outline).
 */
import { ASPECT } from "./estimate";

export const W = 100;
export const H = 136.6;
export { ASPECT };

/** The outline, closed. Symmetric about x = 50, so a right-to-left card needs no mirrored copy. */
export const SHIELD =
  "M50 0 L50.5 0.7 C52.4 3.2 54.6 4.9 57.6 5.5 L62.6 2.2 Q69.2 2.6 75.7 5.8 L91.8 14.1 L94.2 15 " +
  "L98.1 16 L100 16.9 V118.5 C99.6 123.5 97 125.8 91.1 127.6 C86 129 76 129.9 70.4 130.4 " +
  "L63.7 131.7 L54.8 134.5 L50 136.6 L45.2 134.5 L36.3 131.7 L29.6 130.4 C24 129.9 14 129 8.9 127.6 " +
  "C3 125.8 0.4 123.5 0 118.5 V16.9 L1.9 16 L5.8 15 L8.2 14.1 L24.3 5.8 Q30.8 2.6 37.4 2.2 " +
  "L42.4 5.5 C45.4 4.9 47.6 3.2 49.5 0.7 Z";

/** The transform that shrinks the outline about the card's centre (the frame's inner lines). */
export const inset = (sx: number, sy: number): string =>
  `translate(50 ${H / 2}) scale(${sx} ${sy}) translate(-50 ${-H / 2})`;

/** The face sits inside the frame: the outline at this scale (the same as `shield.css`'s mask). */
export const FACE_SCALE = [0.958, 0.97] as const;
/** The chrome edition's thick bezel: the face is cut smaller (`shield.css` has the same mask). */
export const FACE_SCALE_THICK = [0.944, 0.962] as const;

/* ---------------------------------------------------------------------------------------------
   The outline as points: a CSS polygon for faces drawn in DOM (the back, the turn's edge)
   --------------------------------------------------------------------------------------------- */

type Pt = readonly [number, number];

/** The outline's path as points: straight segments as they are, curves split into `steps`. */
export function flattenPath(d: string, steps = 6): Pt[] {
  const tokens = d.match(/[MLCQVZ]|-?\d*\.?\d+/g) ?? [];
  const pts: Pt[] = [];
  let i = 0;
  let cur: Pt = [0, 0];
  let cmd = "";
  const num = () => Number(tokens[i++]);
  while (i < tokens.length) {
    if (/[MLCQVZ]/.test(tokens[i]!)) cmd = tokens[i++]!;
    if (cmd === "Z") break;
    if (cmd === "M" || cmd === "L") {
      cur = [num(), num()];
      pts.push(cur);
    } else if (cmd === "V") {
      cur = [cur[0], num()];
      pts.push(cur);
    } else if (cmd === "C") {
      const c1: Pt = [num(), num()];
      const c2: Pt = [num(), num()];
      const end: Pt = [num(), num()];
      const p0 = cur;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        pts.push([
          u * u * u * p0[0] + 3 * u * u * t * c1[0] + 3 * u * t * t * c2[0] + t * t * t * end[0],
          u * u * u * p0[1] + 3 * u * u * t * c1[1] + 3 * u * t * t * c2[1] + t * t * t * end[1],
        ]);
      }
      cur = end;
    } else if (cmd === "Q") {
      const c: Pt = [num(), num()];
      const end: Pt = [num(), num()];
      const p0 = cur;
      for (let s = 1; s <= steps; s++) {
        const t = s / steps;
        const u = 1 - t;
        pts.push([
          u * u * p0[0] + 2 * u * t * c[0] + t * t * end[0],
          u * u * p0[1] + 2 * u * t * c[1] + t * t * end[1],
        ]);
      }
      cur = end;
    } else {
      i++;
    }
  }
  return pts;
}

const pct = (v: number): string => `${Number(v.toFixed(2))}%`;

/** The silhouette as a CSS `polygon()` in percentages of the card's box (the same in either direction). */
export const OUTLINE_POLYGON = `polygon(${flattenPath(SHIELD)
  .map(([x, y]) => `${pct((x / W) * 100)} ${pct((y / H) * 100)}`)
  .join(", ")})`;

/* ---------------------------------------------------------------------------------------------
   The emblem that hangs off the side: a diamond, and a glyph per material (40 x 40 box)
   --------------------------------------------------------------------------------------------- */

export const EMBLEM_DIAMOND = "M20 2 L38 20 L20 38 L2 20Z";

/** One glyph per step of the ladder, our own drawings. */
export const EMBLEM_GLYPH = {
  // no tier yet: an empty ring
  base: '<circle cx="20" cy="20" r="5.6" fill="none" stroke-width="2.6" class="mc-shield__glyph-line"/>',
  // LASTREET: a dot
  homa: '<circle cx="20" cy="20" r="6.2"/>',
  // STADE: a stadium's arch
  stade: '<path d="M11 26 V20 Q20 9 29 20 V26 H25.4 V21.4 Q20 14.6 14.6 21.4 V26Z"/>',
  // PRO: two chevrons
  pro: '<path d="M12 20.5 L20 13 L28 20.5 L28 25 L20 17.5 L12 25Z"/><path d="M14.5 28.5 L20 23.4 L25.5 28.5 L25.5 31 L20 26.2 L14.5 31Z" opacity=".75"/>',
  // CHAMPION: a four-point spark
  champion: '<path d="M20 9 L23.2 16.8 L31 20 L23.2 23.2 L20 31 L16.8 23.2 L9 20 L16.8 16.8Z"/>',
  // LEGEND: a crown
  legend: '<path d="M11.5 26 L13.5 14 L17.5 19 L20 11.5 L22.5 19 L26.5 14 L28.5 26Z"/>',
} as const;

/** The pen's swash under the autograph (200 x 24 box): one long stroke and a thinner echo. */
export const SWASH_MAIN = "M4 17 C 40 6, 90 4, 130 9 S 186 19, 196 6";
export const SWASH_ECHO = "M60 20 C 100 14, 140 13, 170 16";
