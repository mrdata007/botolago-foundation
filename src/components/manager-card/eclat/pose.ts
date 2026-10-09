/**
 * The card's pose under a light (plan 8.2 and 8.3), as numbers and transform strings. Pure: the
 * tilt (`tilt.ts`) writes what this file computes, and nothing else decides where a part sits while
 * the card moves.
 *
 * The light is the pair (ax, ay), each from -1 to 1 across the card (x to the right, y upward). The
 * card turns by `ROT_Y` degrees about the vertical axis for ax and `ROT_X` about the horizontal axis
 * for ay, lifts each layer to its height (`Z`) and shrinks it by the same height so the layers still
 * line up face-on, and slides the parts that follow the light (the shadow, the jersey's cast
 * shadow, the number's shade and highlight, the foil, the specular streak) by `FOLLOW` units.
 *
 * Only transforms are written. Nothing here is a custom property that a descendant inherits: an
 * inherited property changed on the card's root restyles and repaints every SVG element under it,
 * which is what kept the first tilt at 20 to 30 frames a second.
 */

/** The light: x to the right, y upward, each from -1 to 1. */
export type Light = readonly [ax: number, ay: number];

/** Degrees the card turns about the horizontal axis for ay = 1 and the vertical axis for ax = 1. */
export const ROT_X = 7;
export const ROT_Y = 9;
/** The perspective, in card widths (`.mc-eclat__persp`), and so the divisor of the shrink. */
export const PERSPECTIVE = 300;

/** The rest light, where the travelling parts sit when nothing moves them (Arabic mirrors it). */
export const REST_AX = 0.24;
export const REST_AY = 0.64;
export const restLight = (rtl: boolean): Light => [rtl ? -REST_AX : REST_AX, REST_AY];

/** Heights of the layers above the base, in card widths ÷ 100 (`cqw`). */
export const Z = { base: 0, shirt: 3, num: 5, frame: 8, holo: 9, foil: 9.5 } as const;
export type LayerName = keyof typeof Z;
export const LAYERS = Object.keys(Z) as LayerName[];

/**
 * The rims (the card's thickness) are seven walls at heights 1 to 7 in one flat group, which stands
 * at `RIM_PLANE`: the group is the one 3D leaf, and each wall is moved in its own plane by the
 * parallax its height difference would give (`parallax`). A wall of a seven-leaf stack costs the
 * compositor a full-card pass each; a flat group costs one. The group stands between the base (0)
 * and the shirt (3), because the jersey's cast shadow rides in it and must stay behind the shirt:
 * the walls only show round the outline, where nothing of the shirt is, so their height against the
 * shirt's is never seen.
 */
export const RIM_PLANE = 2;
export const RIM_STEP = 0.12;
/** Where the jersey's cast shadow stands (the base's height), so it takes the same parallax. */
export const CAST_Z = Z.base;

/** How far each part follows the light, in SVG units (1000 across the card) per unit of light. */
export const FOLLOW = {
  cast: { x: -14, y: 10 },
  hi: { x: 4, y: -4, y0: -2 },
  sh: { x: -6, y: 6, y0: 5 },
  foil: { x: 50, y: -30 },
  spec: { x: 160, y: -100 },
  light: { x: 260, y: -220 },
} as const;
/** The contact shadow follows the light, in card widths ÷ 100, the opposite way. */
export const SHADOW = { x: -5, y: 3, y0: 3 } as const;

/** A number for a style string: three decimals at most, no trailing zeros, never "-0". */
export const num = (v: number): string => {
  const r = Math.round(v * 1000) / 1000;
  return String(Object.is(r, -0) ? 0 : r);
};
const rad = (deg: number): number => (deg * Math.PI) / 180;

/** The card's turn toward the light, at depth factor `t` (1 while a pointer is over it, 0 at rest). */
export const tilt = ([ax, ay]: Light, t = 1): string =>
  `rotateX(${num(ay * ROT_X * t)}deg) rotateY(${num(ax * ROT_Y * t)}deg)`;

/** A layer at height `z`: lifted by it and shrunk by it, so it lines up with the others face-on. */
export const depth = (z: number, t = 1): string =>
  `translateZ(${num(z * t)}cqw) scale(${num(1 - (z * t) / PERSPECTIVE)})`;

/** The contact shadow's offset: it lies opposite the light and moves with it. */
export const shadow = ([ax, ay]: Light): string =>
  `translate(${num(ax * SHADOW.x)}cqw, ${num(SHADOW.y0 + ay * SHADOW.y)}cqw)`;

/**
 * Where a point `dz` card-widths-over-100 above a layer's plane appears, relative to that plane,
 * when the card is turned toward the light: the card's own rotation applied to (0, 0, dz). A part
 * that sits at another height than the group it is drawn in takes this offset, so it still moves
 * against the group the way it would at its own height.
 */
export function parallax(dz: number, [ax, ay]: Light): readonly [x: number, y: number] {
  const b = rad(ax * ROT_Y);
  const a = rad(ay * ROT_X);
  return [dz * Math.sin(b), -dz * Math.cos(b) * Math.sin(a)];
}
export const shift = ([x, y]: readonly [number, number]): string =>
  `translate(${num(x)}cqw, ${num(y)}cqw)`;

/** Rim `k` (1 at the back to 7) in its group: the parallax of its height over the group's. */
export const rim = (k: number, light: Light): string => shift(parallax(k - RIM_PLANE, light));
/** The rim's two-dimensional step at rest (the card's thickness): `o` = 8 - k, away from the light. */
export const rimRest = (k: number, rtl: boolean): string =>
  `translate(${num((8 - k) * RIM_STEP * (rtl ? -1 : 1))}cqw, ${num((8 - k) * RIM_STEP)}cqw)`;

/**
 * The jersey's cast shadow, hoisted into its own layer, as that layer's offset from where its own
 * stylesheet rule puts the shadow at rest: the light's travel since the rest light, plus the
 * parallax of the shadow's height (the base's) against the group the layer is drawn in. Screen
 * space, the same in both languages: x runs opposite the light inside the Arabic group's mirror
 * too. With the card flat there is no parallax and no travel, so the offset is nothing.
 */
export function castDelta(light: Light, rest: Light): string {
  const f = FOLLOW.cast;
  // SVG units of the card (1000 across) are ten to the cqw
  const dx = (f.x * (light[0] - rest[0])) / 10;
  const dy = (f.y * (light[1] - rest[1])) / 10;
  const [px, py] = parallax(CAST_Z - RIM_PLANE, light);
  return shift([dx + px, dy + py]);
}

/**
 * A part that follows the light inside an SVG layer, in that layer's own units: what the
 * stylesheet's rule for the part computes at the rest light, at any light. The jersey's cast shadow
 * runs opposite the light, the number's shade and highlight are not mirrored with the group, and
 * the foil, the streak and the pool of light are (`rtl` flips their x, as the group's mirror does).
 */
export function follow(
  part: "hi" | "sh" | "foil" | "spec" | "light" | "cast",
  [ax, ay]: Light,
  rtl: boolean,
): string {
  const f = FOLLOW[part];
  const y0 = "y0" in f ? f.y0 : 0;
  const mirror = part === "hi" || part === "sh" ? 1 : rtl ? -1 : 1;
  return `translate(${num(ax * f.x * mirror)}px, ${num(ay * f.y + y0)}px)`;
}

/** The two travelling glints' opacity: the first brightens as the light moves right, the second left. */
export const glintA = ([ax]: Light): number => 0.2 + (ax + 1) * 0.4;
export const glintB = ([ax]: Light): number => 0.2 + (1 - ax) * 0.4;
