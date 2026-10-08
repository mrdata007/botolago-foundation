/**
 * Écharpe v2, the supporter's scarf: the card renderer (plan 6.4). Loaded as its own chunk by
 * `active-renderer.ts`; its stylesheet comes with it.
 *
 * Everything is drawn from the typed profile and the interface strings. A name is knitted as
 * geometry and never written as text; every other string (the label, the season, the serial) goes
 * through one escape. The output is safe to insert as HTML.
 */
import { BEAT_MS } from "./beats";
import "./echarpe.css";
import { cardAspect, cardImage, founderDetail, fullCard } from "./full";
import { rasterText, ready } from "./raster";
import { mountSway } from "./sway";
import { tokenLabel, tokenMarkup, tokenWidth } from "./token";
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

export const echarpeRenderer: CardRenderer = {
  id: "echarpe-v2",
  beats: BEATS,
  full: (profile, options) => fullCard(profile, options, rasterText),
  token: (profile, options) => {
    const v = makeView(profile, options.strings);
    return tokenMarkup(v, options.size, options.theme, tokenLabel(v));
  },
  aspect: (profile, strings) => cardAspect(profile, strings, rasterText),
  tokenBox: (profile, size) => ({ width: tokenWidth(profile, size), height: size }),
  detail: (profile, part, options) => (part === "founder" ? founderDetail(profile, options) : null),
  image: (profile, strings) => cardImage(profile, strings, rasterText),
  label,
  beatMs: (beat) => (Object.hasOwn(BEAT_MS, beat) ? BEAT_MS[beat] : 0),
  mount: mountSway,
};

export { mountSway, ready };
export { estimateAspect } from "./estimate";
export { knitName } from "./knit-name";
