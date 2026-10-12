import { bell, bezierAt, bezierFrames, round } from "@/components/manager-card/motion/spring";

/**
 * Whether the card's own motion (the pointer tilt and the touch float, `tilt.ts`) may run. It is
 * off while the back shows, while the entrance plays and, so the two 3D motions never overlap,
 * while the card is turning over (the turn runs on the wrapper outside the tilt tree; a tilt that
 * woke up under it would warp the card). It comes back when the turn has ended.
 */
export function tiltAllowed(state: {
  back: boolean;
  turning: boolean;
  entering: boolean;
}): boolean {
  return !state.back && !state.turning && !state.entering;
}

/**
 * How long the card takes to turn over, in ms: an eased turn with a settle (`FLIP_CURVE`) that carries the card a little
 * past the half-turn's end and settles back, so it reads as a real card with weight. About half a
 * second is the feel of a card turned over by a thumb; the faces are readable well before it ends
 * (the spring has covered nine tenths of the turn at 40 % of the time). Kept here so the animation
 * and the timer that ends the 3D context share one number, and read without a style lookup (a
 * computed-style read inside the click forced a style recalculation of the whole page).
 */
export const FLIP_MS = 520;
/**
 * The turn's curve: it leaves slowly (the card has mass), swings fast through the edge-on point,
 * passes the end by about 5 % (9 degrees) and settles back. A spring from rest leaves at full
 * speed, which read as a snap; this is the same overshoot with the weight in front of it.
 */
export const FLIP_CURVE = [0.5, 0, 0.2, 1.22] as const;
/** Where the turn is at `time` of its duration, 0 to 1 (a little past 1 on the overshoot). */
export const flipProgress = (time: number): number => bezierAt(FLIP_CURVE, time);
/** How far the card lifts toward the reader mid-turn (translateZ, px, under a 1400 px perspective). */
export const FLIP_LIFT_PX = 90;
/** Half of the card's thickness, px: the faces stand this far from the middle, the edge layers fill it. */
export const FLIP_HALF_THICKNESS = 2.5;
/** The most the faces darken toward the edge, 0 to 1. */
export const FLIP_SHADE = 0.5;

/** The angle (deg, before the direction) and the lift (px) of the card at `p` of the spring, `time` of the turn. */
export function flipPose(
  from: number,
  to: number,
  p: number,
  time: number,
): { angle: number; lift: number } {
  return { angle: from + (to - from) * p, lift: FLIP_LIFT_PX * bell(time) };
}

/**
 * The turn's keyframes for the inner box: `translateZ(lift) rotateY(angle)`. The first frame is the
 * card where it was and the last is the rest state of the face it turns to (no lift).
 */
export function flipFrames(from: number, to: number, dir: 1 | -1): Keyframe[] {
  return bezierFrames(FLIP_CURVE, 32, (p, time) => {
    const { angle, lift } = flipPose(from, to, p, time);
    return {
      transform: `translateZ(${round(lift, 2)}px) rotateY(${round(angle * dir, 2)}deg)`,
    };
  });
}

/**
 * How dark a face is at an angle: 0 facing the reader, `FLIP_SHADE` edge-on. `face` is the angle at
 * which the face looks at the reader (0 front, 180 back).
 */
export function faceShade(angle: number, face: 0 | 180): number {
  const facing = Math.max(0, Math.cos(((angle - face) * Math.PI) / 180));
  return round((1 - facing) * FLIP_SHADE, 3);
}

/** A face's shade over the turn (opacity keyframes of a black layer over the face). */
export function shadeFrames(from: number, to: number, face: 0 | 180): Keyframe[] {
  return bezierFrames(FLIP_CURVE, 32, (p, time) => ({
    opacity: faceShade(flipPose(from, to, p, time).angle, face),
  }));
}

/** The ground shadow: it grows and darkens as the card lifts and shrinks back as it lands. */
export function turnGroundFrames(): Keyframe[] {
  return [
    { opacity: 0, transform: "scale(1, 1)", offset: 0 },
    { opacity: 0.85, transform: "scale(1.16, 1.7)", offset: 0.4 },
    { opacity: 0.55, transform: "scale(1.05, 1.15)", offset: 0.75 },
    { opacity: 0, transform: "scale(1, 1)", offset: 1 },
  ];
}

/** The light crosses the face that is turning in, a little after the half-turn. */
export const FLIP_GLINT_AT = 0.36;
export const FLIP_GLINT_MS = 420;
