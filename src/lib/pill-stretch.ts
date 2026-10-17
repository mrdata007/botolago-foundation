/**
 * Stretch: how the bottom bar's pill travels to a new tab
 * (docs/engineering/TAB_SLIDE_STRETCH.md, after React Bits' Rubber Segment).
 * Used by BottomNav.tsx.
 */

export const STRETCH_MS = 460;
/** The pill's resting size at 100% text: `h-8 w-14`. */
const DEFAULT_PILL_W = 56;
const DEFAULT_PILL_H = 32;

/** Stretch from one spot to another: reach, gather with a squash, settle. */
export function stretchKeyframes(
  from: { x: number; y: number },
  to: { x: number; y: number },
  /**
   * The pill's measured size. The pill is `rem`-sized, so at a large text size
   * it is not 56x32: animating to the defaults then snapped it back at the end.
   */
  size: { w: number; h: number } = { w: DEFAULT_PILL_W, h: DEFAULT_PILL_H },
): Keyframe[] {
  const { w: pillW, h: pillH } = size;
  const reach = Math.abs(to.x - from.x) + pillW;
  // Reaching, the pill keeps its trailing edge where it was and grows toward the new tab.
  const reachX = Math.min(from.x, to.x);
  return [
    {
      transform: `translate(${from.x}px, ${from.y}px)`,
      width: `${pillW}px`,
      height: `${pillH}px`,
    },
    {
      transform: `translate(${reachX}px, ${to.y + 3}px)`,
      width: `${reach}px`,
      height: `${pillH - 6}px`,
      offset: 0.45,
    },
    {
      transform: `translate(${to.x}px, ${to.y - 1.5}px)`,
      width: `${pillW}px`,
      height: `${pillH + 3}px`,
      offset: 0.75,
    },
    { transform: `translate(${to.x}px, ${to.y}px)`, width: `${pillW}px`, height: `${pillH}px` },
  ];
}
