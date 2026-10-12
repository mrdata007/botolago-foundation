import { bezierAt, bezierFrames, mix, round } from "../motion/spring";

/**
 * The tier-up ceremony's timeline (`TierCeremony.tsx`), in ms from the moment the card is drawn:
 *
 *   0     the page dims to a spotlight; the card flies in toward the reader, spinning once
 *   ~520  it lands (the spin's curve first reaches its end): the ground shadow thuds, the burst of
 *         light opens over the dim, the card's own beat plays, a band of light crosses it
 *   560   the tier badge stamps on the card's lower edge
 *   980   the card has settled (it passed its place by a little, pressed in, and came back)
 *   1240  the dim and the badge fade away
 *   1500  over; everything is gone and the card is the ordinary hero card
 *
 * Pure data and keyframe builders, so a test reads the numbers. Transform and opacity only, on
 * wrappers outside the card's SVG and its tilt tree.
 */
/** The dim comes first: the card does not appear until it is in (`LEAD_MS`). */
export const LEAD_MS = 150;
export const CEREMONY_MS = 1580;
export const SPIN_MS = 980;
/** The spin: leaves with a little weight, arrives fast, passes its end by about 9 % and comes back. */
export const SPIN_CURVE = [0.35, 0.05, 0.25, 1.45] as const;
/**
 * How far the card turns, degrees. It starts edge-on (270: its back is about to turn into view) and
 * lands on its front (0), so nothing of it shows before it turns in and the first thing seen is a face
 * in motion.
 */
export const SPIN_DEGREES = 270;
/** The turn's exponent: an ease-out that does most of its turning early, so it is quick through the edge-on points and slows only over the last stretch. */
export const SPIN_EASE = 2.2;
export const BURST_RUN_MS = 800;
export const STAMP_MS = 260;
export const STAMP_GAP_MS = 40;
export const FADE_AT_MS = 1200;
export const DIM_IN_MS = LEAD_MS;
/** The darkest the page gets (a share of black over it, around the spotlight). */
export const DIM_PEAK = 0.78;

/** When the spin first reaches its end: the card has landed. */
export function impactMs(): number {
  let lo = 0;
  let hi = 1;
  for (let i = 0; i < 24; i += 1) {
    const mid = (lo + hi) / 2;
    if (bezierAt(SPIN_CURVE, mid) < 1) lo = mid;
    else hi = mid;
  }
  return Math.round(hi * SPIN_MS);
}
export const IMPACT_MS = impactMs();
/** From the ceremony's start (the card's own start is `LEAD_MS` in). */
export const IMPACT_AT_MS = LEAD_MS + IMPACT_MS;
export const STAMP_AT_MS = IMPACT_AT_MS + STAMP_GAP_MS;

/** The turn's progress (0 to 1) at `time` of the spin: an ease-out that has finished by the impact. */
export const turnProgress = (time: number): number => {
  const u = Math.min(1, (time * SPIN_MS) / IMPACT_MS);
  return 1 - (1 - u) ** SPIN_EASE;
};

/**
 * The card's keyframes (the spin wrapper): it drops in from above and toward the reader, turns once
 * and lands. The turn is clamped at its end (a card that turned a little past flat and back would
 * look loose; and it has no opacity, see `fadeInFrames`); the drop and the depth overshoot, which is the impact: the card is pressed a little
 * into the table (smaller than rest, lower) and comes back up.
 */
export function spinFrames(dir: 1 | -1): Keyframe[] {
  return bezierFrames(SPIN_CURVE, 60, (p, time) => ({
    transform: `translateY(${round(mix(-64, 0, p), 2)}px) translateZ(${round(mix(300, 0, p), 2)}px) rotateY(${round(SPIN_DEGREES * (1 - turnProgress(time)) * dir, 2)}deg) scale(${round(mix(1.1, 1, p), 4)})`,
  }));
}

/**
 * The card is hidden until the dim is in (`LEAD_MS`): a hold of `visibility`, which switches at once
 * and has no ghost of a half-faded card. (Not an opacity animation, which on the spinner flattens its
 * 3D context, and which on anything shows the oversized card dimly before it spins.)
 */
export function holdFrames(): Keyframe[] {
  return [
    { visibility: "hidden", offset: 0 },
    { visibility: "hidden", offset: 1 },
  ];
}

/** The shadow on the ground: a thud at the impact, a wide dark flash that shrinks back and is gone. */
export function thudFrames(): Keyframe[] {
  const at = IMPACT_MS / SPIN_MS;
  return [
    { opacity: 0, transform: "scale(0.5, 0.5)", offset: 0 },
    { opacity: 0.55, transform: "scale(0.9, 0.9)", offset: round(at * 0.8, 3) },
    { opacity: 1, transform: "scale(1.28, 1.9)", offset: round(at, 3) },
    { opacity: 0.55, transform: "scale(1.08, 1.25)", offset: round(at + (1 - at) * 0.5, 3) },
    { opacity: 0, transform: "scale(1, 1)", offset: 1 },
  ];
}

/** The page's dim: in over `DIM_IN_MS`, held, out from `FADE_AT_MS` to the end. */
export function dimFrames(): Keyframe[] {
  return [
    { opacity: 0, offset: 0 },
    { opacity: 1, offset: round(DIM_IN_MS / CEREMONY_MS, 4) },
    { opacity: 1, offset: round(FADE_AT_MS / CEREMONY_MS, 4) },
    { opacity: 0, offset: 1 },
  ];
}

/** The badge's stamp: big and tilted, slammed down past its size, then home; at rest it sits a hair off true. */
export function stampFrames(dir: 1 | -1): Keyframe[] {
  const at = (scale: number, tilt: number) => `scale(${scale}) rotate(${round(tilt * dir, 2)}deg)`;
  return [
    // solid from its first frames (a half-faded oversized badge reads as a ghost)
    { opacity: 0, transform: at(2.2, -12), offset: 0 },
    { opacity: 1, transform: at(1.9, -10), offset: 0.1 },
    { opacity: 1, transform: at(0.92, 2), offset: 0.55 },
    { opacity: 1, transform: at(1.06, -4), offset: 0.78 },
    { opacity: 1, transform: at(1, -3), offset: 1 },
  ];
}

/** The badge's fade at the end (its own animation, after the stamp). */
export function stampOutFrames(): Keyframe[] {
  return [
    { opacity: 1, offset: 0 },
    { opacity: 0, offset: 1 },
  ];
}
