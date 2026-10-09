import { estimateAspect } from "./eclat/estimate";
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
 * Today this is Éclat (`./eclat`, entered through `gradins-renderer.ts`, whose name is the chunk's).
 * `load` waits for the faces the card measures and prints (within a second and a half) before it
 * hands the renderer over, so the first card is drawn with the right faces. `estimateAspect` is
 * Éclat's own `estimate.ts`, the one module of the folder that is in the main bundle: it imports
 * nothing but a type. Every Éclat card has the same shape (1 : 1.618), so the estimate is exact and
 * the box never changes size when the card arrives. The plain renderer (`./plain-renderer`) stays
 * as the small stand-in the unit tests use.
 */
export interface ActiveRenderer {
  readonly id: string;
  load(): Promise<CardRenderer>;
  /** height ÷ width, cheap and without the DOM. */
  estimateAspect(profile: CardProfile, lang: CardLang): number;
}

export const activeRenderer: ActiveRenderer = {
  id: "eclat-v1",
  load: async () => {
    const module = await import("./eclat/gradins-renderer");
    await module.ready();
    return module.eclatRenderer;
  },
  estimateAspect,
};
