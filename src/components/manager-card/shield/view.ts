/**
 * What every shield drawing starts from. The profile is cleaned and the label is built exactly as
 * the Éclat card did (`../eclat/view.ts`, which this file reuses rather than copies): the same
 * escape, the same sentence a screen reader hears, LASTREET for the lowest tier, the same rule for
 * when a card shows a tier's material (a number and a tier, or the ladder's step).
 */
import { contrast, inkOn, mix, tierWord } from "../eclat/foil";
import {
  esc,
  label,
  labelAttr,
  makeView as makeEclatView,
  spokenName,
  stripControls,
  tokenLabel,
} from "../eclat/view";
import type { CardProfile, CardStrings } from "../types";
import { metalFor, paidEdition, type Metal, type MetalKey, type PaidEdition } from "./metal";

export {
  contrast,
  esc,
  inkOn,
  label,
  labelAttr,
  mix,
  spokenName,
  stripControls,
  tierWord,
  tokenLabel,
};

export interface ShieldView {
  /** The cleaned profile. */
  p: CardProfile;
  /** The strings with the tier names the card prints. */
  s: CardStrings;
  ar: boolean;
  /** The earned tier's key (the emblem's glyph, `data-mc-tier`), whatever the edition. */
  key: MetalKey;
  /** The paid edition, or null for the free card. */
  edition: PaidEdition | null;
  /** What the card is drawn in: the edition's finish if paid, else the tier's metal. */
  m: Metal;
}

export function makeView(profile: CardProfile, strings: CardStrings): ShieldView {
  const v = makeEclatView(profile, strings);
  const edition = paidEdition(profile.edition);
  const metal = metalFor(v.tierKey, edition);
  const primary = v.p.club?.primary;
  let clubShade = 0.55;
  // Very light club colours need more shade than red or green. Leave headroom for the full
  // card's highlights and translucent ribbon, rather than checking only its unlit face.
  if (primary) {
    while (contrast(metal.ink2, mix(primary, "#10151d", clubShade)) < 7 && clubShade < 0.9)
      clubShade += 0.05;
  }
  // Before a tier is earned, the favourite club gives the card its colour. Use the cleaned
  // primary hex and a dark ground so every club (including white/yellow) keeps the light text
  // readable. The same material feeds full cards, tokens and share art. Earned metals and paid
  // editions retain their own finishes.
  const m =
    v.tierKey === "base" && !edition && primary
      ? {
          ...metal,
          faceStops: [
            clubShade,
            clubShade + (1 - clubShade) / 3,
            clubShade + ((1 - clubShade) * 2) / 3,
          ].map((shade) => mix(primary, "#10151d", shade)),
        }
      : metal;
  return { p: v.p, s: v.s, ar: v.ar, key: v.tierKey, edition, m };
}

/** The Éclat view of the same profile, for the helpers that take one (the token's label). */
export const eclatView = makeEclatView;

/** The number's text: the rating, or the em dash a card prints where there is none yet. */
export const ovrText = (v: ShieldView): string => (v.p.ovr == null ? "—" : String(v.p.ovr));

/** A stat's text: the value, or the dash (never 0). */
export const statText = (value: number | null): string => (value == null ? "—" : String(value));

/** The crest pill's ground: the club's colour, darkened a little; its initials in white or black (4.5:1). */
export function crestColours(primary: string): { ground: string; ink: string; ring: string } {
  const ground = mix(primary, "#0d1220", 0.35);
  return { ground, ink: inkOn(ground), ring: primary };
}
