/**
 * Éclat, the collectible Manager Card: the card renderer (plan 12.1). Loaded as its own chunk by
 * `active-renderer.ts`; its stylesheet comes with it.
 *
 * Everything is drawn from the typed profile and the interface strings. A name is set as text in
 * the card's faces and every string (the name, the label, the season, the serial, the club's
 * initials) goes through one escape; the output is safe to insert as HTML. A card is flat 2D at
 * rest and tilts into 3D only while a pointer moves over it.
 */
import { BEAT_MS } from "./beats";
import "./eclat.css";
import { beatRoot, cardAspect, cardImage, founderDetail, fullCard } from "./full";
import { measureText, ready } from "./measure";
import { tierPalette } from "./palette";
import { mountTilt } from "./tilt";
import { tokenMarkup, tokenWidth } from "./token";
import { label, makeView } from "./view";
import type { CardRenderer } from "../renderer";
import type { BeatName } from "../types";

const BEATS: readonly BeatName[] = [
  "make",
  "tick",
  "first",
  "tier",
  "legend",
  "founder",
  "castoff",
];

export const eclatRenderer: CardRenderer = {
  id: "eclat-v1",
  beats: BEATS,
  full: (profile, options) => fullCard(profile, options, measureText),
  token: (profile, options) => {
    const v = makeView(profile, options.strings);
    return tokenMarkup(v, options.size, options.theme, measureText);
  },
  aspect: () => cardAspect(),
  tokenBox: (_profile, size) => ({ width: tokenWidth(size), height: size }),
  detail: (profile, part, options) =>
    part === "founder" ? founderDetail(profile, options, measureText) : null,
  image: (profile, strings) => cardImage(profile, strings, measureText),
  label,
  palette: tierPalette,
  beatMs: (beat) => (Object.hasOwn(BEAT_MS, beat) ? BEAT_MS[beat] : 0),
  beatRoot: (profile, options, beat) => beatRoot(profile, options.strings, beat),
  mount: mountTilt,
};

export { mountTilt, ready };
export { estimateAspect } from "./estimate";
