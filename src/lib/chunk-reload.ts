/**
 * "Réessayer" on the error screen, for the one error it cannot fix by itself:
 * a page file (a lazy chunk) that failed to download.
 *
 * Re-running the router does not help there. The lazy route component keeps
 * the rejection it was handed and throws it again on every render, and a
 * browser that still caches failed module fetches answers a second `import()`
 * of the same URL from that cache, so on a phone whose network came back the
 * visitor tapped "Réessayer" for as long as they liked and only a reload
 * recovered (state sweep 2026-10-16, E5). So for that error, and only that
 * one, the button reloads the page.
 *
 * The router already does one reload of its own when a lazy component fails
 * (keyed on the error message, once per tab for the life of the tab). This is
 * the visitor's own tap, one step later, so it is a separate, short-lived
 * guard: one reload per minute per tab. A file that is really gone then costs
 * a visitor who taps and taps one reload a minute, and every tap in between
 * takes the ordinary path, which keeps the screen usable ("Retour à
 * l'accueil" is a plain link and always works). Nothing here reloads without
 * a tap.
 */

/**
 * What browsers say when a lazy `import()` fails: Chromium ("Failed to fetch
 * dynamically imported module"), Firefox ("error loading dynamically imported
 * module"), Safari ("Importing a module script failed"), Vite's preload
 * helper for a stylesheet, and webpack-style names for good measure. The same
 * three prefixes the router itself recognises (`isModuleNotFoundError`).
 */
const CHUNK_LOAD_MESSAGE =
  /failed to fetch dynamically imported module|error loading dynamically imported module|importing a module script failed|unable to preload css|loading (?:css )?chunk [\w-]+ failed/i;

/** True when `error` is a page file that did not download. */
export function isChunkLoadError(error: unknown): boolean {
  if (error === null || error === undefined) return false;
  if (typeof error === "string") return CHUNK_LOAD_MESSAGE.test(error);
  const { name, message } = error as { name?: unknown; message?: unknown };
  if (name === "ChunkLoadError") return true;
  return typeof message === "string" && CHUNK_LOAD_MESSAGE.test(message);
}

export const CHUNK_RELOAD_KEY = "botolago.chunk-reload-at";
export const CHUNK_RELOAD_WINDOW_MS = 60_000;

type ReloadStore = Pick<Storage, "getItem" | "setItem">;

export interface ChunkReloadGuard {
  /** True once per window: the caller may reload now, and the guard remembers it did. */
  claim(): boolean;
}

/**
 * The loop guard. `getStorage` is a function because even reading
 * `window.sessionStorage` can throw (blocked site data, some private windows),
 * and a guard that cannot be built must not take the error screen down with
 * it. With no usable storage the reload is allowed once per page load: the
 * reload itself empties that memory, so the guard is best effort there, which
 * is acceptable because only a tap can reach it.
 */
export function createChunkReloadGuard({
  getStorage,
  now = () => Date.now(),
  windowMs = CHUNK_RELOAD_WINDOW_MS,
}: {
  getStorage: () => ReloadStore | null | undefined;
  now?: () => number;
  windowMs?: number;
}): ChunkReloadGuard {
  let claimedInThisPage = false;
  return {
    claim() {
      if (claimedInThisPage) return false;
      const at = now();
      try {
        const store = getStorage();
        if (store) {
          const last = Number(store.getItem(CHUNK_RELOAD_KEY));
          // A mark from the future (a clock that moved back) is not a recent reload.
          if (Number.isFinite(last) && last > 0 && last <= at && at - last < windowMs) {
            return false;
          }
          store.setItem(CHUNK_RELOAD_KEY, String(at));
        }
      } catch {
        // Storage refused: fall through to the once-per-page allowance.
      }
      claimedInThisPage = true;
      return true;
    },
  };
}

const pageGuard = createChunkReloadGuard({
  getStorage: () => (typeof window === "undefined" ? null : window.sessionStorage),
});

/**
 * What "Réessayer" does. Returns "reloaded" when it asked the browser for a
 * fresh page (nothing after that matters), "retried" for the ordinary path.
 */
export function retryAfterError(
  error: unknown,
  {
    invalidate,
    reset,
    reload = () => window.location.reload(),
    guard = pageGuard,
  }: {
    invalidate: () => void;
    reset: () => void;
    reload?: () => void;
    guard?: ChunkReloadGuard;
  },
): "reloaded" | "retried" {
  if (isChunkLoadError(error) && guard.claim()) {
    reload();
    return "reloaded";
  }
  invalidate();
  reset();
  return "retried";
}
