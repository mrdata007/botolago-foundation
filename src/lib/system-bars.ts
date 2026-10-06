/**
 * BG-0154 — the phone app's status bar follows the theme the app shows.
 *
 * The shell draws the page under a transparent status bar (`viewport-fit=cover`,
 * BG-0151), and the clock and icons on it are drawn in whatever style the
 * native side was last given. Left alone that is Capacitor's `DEFAULT`, which
 * follows the PHONE's light or dark setting. Since the app has its own choice
 * (Profile > Apparence: Clair, Sombre, Système), the two disagree whenever the
 * reader picks differently from their phone, and the icons come out dark on a
 * dark bar or light on a light one, on every screen.
 *
 * So the app tells the shell, through Capacitor 8's built-in `SystemBars`
 * plugin (in `@capacitor/core`, nothing to install): dark icons on the light
 * theme, light icons on the dark theme. A screen whose top is a dark band in
 * both themes (the sign-in screens on a phone, the Landing page, the launch
 * splash) holds light icons for as long as it is mounted (`useDarkStatusBand`).
 *
 * CAPACITOR'S NAMING IS INVERTED, and it is worth stating once: the style is
 * named after the BACKGROUND it suits, not the icons. `SystemBarsStyle.Dark`
 * is "light system bar content on a dark background" and `SystemBarsStyle.Light`
 * is "dark system bar content on a light background" (the enum's own docs in
 * `@capacitor/core` 8.5.2). Read from the native sources as well, not trusted
 * from the docs: iOS maps `DARK` to `.lightContent` and `LIGHT` to
 * `.darkContent` (`SystemBars.swift`), and Android passes
 * `setAppearanceLightStatusBars(!style.equals("DARK"))` (`SystemBars.java`),
 * where a "light appearance" means dark icons. Code here speaks in ICON colours
 * (`"light"` / `"dark"`) and converts at the one call site.
 *
 * Per platform, also from those sources:
 *   - iPhone: `setStyle` ignores `bar` and always styles the status bar (the
 *     home indicator colours itself), so it gets one call. It needs
 *     `UIViewControllerBasedStatusBarAppearance` in `Info.plist`, which
 *     Capacitor 8's iOS template already sets to YES.
 *   - Android: without `bar` the style goes to the status AND navigation bars.
 *     A dark band is only at the top, so the two get a call each: the status
 *     bar the band's or the theme's style, the navigation bar the theme's.
 *
 * Only inside the app. In a browser and on the server `nativePlatform()` is
 * null, nothing is loaded (the `@capacitor/core` chunk is imported on demand)
 * and nothing is called.
 */

import type { SystemBarsStyle, SystemBarsStyleOptions, SystemBarType } from "@capacitor/core";
import { useEffect } from "react";

import { nativePlatform, type NativePlatform } from "@/lib/native-app";
import type { ResolvedTheme } from "@/theme/theme";

/** The colour the status bar's clock and icons are drawn in. */
export type BarIcons = "light" | "dark";

/** Dark icons on the light theme, light icons on the dark one. */
export function iconsForTheme(theme: ResolvedTheme): BarIcons {
  return theme === "dark" ? "light" : "dark";
}

/** What this module needs from `@capacitor/core`. */
export interface SystemBarsModule {
  readonly SystemBars: { setStyle(options: SystemBarsStyleOptions): Promise<void> };
  readonly SystemBarsStyle: typeof SystemBarsStyle;
  readonly SystemBarType: typeof SystemBarType;
}

export interface SystemBarsDeps {
  /** The phone the page runs in; null in a browser and on the server. */
  readonly platform: () => NativePlatform | null;
  /** Capacitor's core library, loaded only once something has to be sent. */
  readonly load: () => Promise<SystemBarsModule>;
}

export interface SystemBarsSync {
  /** The theme now on screen. Called at start-up and on every change. */
  setTheme(theme: ResolvedTheme): void;
  /**
   * Light icons whatever the theme, until the returned function is called. For
   * a screen whose top is dark in both themes. Holds nest; releasing twice is
   * harmless.
   */
  holdDarkBand(): () => void;
}

