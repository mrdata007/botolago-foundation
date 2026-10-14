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
import { METAL, type Metal, type MetalKey } from "./metal";

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
  key: MetalKey;
  m: Metal;
}

export function makeView(profile: CardProfile, strings: CardStrings): ShieldView {
  const v = makeEclatView(profile, strings);
  return { p: v.p, s: v.s, ar: v.ar, key: v.tierKey, m: METAL[v.tierKey] };
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
