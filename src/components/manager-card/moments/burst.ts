import type { TierCode } from "../types";

/**
 * The tier-up ceremony's stadium-light burst (`TierBurst`): what it looks like per tier. Pure, so
 * the rule that it grows with the tier is a table the tests read.
 *
 * The burst is a DOM layer behind the card in the hero, outside the card's SVG and its 3D tree.
 * It moves opacity and scale only and ends at rest (nothing left on screen). It is timed with the
 * hero's `tier` or `legend` beat (it starts with it) and outlasts the beat, which ends at 600 ms
 * (`BEAT_CAP_MS`): the burst is not part of the card, so the card's cap does not bind it.
 */

/** How long the burst plays, in ms: it starts with the beat and fades well after the beat ends. */
export const BURST_MS = 1200;

export interface BurstSpec {
  tier: TierCode;
  /** The beams around the card. Even, so the pattern mirrors left to right and reads the same in Arabic. */
  rays: number;
  /** The most opaque the burst gets, 0 to 1. */
  peak: number;
  /** How far the beams reach at the end of the burst, as a multiple of their opening size. */
  reach: number;
  /** The beams are a prism of the tier's foil colours (LEGEND) instead of the tier's light. */
  prism: boolean;
}

/**
 * The burst of a tier, or null for a tier that has none. STADE < PRO < CHAMPION < LEGEND in every
 * measure; LEGEND keeps its prism and gets the strongest. HOMA (LASTREET) is where a card starts,
 * so it is never a tier-up and has no burst.
 */
export function burstSpec(tier: TierCode | null): BurstSpec | null {
  switch (tier) {
    case "stade":
      return { tier, rays: 8, peak: 0.45, reach: 1.1, prism: false };
    case "pro":
      return { tier, rays: 10, peak: 0.6, reach: 1.2, prism: false };
    case "champion":
      return { tier, rays: 12, peak: 0.78, reach: 1.32, prism: false };
    case "legend":
      return { tier, rays: 16, peak: 1, reach: 1.5, prism: true };
    default:
      return null;
  }
}

/**
 * Whether the burst starts: a spec for the tier, the hero's beat is the one that lights the card,
 * the card is drawn (the renderer is loaded, so the beat starts with it), the reader has not asked
 * for less motion, the page is visible, and it has not played already.
 */
export function burstShouldStart(input: {
  spec: BurstSpec | null;
  beat: string | undefined;
  rendererReady: boolean;
  reducedMotion: boolean;
  hidden: boolean;
  alreadyPlayed: boolean;
}): boolean {
  if (!input.spec || input.alreadyPlayed || input.reducedMotion || input.hidden) return false;
  if (!input.rendererReady) return false;
  return input.beat === "tier" || input.beat === "legend";
}
