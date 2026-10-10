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
