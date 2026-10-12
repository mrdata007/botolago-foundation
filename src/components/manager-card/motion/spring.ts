/**
 * Springs for the card's motion, as data the compositor can play.
 *
 * A damped spring is sampled into Web Animations keyframes (or a CSS `linear()` easing), so the
 * motion has a real overshoot and settle and still runs on the compositor: transform and opacity,
 * no per-frame script. Pure functions, no DOM, so a test reads the curve.
 *
 * The unit step response of an under-damped spring (from 0 to 1, starting at rest):
 *
 *   x(t) = 1 - e^(-zeta w t) (cos(wd t) + (zeta w / wd) sin(wd t)),   wd = w sqrt(1 - zeta^2)
 *
 * `w` is chosen so the envelope e^(-zeta w t) has fallen under `SETTLED` at `durationMs`: the
 * spring has settled by then, whatever its damping, and the last sample is exactly 1.
 */

/** The envelope the spring has to fall under by the end of its duration. */
const SETTLED = 0.003;

/** The spring's position at `t` (0 to 1 of its duration), 0 at the start and 1 at the end. */
export function springAt(t: number, zeta: number): number {
  if (t <= 0) return 0;
  if (t >= 1) return 1;
  const z = Math.min(Math.max(zeta, 0.05), 1.5);
  if (z >= 1) {
    // critically damped or over-damped: no overshoot; a smooth approach that has settled at 1
    const critical = 8.4; // e^-8.4 (1 + 8.4) is under SETTLED
    const e = Math.exp(-critical * t);
    return 1 - e * (1 + critical * t);
  }
  const w = -Math.log(SETTLED) / z; // per unit of the duration
  const wd = w * Math.sqrt(1 - z * z);
  const e = Math.exp(-z * w * t);
  return 1 - e * (Math.cos(wd * t) + ((z * w) / wd) * Math.sin(wd * t));
}

/** The highest value the spring reaches (its overshoot, as a fraction past 1). */
export function springOvershoot(zeta: number, samples = 400): number {
  let top = 0;
  for (let i = 0; i <= samples; i += 1) top = Math.max(top, springAt(i / samples, zeta));
  return Math.max(0, top - 1);
}

/** Round to a few decimals so a keyframe string stays short. */
const r = (v: number, digits = 3): number => Number(v.toFixed(digits));

/**
 * `samples + 1` keyframes of a spring: `build(progress, time)` gives each one's properties, with
 * `progress` the spring's position (past 1 on the overshoot) and `time` 0 to 1 of the duration. The
 * first frame is exactly `build(0, 0)` and the last `build(1, 1)`, so the animation ends in the
 * rest state.
 */
export function springFrames(
  zeta: number,
  samples: number,
  build: (progress: number, time: number) => Keyframe,
): Keyframe[] {
  const frames: Keyframe[] = [];
  for (let i = 0; i <= samples; i += 1) {
    const time = i / samples;
    const progress = i === samples ? 1 : springAt(time, zeta);
    frames.push({ ...build(progress, time), offset: r(time, 4) });
  }
  return frames;
}

/** A CSS `linear()` easing of the spring, for a transition on a property that only has two keys. */
export function springEasing(zeta: number, samples = 36): string {
  const points: number[] = [];
  for (let i = 0; i <= samples; i += 1)
    points.push(r(i === samples ? 1 : springAt(i / samples, zeta)));
  return `linear(${points.join(", ")})`;
}

/** A linear blend, for `build` callbacks: `mix(from, to, progress)`. */
export const mix = (from: number, to: number, progress: number): number =>
  from + (to - from) * progress;

/** A bell that is 0 at both ends and 1 in the middle (a lift that comes back down). */
export const bell = (time: number): number => Math.sin(Math.PI * Math.min(1, Math.max(0, time)));

export { r as round };
