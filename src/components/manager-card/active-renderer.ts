import type { CardRenderer } from "./renderer";
import type { CardProfile } from "./types";

/**
 * The card direction the app draws with (plan section 6.1). Screens never import a renderer: they
 * go through `ManagerCard` and `CardToken`, which ask for this one. Changing the card's direction
 * later is a change to this file alone.
 *
 * `load` is a dynamic import, so the renderer is its own chunk and is never requested until a card
 * is drawn (with the build switch off, never). `estimateAspect` is the cheap height ÷ width the
 * box reserves before the renderer has loaded; the exact value comes from the renderer's own
 * `aspect()` once it has.
 *
 * Today this is the plain renderer. The Écharpe port (WP2) switches `load` to
 * `echarpe/index.ts` and `estimateAspect` to a cheap version of its `aspect`, in its last commit.
 */
export interface ActiveRenderer {
  readonly id: string;
  load(): Promise<CardRenderer>;
  estimateAspect(profile: CardProfile): number;
}

const PLAIN_ASPECT = 360 / 240;

export const activeRenderer: ActiveRenderer = {
  id: "plain-v1",
  load: () => import("./plain-renderer").then((module) => module.plainRenderer),
  estimateAspect: () => PLAIN_ASPECT,
};
