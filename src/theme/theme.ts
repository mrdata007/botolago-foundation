/**
 * BG-0081 — the theme preference, and the script that applies it before paint.
 *
 * The stylesheet has carried a full dark palette for a long time (`.dark`
 * redeclares every colour-bearing `--ui-*` token, the News gradients and the
 * category plates), but nothing in `src/` ever put the `.dark` class on an
 * element, so none of it was reachable. This module is the missing half.
 *
 * Two rules shape everything here:
 *
 *   1. The class must be on `<html>` BEFORE the first paint, or the page
 *      flashes light and then swaps. A `useEffect` runs after paint, so the
 *      resolution happens in `THEME_INIT_SCRIPT`, an inline script in the
 *      document head (declared from the root route's `head().scripts`).
 *
 *   2. No React component may read `localStorage` or `matchMedia` during its
 *      FIRST render. The server cannot see either, so a first client render
 *      that does disagrees with the server's markup and React throws the whole
 *      server tree away (hydration error #418). This exact defect already bit
 *      `AuthProvider`, which had to stop seeding its state from storage. The
 *      inline script is therefore allowed to touch the DOM directly, and the
 *      React side stays on the SSR-safe default until after mount.
 *
 * The storage key follows the existing convention set by the language
 * preference (`botolago.language`, see `src/i18n/provider.tsx`).
 */

/** What the user picked. "system" follows the OS and keeps following it. */
export type ThemeChoice = "light" | "dark" | "system";

/** What is actually on screen once "system" has been resolved. */
export type ResolvedTheme = "light" | "dark";

/** Per-browser preference key. Matches `botolago.language`'s shape. */
export const THEME_STORAGE_KEY = "botolago.theme";

/** Nothing stored yet → follow the OS. */
export const DEFAULT_THEME_CHOICE: ThemeChoice = "system";

/** The class `src/styles.css` keys its dark palette on. */
export const DARK_CLASS = "dark";

export const DARK_MEDIA_QUERY = "(prefers-color-scheme: dark)";

export const THEME_CHOICES: readonly ThemeChoice[] = ["light", "dark", "system"];

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return value === "light" || value === "dark" || value === "system";
}

/**
 * Read the stored choice. Every access is guarded: `localStorage` throws
 * outright in some privacy modes, and the product must still render.
 */
export function readStoredTheme(): ThemeChoice | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return isThemeChoice(raw) ? raw : null;
  } catch {
    return null;
  }
}

/** Persist the choice. A failure is not an error the user needs to see. */
export function writeStoredTheme(choice: ThemeChoice): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, choice);
  } catch {
    /* privacy mode / storage disabled — the session still works, it just
       will not be remembered next time. */
  }
}

/** Does the OS currently ask for dark? `false` when we cannot tell. */
export function systemPrefersDark(): boolean {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") return false;
  try {
    return window.matchMedia(DARK_MEDIA_QUERY).matches;
  } catch {
    return false;
  }
}

/** Fold a choice plus the OS state into the theme that is actually shown. */
export function resolveTheme(choice: ThemeChoice, prefersDark: boolean): ResolvedTheme {
  if (choice === "light") return "light";
  if (choice === "dark") return "dark";
  return prefersDark ? "dark" : "light";
}

/**
 * Put (or take) the class on `<html>`. Idempotent, and safe to call from an
 * effect: it never runs during render, so it cannot affect hydration.
 */
export function applyResolvedTheme(theme: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.toggle(DARK_CLASS, theme === "dark");
  // Native controls, scrollbars and form widgets follow `color-scheme`, not
  // our tokens; without this a dark page still gets a white scrollbar.
  root.style.colorScheme = theme;
}

/**
 * Read back what the inline script already decided, from the DOM.
 *
 * This is how a component learns the theme without touching `localStorage` or
 * `matchMedia` itself — but it is still only called AFTER mount, never during
 * the first render, because the server-rendered `<html>` has no class.
 */
export function readAppliedTheme(): ResolvedTheme {
  if (typeof document === "undefined") return "light";
  return document.documentElement.classList.contains(DARK_CLASS) ? "dark" : "light";
}

/**
 * The inline head script, as source text.
 *
 * Constraints it has to satisfy, all of them load-bearing:
 *   - it runs before the first paint, so it is small and synchronous;
 *   - every storage / matchMedia access is individually try/caught, because a
 *     throw here would leave the document unstyled for the whole session;
 *   - it contains no `</` sequence, so it cannot terminate its own `<script>`;
 *   - it writes the same class the React side will later agree on, so nothing
 *     moves after hydration.
 *
 * It is declared FLAT in the root route's head — `{ children: THEME_INIT_SCRIPT }`
 * — because the router builds the `<script>` element itself, turning every key
 * except `children` into an attribute and writing `children` with
 * `dangerouslySetInnerHTML`. A `{ tag, attrs, children }` shape is not what the
 * router reads and would silently render nothing.
 */
export const THEME_INIT_SCRIPT = `(function(){try{var e=document.documentElement,s=null;try{s=window.localStorage.getItem(${JSON.stringify(
  THEME_STORAGE_KEY,
)})}catch(x){}var d;if(s==="dark"){d=true}else if(s==="light"){d=false}else{d=false;try{d=window.matchMedia(${JSON.stringify(
  DARK_MEDIA_QUERY,
)}).matches}catch(x){}}e.classList.toggle(${JSON.stringify(
  DARK_CLASS,
)},d);e.style.colorScheme=d?"dark":"light"}catch(x){}})();`;
