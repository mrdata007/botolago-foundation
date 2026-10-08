/**
 * Beats: the scarf knits itself (plan 5.4, « Rang par rang »).
 *
 * A beat is a few rows of the scarf knitting in, done in CSS only (echarpe.css, "beats"); this file
 * is the timing table and the wrapper that gives a row its turn. How a row knits: `knit()` wraps the
 * row's SVG in <g class="mc-kr"> with two custom properties, --mc-d (delay) and --mc-t (duration).
 * The CSS reveals the row stitch by stitch from the reading side (right to left in Arabic): a
 * clip-path inset stepped in whole stitches, fast along the row and slower over the last stitches,
 * the way a knitter pulls a row tight. Rows are staggered by their index in knitting order.
 *
 * What never moves: the number (and its dash), the serial, the name's stitches and the patch. They
 * are drawn outside every animated group, so they are legible in the first painted frame. Nothing
 * runs under prefers-reduced-motion (the CSS holds the keyframes inside no-preference), and nothing
 * runs without a beat.
 */
import type { BeatName } from "../types";

/** [start ms, gap between rows ms, row duration ms] */
export type KnitTiming = readonly [start: number, gap: number, duration: number];

export const BEATS = {
  // birth: the cast-on rows from the foot, the tacking lines of the counted journées, the name band
  make: { cast: [0, 36, 170], tack: [110, 45, 190], band: [200, 26, 190] },
  // the last counted stripe, knitted in under a number that is already there
  first: { stripe: [80, 110, 300] },
  tick: { stripe: [30, 90, 240] },
  // the founder's five cream rows, from the foot
  founder: { cast: [60, 80, 100] },
  // the bound loops along the lower edge
  castoff: { loops: [60, 0, 320] },
} as const satisfies Partial<Record<BeatName, Record<string, KnitTiming>>>;

/** The whole length of each beat, in ms: the latest end of anything that moves in it. */
export const BEAT_MS: Readonly<Record<BeatName, number>> = {
  make: 700,
  tick: 360,
  first: 490,
  tier: 600,
  legend: 540,
  founder: 600,
  castoff: 380,
};

/** Birth is the one beat allowed 700 ms; every other beat stays within 600 ms. */
export const BEAT_CAP_MS = 700;

type KnitBeat = keyof typeof BEATS;
const isKnitBeat = (beat: string): beat is KnitBeat => beat in BEATS;

/** The timing of a part of a beat, or undefined when the beat has no such part. */
export function timingOf(beat: string, part: string): KnitTiming | undefined {
  if (!isKnitBeat(beat)) return undefined;
  return (BEATS[beat] as Readonly<Record<string, KnitTiming>>)[part];
}

/**
 * Wraps one row's SVG so it knits in at its turn; returns it unchanged when `beat` has no such
 * part. `i` is the row's index in knitting order (0 is knitted first); `gap` overrides the stagger
 * between rows. `coarse` knits in eight big steps instead of the knitter's two-phase pace.
 */
export function knit(
  beat: string,
  part: string,
  i: number,
  inner: string,
  gap?: number,
  coarse = false,
): string {
  const t = timingOf(beat, part);
  if (!t) return inner;
  const d = Math.round(t[0] + i * (gap != null ? gap : t[1]));
  return `<g class="mc-kr${coarse ? " mc-kr--s8" : ""}" style="--mc-d:${d}ms;--mc-t:${t[2]}ms">${inner}</g>`;
}
