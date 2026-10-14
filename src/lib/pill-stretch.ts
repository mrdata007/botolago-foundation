/**
 * Stretch: how the bottom bar's pill travels to a new tab
 * (docs/engineering/TAB_SLIDE_STRETCH.md, after React Bits' Rubber Segment).
 * Used by BottomNav.tsx.
 */

export const STRETCH_MS = 460;
/** The pill's resting size: `h-8 w-14`. */
const PILL_W = 56;
const PILL_H = 32;

/** Stretch from one spot to another: reach, gather with a squash, settle. */
export function stretchKeyframes(
  from: { x: number; y: number },
  to: { x: number; y: number },
): Keyframe[] {
  const reach = Math.abs(to.x - from.x) + PILL_W;
  // Reaching, the pill keeps its trailing edge where it was and grows toward the new tab.
  const reachX = Math.min(from.x, to.x);
  return [
    {
      transform: `translate(${from.x}px, ${from.y}px)`,
      width: `${PILL_W}px`,
      height: `${PILL_H}px`,
    },
    {
      transform: `translate(${reachX}px, ${to.y + 3}px)`,
      width: `${reach}px`,
      height: `${PILL_H - 6}px`,
      offset: 0.45,
    },
    {
      transform: `translate(${to.x}px, ${to.y - 1.5}px)`,
      width: `${PILL_W}px`,
      height: `${PILL_H + 3}px`,
      offset: 0.75,
    },
    { transform: `translate(${to.x}px, ${to.y}px)`, width: `${PILL_W}px`, height: `${PILL_H}px` },
  ];
}
