import type { CardRenderer } from "./renderer";
import type { CardLang, CardProfile } from "./types";

/**
 * The card direction the app draws with (plan section 6.1). Screens never import a renderer: they
 * go through `ManagerCard` and `CardToken`, which ask for this one. Changing the card's direction
 * later is a change to this file alone.
 *
 * `load` is a dynamic import, so the renderer is its own chunk and is never requested until a card
 * is drawn (with the build switch off, never); a renderer that needs its fonts first awaits them
 * inside `load`. `estimateAspect` is the cheap height ÷ width the box reserves before the
 * renderer has loaded; after that the box takes the markup's own shape, which changes with the
 * card (the fourth counted journée turns the forming marks into season stripes).
 *
 * Today this is the plain renderer. The Écharpe port (WP2) switches `load` to
 * `echarpe/index.ts` and `estimateAspect` to a cheap version of its `aspect`, in its last commit.
 */
export interface ActiveRenderer {
  readonly id: string;
  load(): Promise<CardRenderer>;
  /**
   * height ÷ width, cheap and without the DOM. `lang` is the interface language: the Arabic tier
   * word knits more rows than the French one, so the card is taller.
   */
  estimateAspect(profile: CardProfile, lang: CardLang): number;
}

const PLAIN_ASPECT = 360 / 240;

export const activeRenderer: ActiveRenderer = {
  id: "plain-v1",
  load: () => import("./plain-renderer").then((module) => module.plainRenderer),
  estimateAspect: () => PLAIN_ASPECT,
};
