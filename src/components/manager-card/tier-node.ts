import { createElement, type ReactNode } from "react";

import { ui } from "@/components/ui-kit";
import type { Language } from "@/types/domain";

import type { TierCode } from "./types";

/**
 * The tier's word as a node (collectible-design plan section 11), for the places that build words with no
 * hook to call: a `{tier}` placeholder filled by `fill()`, the moments' pure text functions.
 * Where a component shows the word on its own, `<TierWord>` (`tier-word.tsx`) is the way in; it
 * calls this.
 *
 * The lowest tier is shown as « LASTREET »: one Latin word in both languages (the tier code, the
 * dictionary key `card.tier.homa`, the DTO and the analytics event names all stay `homa`). The other
 * four tiers are Latin in French and Arabic words in Arabic, and need nothing.
 *
 * In the Arabic interface a Latin word between Arabic words is a run of the opposite direction: a
 * neighbouring word, a dot or a number can pull it out of place. It is therefore always a
 * `<bdi dir="ltr" translate="no">`, its own left-to-right box that the browser's translator leaves
 * alone. In Arabic it also takes the display face, whose Latin glyphs are Changa's (the Arabic body
 * stack has none of its own). It carries no tracking: `html[dir="rtl"] *` sets `letter-spacing:
 * normal` for the whole Arabic page (BG-0069), the isolate included, so the Arabic runs around it
 * are never spaced.
 *
 * For plain strings that leave the interface (an image caption, a `title`), `isolateLatin` in
 * `copy.ts` does the same job with Unicode isolates. A card's accessible label keeps the bare word:
 * it is spoken, not laid out.
 */

/** The tiers whose word is Latin in both languages, so is isolated in Arabic. */
export const LATIN_TIERS: ReadonlySet<TierCode> = new Set<TierCode>(["homa"]);

/** The face of a Latin tier word inside Arabic text. */
const LATIN_IN_ARABIC = ui.font.display;

/** The tier's word as a node: isolated when it is Latin, the plain word otherwise. */
export function tierNode(tier: TierCode, word: string, lang: Language): ReactNode {
  if (!LATIN_TIERS.has(tier)) return word;
  return createElement(
    "bdi",
    { dir: "ltr", translate: "no", className: lang === "ar" ? LATIN_IN_ARABIC : undefined },
    word,
  );
}
