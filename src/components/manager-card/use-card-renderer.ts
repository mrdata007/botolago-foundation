import { useSyncExternalStore } from "react";

import { activeRenderer } from "./active-renderer";
import type { CardRenderer } from "./renderer";
import type { CardTheme } from "./types";

/**
 * The renderer, loaded on the client (plan section 6.5). Cards are drawn on the client only, so
 * the server and the first client render both get `null` (a reserved box); once the renderer's
 * chunk is in, every card on the page re-renders with it. A phone that already loaded it gets it
 * on its first render, with no flash of the placeholder.
 *
 * `useSyncExternalStore` is what makes both true: React uses the server snapshot while hydrating
 * and the client snapshot on any later mount.
 */
let loaded: CardRenderer | null = null;
let pending: Promise<void> | null = null;
const listeners = new Set<() => void>();

function ensureLoaded(): void {
  if (loaded || pending) return;
  pending = activeRenderer.load().then(
    (renderer) => {
      loaded = renderer;
      pending = null;
      for (const listener of [...listeners]) listener();
    },
    () => {
      // A failed chunk is retried by the next card that mounts; the box stays a reserved box.
      pending = null;
    },
  );
}

/**
 * Start loading the renderer's chunk and fonts now, before any card is mounted. A screen that is
 * about to draw cards calls it as it mounts, so the chunk and the faces load while the card's data
 * is still on its way (`ensureLoaded` otherwise starts when the first card mounts, which is after
 * the data arrived). Client only, and idempotent; a screen that never draws a card never calls it,
 * so with the section off the chunk is never requested.
 */
export function preloadCardRenderer(): void {
  if (typeof window === "undefined") return;
  ensureLoaded();
}

function subscribeRenderer(listener: () => void): () => void {
  listeners.add(listener);
  ensureLoaded();
  return () => {
    listeners.delete(listener);
  };
}

/** The loaded renderer, or null on the server, while hydrating, and until its chunk arrives. */
export function useCardRenderer(): CardRenderer | null {
  return useSyncExternalStore(
    subscribeRenderer,
    () => loaded,
    () => null,
  );
}

/** For tests: put a renderer in place of the loaded one, or clear it. */
export function setLoadedRendererForTests(renderer: CardRenderer | null): void {
  loaded = renderer;
  pending = null;
  for (const listener of [...listeners]) listener();
}

/* ------------------------------------------------------------------------------------------ */
/* The theme the card is drawn in                                                               */
/* ------------------------------------------------------------------------------------------ */

function readTheme(): CardTheme {
  return typeof document !== "undefined" && document.documentElement.classList.contains("dark")
    ? "dark"
    : "light";
}

function subscribeTheme(listener: () => void): () => void {
  if (typeof MutationObserver === "undefined" || typeof document === "undefined") {
    return () => {};
  }
  const observer = new MutationObserver(listener);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });
  return () => observer.disconnect();
}

/**
 * Light or dark, as the app resolved it: the `dark` class on `<html>` that the theme provider and
 * its head script keep (`src/theme/theme.ts`). Read from there, not from a provider, so a card
 * renders wherever it is mounted; it follows a change of theme live.
 */
export function useCardTheme(): CardTheme {
  return useSyncExternalStore(subscribeTheme, readTheme, () => "light");
}
