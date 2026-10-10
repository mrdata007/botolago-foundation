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

/**
 * Whether the back face's content is in the page. At rest, on the front, it is not: it was a layer
 * of the card's size, rotated and hidden, drawn for every visit to turn it for few of them (the
 * pointer tilt ran about a fifth slower with it there). It is mounted as soon as the reader reaches
 * for the button (pointer over or down, focus: `armed`) so it is drawn before the turn starts, and
 * stays while the card shows it or turns.
 */
export function backMounted(state: { armed: boolean; back: boolean; turning: boolean }): boolean {
  return state.armed || state.back || state.turning;
}
