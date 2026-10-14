import { estimateAspect } from "./shield/estimate";
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
 * renderer has loaded.
 *
 * Today this is the collector shield (`./shield`, entered through `curva-shield-renderer.ts`, whose
 * name is the chunk's; owner's design of 2026-10-13). `load` waits for the faces the card fits and
 * prints (within a second and a half) before it hands the renderer over, so the first card is drawn
 * with the right faces. `estimateAspect` is the shield's own `estimate.ts`, the one module of the
 * folder that is in the main bundle: it imports nothing but a type. Every shield card has the same
 * shape (100 : 136.6), so the estimate is exact and the box never changes size when the card
 * arrives.
 *
 * Éclat (`./eclat`, the shirt on a honeycomb) stays in the tree with its tests: going back to it is
 * this file pointing at `./eclat/estimate` and `./eclat/curva-renderer` (`eclatRenderer`) again.
 * The plain renderer (`./plain-renderer`) stays as the small stand-in the unit tests use.
 */
export interface ActiveRenderer {
  readonly id: string;
  load(): Promise<CardRenderer>;
  /** height ÷ width, cheap and without the DOM. */
  estimateAspect(profile: CardProfile, lang: CardLang): number;
}

export const activeRenderer: ActiveRenderer = {
  id: "shield-v1",
  load: async () => {
    const module = await import("./shield/curva-shield-renderer");
    await module.ready();
    return module.shieldRenderer;
  },
  estimateAspect,
};
