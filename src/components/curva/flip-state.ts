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
 * How long the card takes to turn over, in ms. A turn that answers a tap should be over before the
 * reader has looked for it: 340 ms, not the 420 ms of the page's hero token (which the entrance
 * and the sheets keep). Kept here so the transition and the timer that ends the 3D context share one
 * number, and read without a style lookup (a computed-style read inside the click forced a style
 * recalculation of the whole page).
 */
export const FLIP_MS = 340;
