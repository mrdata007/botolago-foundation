/**
 * Beats (plan 9, « the light comes on »): the card's motion contract. A beat is a few things in the
 * card lighting up, done in CSS only (`eclat.css`, "beats"; every keyframe sits inside
 * `prefers-reduced-motion: no-preference`). This file is the timing table and the rule of which
 * parts a beat may move.
 *
 * Only these animate: the floodlights (`.mc-flood`), the field group (`.mc-field`), the foil
 * overlay's sweep (`.mc-eclat__foil::after`), the foil shift (`.mc-foil-shift`), the forming marks
 * (`.mc-mark`), the founder's capsule (`.mc-capsule`) and the seal line (`.mc-seal`). Never the
 * number group, the serial, the tier word, any `<text>` or the shirt: they are legible in the first
 * painted frame and at every frame after it. The tests parse each beat's markup and check it.
 */
import type { BeatName } from "../types";

/** The whole length of each beat, in ms: the latest end of anything that moves in it. */
export const BEAT_MS: Readonly<Record<BeatName, number>> = {
  make: 600,
  tick: 300,
  first: 560,
  tier: 600,
  legend: 540,
  founder: 520,
  castoff: 420,
};

/** No beat runs longer than this. */
export const BEAT_CAP_MS = 600;

/** The classes a beat may animate, per beat (documentation the tests check against the CSS). */
export const ANIMATED: Readonly<Record<BeatName, readonly string[]>> = {
  make: ["mc-flood", "mc-field", "mc-eclat__foil"],
  tick: ["mc-mark", "mc-flood"],
  first: ["mc-field", "mc-eclat__foil"],
  tier: ["mc-field", "mc-flood", "mc-eclat__foil"],
  legend: ["mc-eclat__foil", "mc-foil-shift", "mc-flood"],
  founder: ["mc-capsule"],
  castoff: ["mc-seal", "mc-flood"],
};

/** Classes that must never be animated by a beat or sit inside something that is. */
export const NEVER_ANIMATED = ["mc-l--num", "mc-l--shirt"] as const;
