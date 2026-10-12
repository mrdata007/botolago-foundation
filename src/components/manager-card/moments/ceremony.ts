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
export const CEREMONY_MS = 1500;
export const SPIN_MS = 980;
/** The spin: leaves with a little weight, arrives fast, passes its end by about 9 % and comes back. */
export const SPIN_CURVE = [0.35, 0.05, 0.25, 1.45] as const;
/** How far the card turns, degrees: one full turn, so it lands on its front. */
export const SPIN_DEGREES = 360;
export const BURST_RUN_MS = 800;
export const STAMP_MS = 300;
export const STAMP_GAP_MS = 40;
export const FADE_AT_MS = 1240;
export const DIM_IN_MS = 220;
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
export const STAMP_AT_MS = IMPACT_MS + STAMP_GAP_MS;

/**
 * The card's keyframes (the spin wrapper): it drops in from above and toward the reader, turns once
 * and lands. The turn is clamped at its end (a card that turned a little past flat and back would
 * look loose; and it has no opacity, see `fadeInFrames`); the drop and the depth overshoot, which is the impact: the card is pressed a little
 * into the table (smaller than rest, lower) and comes back up.
 */
export function spinFrames(dir: 1 | -1): Keyframe[] {
  return bezierFrames(SPIN_CURVE, 40, (p) => ({
    transform: `translateY(${round(mix(-64, 0, p), 2)}px) translateZ(${round(mix(300, 0, p), 2)}px) rotateY(${round(SPIN_DEGREES * (1 - Math.min(p, 1)) * dir, 2)}deg) scale(${round(mix(1.1, 1, p), 4)})`,
  }));
}

/**
 * The card's fade-in, on the perspective wrapper and not on the spinner: an opacity animation on the
 * spinner flattens its 3D context (the card's far side would show through, mirrored).
 */
export function fadeInFrames(): Keyframe[] {
  return [
    { opacity: 0, offset: 0 },
    { opacity: 1, offset: 1 },
  ];
}
export const FADE_IN_MS = 70;

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
    { opacity: 0, transform: at(2.7, -14), offset: 0 },
    { opacity: 1, transform: at(0.9, 2), offset: 0.5 },
    { opacity: 1, transform: at(1.07, -4), offset: 0.75 },
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
