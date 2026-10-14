/**
 * The collector shield, the Manager Card the app draws (owner's design, 2026-10-13): a shield in the
 * metal of the tier the manager has earned, the name written across it as a holographic autograph,
 * the rating and the tier at the top, the club, the four statistics and the crest below. Loaded as
 * its own chunk by `active-renderer.ts` (through `curva-shield-renderer.ts`); its stylesheet and its
 * two signature faces come with it. See `README.md`.
 */
import { BEATS, BEAT_MS } from "./beats";
import { OUTLINE_POLYGON } from "./geometry";
import { ASPECT } from "./estimate";
import { beatRoot, founderDetail, fullCard } from "./full";
import { ready } from "./fonts";
import { cardImage } from "./image";
import { tierPalette } from "./metal";
import "./shield.css";
import { mountShieldTilt } from "./tilt";
import { tokenMarkup, tokenWidth } from "./token";
import { label } from "./view";
import type { CardRenderer } from "../renderer";

export const SHIELD_ID = "shield-v1";

export const shieldRenderer: CardRenderer = {
  id: SHIELD_ID,
  beats: BEATS,
  full: (profile, options) => fullCard(profile, options),
  token: (profile, options) => tokenMarkup(profile, options.strings, options.size, options.theme),
  aspect: () => ASPECT,
  tokenBox: (_profile, size) => ({ width: tokenWidth(size), height: size }),
  detail: (profile, part, options) => (part === "founder" ? founderDetail(profile, options) : null),
  image: (profile, strings) => cardImage(profile, strings),
  label,
  palette: tierPalette,
  beatMs: (beat) => (Object.hasOwn(BEAT_MS, beat) ? BEAT_MS[beat] : 0),
  beatRoot: (profile, options, beat) => beatRoot(profile, options.strings, beat),
  mount: mountShieldTilt,
  outline: () => OUTLINE_POLYGON,
};

export { mountShieldTilt, ready };
export { estimateAspect } from "./estimate";
