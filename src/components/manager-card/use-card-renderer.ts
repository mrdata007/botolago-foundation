import { useSyncExternalStore } from "react";

import { reportOperationalError } from "@/lib/operational-errors";

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
let failed = false;
let attempt = 0;
const listeners = new Set<() => void>();

/**
 * How long the chunk may take before the card gives up and offers a retry. A dropped connection
 * fails the import at once; a stalled one never settles, and without this limit the skeleton
 * would stay for good (audit 2026-10-14, SEC-04).
 */
export const RENDERER_LOAD_TIMEOUT_MS = 15_000;
let loadTimeoutMs = RENDERER_LOAD_TIMEOUT_MS;

function notify(): void {
  for (const listener of [...listeners]) listener();
}

function ensureLoaded(): void {
  if (loaded || pending) return;
  const mine = ++attempt;
  const wasFailed = failed;
  failed = false;
  const timer = setTimeout(() => giveUp("timeout"), loadTimeoutMs);
  // A failure ends this attempt only if no newer one has started since; a chunk that arrives
  // late still counts (below), so a slow phone recovers by itself.
  const giveUp = (reason: string) => {
    clearTimeout(timer);
    if (loaded || mine !== attempt) return;
    pending = null;
    failed = true;
    notify();
    reportOperationalError("manager_card.renderer", "renderer_load_failed", { reason });
  };
  pending = activeRenderer.load().then(
    (renderer) => {
      clearTimeout(timer);
      if (loaded) return;
      loaded = renderer;
      pending = null;
      failed = false;
      notify();
    },
    () => giveUp("error"),
  );
  if (wasFailed) notify();
}

/**
 * Ask for the renderer again after a failure (the card's « Réessayer »). Nothing happens when it
 * is loaded or already loading. Never loops by itself: one call, one attempt.
 */
export function retryCardRenderer(): void {
  if (loaded) return;
  ensureLoaded();
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

/**
 * True once the renderer's chunk failed to arrive (it errored or took longer than
 * `RENDERER_LOAD_TIMEOUT_MS`) and until a retry succeeds. False on the server and while hydrating.
 */
export function useCardRendererFailed(): boolean {
  return useSyncExternalStore(
    subscribeRenderer,
    () => failed,
    () => false,
  );
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
  failed = false;
  attempt += 1;
  loadTimeoutMs = RENDERER_LOAD_TIMEOUT_MS;
  notify();
}

/** For tests: the load state, and a shorter limit than the real one. */
export const rendererStateForTests = {
  failed: () => failed,
  loaded: () => loaded,
  setTimeoutMs: (ms: number) => void (loadTimeoutMs = ms),
};

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
