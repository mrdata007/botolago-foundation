/**
 * The stage's entrance on Curva' home: once per visit, the card swings in like one drawn from a
 * pack (a short rise, a slight turn that settles flat, the shadow on the ground growing under it).
 * This file is the rule of when it plays and what it moves; `use-stage-entrance.ts` plays it.
 *
 * The motion is transform and opacity only, on wrappers outside the card's own 3D tree (`tilt.ts`
 * owns that), and it ends in the rest state (no transform left on anything).
 */

/** What the decision reads. */
export interface EntranceGate {
  /** The screen asked for it (Curva' home only). */
  enabled: boolean;
  reducedMotion: boolean;
  /** Already played, or passed over, in this session. */
  playedThisSession: boolean;
  /** The stage was already in the page while it hydrated (the server render drew it). */
  presentAtFirstPaint: boolean;
  /** A hero is, or is about to be, the visit's moment: it carries the card. */
  heroDue: boolean;
  /** The splash and the language chooser have let go of the screen. */
  launchGateOpen: boolean;
}

export interface EntranceDecision {
  play: boolean;
  /** Write the session flag: this visit's entrance is spent (played, or passed over for good). */
  remember: boolean;
}

/**
 * Whether the entrance plays now. It never plays under reduced motion, nor twice in a session,
 * nor over a card that the server render already drew (that would flash it away and back), nor
 * beside a hero, nor under the splash or the language chooser. The last three also spend the
 * visit's entrance, except the launch gate: a stage that arrives while it is still closed has
 * not been seen yet, so a later arrival may still play.
 */
export function entranceDecision(gate: EntranceGate): EntranceDecision {
  if (!gate.enabled || gate.reducedMotion || gate.playedThisSession) {
    return { play: false, remember: false };
  }
  if (gate.presentAtFirstPaint || gate.heroDue) return { play: false, remember: true };
  if (!gate.launchGateOpen) return { play: false, remember: false };
  return { play: true, remember: true };
}

/** The card's entrance: the hero token's length, never under 420 ms nor over 600 ms. */
export const ENTRANCE_MIN_MS = 420;
export const ENTRANCE_MAX_MS = 600;

/**
 * The entrance's length from the page's `--duration-hero` (ms), clamped to 420-600 ms. It was the
 * token stretched by a quarter (525 ms); it is the token itself now (420 ms), because a card that
 * has been waited for should not also take over half a second to land.
 */
export function entranceMs(heroToken: number): number {
  if (!Number.isFinite(heroToken)) return ENTRANCE_MIN_MS;
  return Math.min(ENTRANCE_MAX_MS, Math.max(ENTRANCE_MIN_MS, Math.round(heroToken)));
}

/**
 * The card's keyframes (the lift wrapper). `dir` is +1 reading left to right and -1 right to
 * left, so the settling turn leans the way the card's own light does in Arabic. The transform list
 * is the same in every frame, so it interpolates; the last frame is the rest state.
 */
export function entranceFrames(dir: 1 | -1): Keyframe[] {
  const at = (y: number, rx: number, ry: number, scale: number): string =>
    `perspective(1100px) translateY(${y}px) rotateX(${rx}deg) rotateY(${ry * dir}deg) scale(${scale})`;
  return [
    { opacity: 0, transform: at(30, 16, -9, 0.95), offset: 0 },
    { opacity: 1, transform: at(-5, -3, 2.5, 1.012), offset: 0.62 },
    { opacity: 1, transform: at(0, 0, 0, 1), offset: 1 },
  ];
}

/** The shadow on the ground: it grows as the card comes down and is gone once the card's own shows. */
export function groundFrames(): Keyframe[] {
  return [
    { opacity: 0, transform: "scale(0.55, 0.7)", offset: 0 },
    { opacity: 0.85, transform: "scale(1, 1)", offset: 0.62 },
    { opacity: 0, transform: "scale(1.04, 1)", offset: 1 },
  ];
}
