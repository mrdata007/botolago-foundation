/**
 * Beats (plan 9, « the light comes on »): the card's motion contract. A beat is a few things in the
 * card lighting up, done in CSS only (`eclat.css`, "beats"; every keyframe sits inside
 * `prefers-reduced-motion: no-preference`). This file is the timing table and the rule of which
 * parts a beat may move; the stylesheet says the same thing in CSS and `beats.test.ts` reads both
 * and checks that they agree.
 *
 * Only these animate: the floodlights (`.mc-flood`), the field group (`.mc-field`), the foil
 * overlay's `::after` (the sheen crossing, or the diffraction sliding in) (`.mc-eclat__foil`), the
 * foil shift (`.mc-foil-shift`), the forming marks (`.mc-mark`), the founder's capsule
 * (`.mc-capsule`) and the seal line (`.mc-seal`). Never the number group, the serial, the tier word,
 * any `<text>` or the shirt: they are legible in the first painted frame and at every frame after
 * it. The tests parse each beat's markup and check it.
 */
import type { BeatName } from "../types";

/** One thing that moves in a beat: what, which keyframes, when it starts and how long it takes (ms). */
export interface Move {
  /** The class of the element (or the element whose pseudo-element) the animation runs on. */
  target: string;
  /** The keyframes it may run: the sheen's two forms share a slot (a band, or the diffraction). */
  anim: readonly string[];
  delay: number;
  ms: number;
}

const FLOOD_IGNITE = { target: "mc-flood", anim: ["mc-ignite"], delay: 0, ms: 180 } as const;
const SWEEP = (delay: number): Move => ({
  target: "mc-eclat__foil",
  anim: ["mc-sweep", "mc-diffract"],
  delay,
  ms: 480,
});

/** Everything that moves, per beat. The beat's length is the latest end of any of it. */
export const TIMELINE: Readonly<Record<BeatName, readonly Move[]>> = {
  make: [FLOOD_IGNITE, { target: "mc-field", anim: ["mc-reveal"], delay: 60, ms: 420 }, SWEEP(120)],
  tick: [
    // a forming card lights its newest mark, a rated one pulses the floodlights
    { target: "mc-mark", anim: ["mc-mark"], delay: 40, ms: 260 },
    { target: "mc-flood", anim: ["mc-pulse"], delay: 0, ms: 300 },
  ],
  first: [{ target: "mc-field", anim: ["mc-kindle"], delay: 40, ms: 360 }, SWEEP(80)],
  tier: [
    { target: "mc-field", anim: ["mc-rise"], delay: 0, ms: 420 },
    { ...FLOOD_IGNITE, delay: 200 },
    SWEEP(120),
  ],
  legend: [
    FLOOD_IGNITE,
    { target: "mc-foil-shift", anim: ["mc-prism-shift"], delay: 0, ms: 540 },
    { target: "mc-eclat__foil", anim: ["mc-prism"], delay: 0, ms: 540 },
  ],
  founder: [{ target: "mc-capsule", anim: ["mc-capsule"], delay: 0, ms: 520 }],
  castoff: [
    { target: "mc-seal", anim: ["mc-seal"], delay: 40, ms: 380 },
    { target: "mc-flood", anim: ["mc-settle"], delay: 40, ms: 380 },
  ],
};

/** No beat runs longer than this. */
export const BEAT_CAP_MS = 600;

const endOf = (moves: readonly Move[]): number => Math.max(...moves.map((m) => m.delay + m.ms));

/** The whole length of each beat, in ms: the latest end of anything that moves in it. */
export const BEAT_MS: Readonly<Record<BeatName, number>> = {
  make: endOf(TIMELINE.make),
  tick: endOf(TIMELINE.tick),
  first: endOf(TIMELINE.first),
  tier: endOf(TIMELINE.tier),
  legend: endOf(TIMELINE.legend),
  founder: endOf(TIMELINE.founder),
  castoff: endOf(TIMELINE.castoff),
};

const classesOf = (moves: readonly Move[]): readonly string[] => [
  ...new Set(moves.map((m) => m.target)),
];

/** The classes a beat may animate, per beat. */
export const ANIMATED: Readonly<Record<BeatName, readonly string[]>> = {
  make: classesOf(TIMELINE.make),
  tick: classesOf(TIMELINE.tick),
  first: classesOf(TIMELINE.first),
  tier: classesOf(TIMELINE.tier),
  legend: classesOf(TIMELINE.legend),
  founder: classesOf(TIMELINE.founder),
  castoff: classesOf(TIMELINE.castoff),
};

/** Classes that must never be animated by a beat or sit inside something that is. */
export const NEVER_ANIMATED = ["mc-l--num", "mc-l--shirt"] as const;
