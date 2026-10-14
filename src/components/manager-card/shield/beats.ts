/**
 * Beats: the card's motion contract, the same seven names as before, each a few parts of the shield
 * lighting up, in CSS only (`shield.css`, "beats", every keyframe inside `prefers-reduced-motion:
 * no-preference`). This file is the timing table; `beats.test.ts` reads the stylesheet and checks
 * that it says the same thing.
 *
 * A beat is a class on the card's root and nothing else (`beatRoot`), so the app plays it on the
 * card already in the page. Only these move: the art (`mc-sl--art`: the autograph and the
 * monogram), the frame (`mc-sl--frame`), the light layer's sheen and prism (`mc-sl--foil`), the
 * emblem (`mc-sl--emblem`), the newest forming mark (`mc-shield__mark--new`) and the founder's
 * capsule (`mc-shield__founder`). Never the number layer, the serial, the tier word or the text.
 */
import type { BeatName } from "../types";

export interface Move {
  /** The class of the element (or the element whose pseudo-element) the animation runs on. */
  target: string;
  anim: string;
  delay: number;
  ms: number;
}

const SHEEN = (delay: number): Move => ({
  target: "mc-sl--foil",
  anim: "mc-sh-sheen",
  delay,
  ms: 480,
});

export const TIMELINE: Readonly<Record<BeatName, readonly Move[]>> = {
  make: [
    { target: "mc-sl--art", anim: "mc-sh-reveal", delay: 0, ms: 420 },
    { target: "mc-sl--frame", anim: "mc-sh-ignite", delay: 0, ms: 300 },
    SHEEN(120),
  ],
  tick: [
    // a forming card lights its newest mark; a rated one pulses its frame
    { target: "mc-shield__mark--new", anim: "mc-sh-mark", delay: 40, ms: 260 },
    { target: "mc-sl--frame", anim: "mc-sh-pulse", delay: 0, ms: 300 },
  ],
  first: [{ target: "mc-sl--art", anim: "mc-sh-kindle", delay: 40, ms: 360 }, SHEEN(80)],
  tier: [
    { target: "mc-sl--emblem", anim: "mc-sh-pop", delay: 0, ms: 420 },
    { target: "mc-sl--frame", anim: "mc-sh-ignite", delay: 200, ms: 300 },
    SHEEN(120),
  ],
  legend: [
    { target: "mc-sl--foil", anim: "mc-sh-prism", delay: 0, ms: 540 },
    { target: "mc-sl--emblem", anim: "mc-sh-pop", delay: 60, ms: 420 },
    { target: "mc-sl--frame", anim: "mc-sh-ignite", delay: 0, ms: 300 },
  ],
  founder: [{ target: "mc-shield__founder", anim: "mc-sh-capsule", delay: 0, ms: 520 }],
  castoff: [{ target: "mc-sl--frame", anim: "mc-sh-settle", delay: 40, ms: 380 }],
};

/** No beat runs longer than this. */
export const BEAT_CAP_MS = 600;

const endOf = (moves: readonly Move[]): number => Math.max(...moves.map((m) => m.delay + m.ms));

/** The whole length of each beat in ms. */
export const BEAT_MS: Readonly<Record<BeatName, number>> = {
  make: endOf(TIMELINE.make),
  tick: endOf(TIMELINE.tick),
  first: endOf(TIMELINE.first),
  tier: endOf(TIMELINE.tier),
  legend: endOf(TIMELINE.legend),
  founder: endOf(TIMELINE.founder),
  castoff: endOf(TIMELINE.castoff),
};

export const BEATS: readonly BeatName[] = [
  "make",
  "tick",
  "first",
  "tier",
  "legend",
  "founder",
  "castoff",
];

/** Classes that are never animated by a beat, nor sit inside something that is. */
export const NEVER_ANIMATED = ["mc-sl--num", "mc-sl--text", "mc-shield__serial"] as const;