export function createSystemBarsSync(deps: SystemBarsDeps): SystemBarsSync {
  let theme: ResolvedTheme | null = null;
  let darkBands = 0;
  /** What was last sent, so the same state is never sent twice in a row. */
  let sent: string | null = null;
  /** One call after another, so the last state asked for is the last applied. */
  let queue: Promise<void> = Promise.resolve();
  let scheduled = false;

  /**
   * Changes made in one go are settled together, at the end of the current
   * task, and only the state they leave is compared with what was sent. Moving
   * from one sign-in screen to the next unmounts one `AuthShell` (a release)
   * and mounts the next (a hold) in the same commit; sent one by one, that
   * would flick the icons dark and back. (React's StrictMode does the same to
   * every hold in development.)
   */
  const sync = () => {
    if (scheduled) return;
    scheduled = true;
    queueMicrotask(() => {
      scheduled = false;
      flush();
    });
  };

  const flush = () => {
    const platform = deps.platform();
    if (!platform) return;
    // Under a dark band the status bar is light whatever the theme. Otherwise
    // nothing is sent until the theme on screen is known.
    const status: BarIcons | null = darkBands > 0 ? "light" : theme ? iconsForTheme(theme) : null;
    if (!status) return;
    const navigation: BarIcons | null = theme ? iconsForTheme(theme) : null;
    const key = platform === "android" ? `${status}/${navigation ?? "-"}` : status;
    if (key === sent) return;
    sent = key;
    queue = queue
      .then(async () => {
        const { SystemBars, SystemBarsStyle: Style, SystemBarType: Bar } = await deps.load();
        // Named after the background (see above): light icons are `Dark`.
        const style = (icons: BarIcons) => (icons === "light" ? Style.Dark : Style.Light);
        if (platform === "android") {
          await SystemBars.setStyle({ style: style(status), bar: Bar.StatusBar });
          if (navigation) {
            await SystemBars.setStyle({ style: style(navigation), bar: Bar.NavigationBar });
          }
        } else {
          await SystemBars.setStyle({ style: style(status) });
        }
      })
      .catch(() => {
        // An app build without the plugin, or a bridge error: nothing to show
        // the reader. Forget what was "sent" so the next change tries again.
        if (sent === key) sent = null;
      });
  };

  return {
    setTheme(next) {
      theme = next;
      sync();
    },
    holdDarkBand() {
      darkBands += 1;
      sync();
      let released = false;
      return () => {
        if (released) return;
        released = true;
        darkBands -= 1;
        sync();
      };
    },
  };
}

/** The app's one instance: the real phone check, and `@capacitor/core` on demand. */
export const systemBars: SystemBarsSync = createSystemBarsSync({
  platform: () => nativePlatform(),
  load: () => import("@capacitor/core"),
});

/** What `holdDarkBandWhile` needs from a `MediaQueryList`. */
export interface MediaQueryLike {
  readonly matches: boolean;
  addEventListener(type: "change", listener: () => void): void;
  removeEventListener(type: "change", listener: () => void): void;
}

/**
 * Holds a dark band for as long as `query` matches, following it live, until
 * the returned function is called. For a screen whose top is dark only at some
 * widths: the sign-in screens' band spans the screen on a phone, but wider
 * than its 480px column the flat page is under the clock and the icons.
 */
export function holdDarkBandWhile(
  bars: Pick<SystemBarsSync, "holdDarkBand">,
  query: MediaQueryLike,
): () => void {
  let release: (() => void) | null = null;
  const follow = () => {
    if (query.matches && !release) release = bars.holdDarkBand();
    else if (!query.matches && release) {
      release();
      release = null;
    }
  };
  follow();
  query.addEventListener("change", follow);
  return () => {
    query.removeEventListener("change", follow);
    release?.();
    release = null;
  };
}

/**
 * For a screen whose top is a dark band in both themes: while it is mounted,
 * the status bar keeps light icons. With `media`, only while that media query
 * matches (read in the same effect, so a phone never sees the theme's icons
 * first). Does nothing in a browser.
 */
export function useDarkStatusBand(media?: string): void {
  useEffect(() => {
    if (!media || typeof window === "undefined" || typeof window.matchMedia !== "function") {
      return systemBars.holdDarkBand();
    }
    return holdDarkBandWhile(systemBars, window.matchMedia(media));
  }, [media]);
}
