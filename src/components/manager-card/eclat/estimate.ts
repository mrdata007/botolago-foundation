/**
 * The card's height ÷ width, before the renderer's chunk has loaded. Every Éclat card has the same
 * shape (plan D6: a fixed aspect, 1 : 1.618, the golden ratio of the cards it follows), so the
 * estimate is exact and the page never jumps when the card arrives.
 *
 * This file must stay free of everything else in the folder: it is imported by the main bundle
 * (`active-renderer.ts`) so the card's box is right at first paint, and anything it imported would
 * ship with every page.
 */
import type { CardLang, CardProfile } from "../types";

/** height ÷ width of every full card. */
export const ASPECT = 1.618;

export function estimateAspect(_profile?: CardProfile, _lang?: CardLang): number {
  return ASPECT;
}
