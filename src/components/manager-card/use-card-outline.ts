import { cardOutline } from "./motion/outline";
import { useCardRenderer } from "./use-card-renderer";

/**
 * The card's silhouette for a face a screen draws in DOM (the back, the turn's edge and shade, the
 * glint, the ceremony's back): the active renderer's own (`CardRenderer.outline`, the shield's
 * outline today), or the cut-cornered one until the renderer has loaded or when it has none.
 */
export function useCardOutline(rtl: boolean): string {
  const renderer = useCardRenderer();
  return renderer?.outline ? renderer.outline(rtl) : cardOutline(rtl);
}
