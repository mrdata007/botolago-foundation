/**
 * BG-0081 — the React side of the theme preference.
 *
 * Read `src/theme/theme.ts` first: the inline head script has already resolved
 * the theme and put the class on `<html>` by the time any of this runs. This
 * provider exists only so the Profile control can show, and change, what was
 * chosen. It deliberately does the least possible:
 *
 *   - First render (server AND client) returns the SSR-safe default. It does
 *     not read `localStorage` and it does not call `matchMedia`, because a
 *     first client render that sees something the server could not makes React
 *     discard the entire server tree (hydration error #418).
 *   - After mount it upgrades to the stored choice and to what the script
 *     actually applied to the DOM.
 *   - While "system" is selected it listens to the OS media query, so changing
 *     the system theme is followed live, with no reload.
 */

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import { DARK_MODE_ENABLED } from "@/lib/feature-flags";
import { withViewTransition } from "@/lib/motion";
import { systemBars } from "@/lib/system-bars";

import {
  DARK_MEDIA_QUERY,
  DEFAULT_THEME_CHOICE,
  applyResolvedTheme,
  readAppliedTheme,
  readStoredTheme,
  resolveTheme,
  systemPrefersDark,
  writeStoredTheme,
  type ResolvedTheme,
  type ThemeChoice,
} from "./theme";

interface ThemeContextValue {
  /** What the user picked: light, dark, or follow the system. */
  choice: ThemeChoice;
  /** What is on screen right now. */
  resolved: ResolvedTheme;
  /** False until the stored choice has been read, after mount. */
  isHydrated: boolean;
  setChoice: (next: ThemeChoice) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  // SSR and the first client render MUST produce the same tree, so both start
  // from the default. Nothing here reads storage or a media query.
  const [choice, setChoiceState] = useState<ThemeChoice>(DEFAULT_THEME_CHOICE);
  const [resolved, setResolved] = useState<ResolvedTheme>("light");
  const [isHydrated, setIsHydrated] = useState(false);

  // Mount: adopt the stored choice, and take the resolved theme from what the
  // inline script already wrote onto <html> rather than recomputing it.
  useEffect(() => {
    // While dark mode is off the provider stays inert: no stored choice is
    // adopted and nothing is written to <html>, so a browser carrying a
    // "dark" value from a preview build still renders light.
    if (!DARK_MODE_ENABLED) return;
    const stored = readStoredTheme();
    if (stored) setChoiceState(stored);
    setResolved(readAppliedTheme());
    setIsHydrated(true);
  }, []);

  // Keep <html> in step with the choice. Runs only after mount, so it cannot
  // disturb hydration; on the very first pass it re-asserts exactly what the
  // inline script already set, which is a no-op.
  useEffect(() => {
    if (!DARK_MODE_ENABLED || !isHydrated) return;
    const next = resolveTheme(choice, systemPrefersDark());
    applyResolvedTheme(next);
    setResolved(next);
  }, [choice, isHydrated]);

  // "System" stays live: a change to the OS theme is followed without a reload.
  useEffect(() => {
    if (!DARK_MODE_ENABLED || !isHydrated || choice !== "system") return;
    if (typeof window === "undefined" || typeof window.matchMedia !== "function") return;
    let query: MediaQueryList;
    try {
      query = window.matchMedia(DARK_MEDIA_QUERY);
    } catch {
      return;
    }
    const onChange = (event: MediaQueryListEvent) => {
      const next = resolveTheme("system", event.matches);
      applyResolvedTheme(next);
      setResolved(next);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, [choice, isHydrated]);

  // The phone app's status bar follows the theme on screen, not the phone's
  // own setting (BG-0154, `src/lib/system-bars.ts`). Every path above ends in
  // `resolved` (start-up, a choice, the phone changing under "system"), so
  // this one effect follows all three. Nothing happens in a browser. While
  // dark mode is off, `resolved` stays "light", which is what the app shows.
  useEffect(() => {
    if (DARK_MODE_ENABLED && !isHydrated) return;
    systemBars.setTheme(resolved);
  }, [resolved, isHydrated]);

  const setChoice = useCallback((next: ThemeChoice) => {
    // The page cross-fades into the new theme rather than flashing. (While dark
    // mode is off nothing changes on the page, so there is nothing to fade.)
    if (DARK_MODE_ENABLED) withViewTransition(() => setChoiceState(next));
    else setChoiceState(next);
    writeStoredTheme(next);
  }, []);

  const value = useMemo<ThemeContextValue>(
    () => ({ choice, resolved, isHydrated, setChoice }),
    [choice, resolved, isHydrated, setChoice],
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
