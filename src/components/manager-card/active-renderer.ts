import { estimateAspect } from "./echarpe/estimate";
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
 * Today this is Écharpe v2 (`./echarpe`). `load` waits for the Changa face its Arabic-name sampler
 * reads (within a second and a half) before it hands the renderer over, so the first card is drawn
 * with the right face. `estimateAspect` is Écharpe's own `estimate.ts`, the one module of the folder
 * that is in the main bundle: it imports only the geometry and the name cleaner, no chart.
 * The plain renderer (`./plain-renderer`) stays as the small stand-in the unit tests use.
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

export const activeRenderer: ActiveRenderer = {
  id: "echarpe-v2",
  load: async () => {
    const module = await import("./echarpe");
    await module.ready();
    return module.echarpeRenderer;
  },
  estimateAspect,
};
