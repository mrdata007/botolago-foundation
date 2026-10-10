import type { CardRenderer } from "./renderer";

/**
 * Whether a card the app has put in the page gets the renderer's pointer behaviour (the tilt), and
 * the cleanup when it does. Only a card whose screen asked for it (`tilt`), whose renderer has the
 * behaviour (`mount`), that is in the page (a host and its markup) and whose reader has not asked
 * for less motion: under reduced motion nothing is mounted, so the card stays still and keeps its
 * static depth. Kept apart from `ManagerCard` so the rule can be tested without a DOM.
 */
export function mountPointerBehaviour({
  tilt,
  renderer,
  host,
  html,
  reducedMotion,
}: {
  tilt: boolean;
  renderer: CardRenderer | null;
  host: HTMLElement | null;
  html: string | null;
  reducedMotion: boolean;
}): (() => void) | undefined {
  if (!tilt || reducedMotion || !renderer?.mount || !host || !html) return undefined;
  return renderer.mount(host);
}
