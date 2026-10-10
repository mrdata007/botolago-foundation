/**
 * Whether the page is running inside the BotolaGO phone app (the Capacitor
 * shell around the site) rather than in a browser, and on which phone.
 *
 * The shell's native side puts a bridge on the page before the site's own code
 * runs: `androidBridge` on Android, `webkit.messageHandlers.bridge` on iPhone
 * (the same two markers Capacitor's own core reads). The `Capacitor` object that
 * says "native platform" is only added once the Capacitor library has loaded,
 * and the site loads that library only inside the app, on demand, so it is used
 * when it is there but never waited for. A browser, and the server rendering the
 * page, have neither and get `null`.
 */
export type NativePlatform = "ios" | "android";

interface CapacitorGlobal {
  readonly isNativePlatform?: () => boolean;
  readonly getPlatform?: () => string;
  readonly isPluginAvailable?: (name: string) => boolean;
  /** One entry per native plugin compiled into this app, put on the page by the shell. */
  readonly PluginHeaders?: ReadonlyArray<{ readonly name?: unknown }>;
}

export interface NativeScope {
  readonly Capacitor?: CapacitorGlobal;
  readonly androidBridge?: unknown;
  readonly webkit?: { readonly messageHandlers?: { readonly bridge?: unknown } };
}

function supported(platform: string | undefined): NativePlatform | null {
  return platform === "ios" || platform === "android" ? platform : null;
}

export function nativePlatform(
  scope: NativeScope = globalThis as NativeScope,
): NativePlatform | null {
  try {
    const capacitor = scope.Capacitor;
    if (capacitor?.isNativePlatform) {
      return capacitor.isNativePlatform() ? supported(capacitor.getPlatform?.()) : null;
    }
    if (scope.androidBridge) return "android";
    if (scope.webkit?.messageHandlers?.bridge) return "ios";
    return null;
  } catch {
    return null;
  }
}

/**
 * Whether the running app contains the native plugin `name` (its `jsName`:
 * "Share", "Filesystem", "Media" …). Always `false` in a browser and on the
 * server, even for a plugin that has a web version.
 *
 * The app loads the live site, so an app built before a plugin was added runs
 * today's site without it: a button that needs a plugin must ask first, or it
 * would do nothing there. The shell lists the plugins it was built with in
 * `Capacitor.PluginHeaders` before the site's code runs. That list is what
 * Capacitor's library answers `isPluginAvailable` from for a native plugin,
 * and it is read here directly: until the library has loaded (the site loads
 * it only inside the app, on demand), the shell's own `isPluginAvailable`
 * says `false` for every plugin nothing has registered yet. It is only asked
 * when there is no list at all.
 */
export function nativePluginAvailable(
  name: string,
  scope: NativeScope = globalThis as NativeScope,
): boolean {
  try {
    if (!nativePlatform(scope)) return false;
    const capacitor = scope.Capacitor;
    const headers = capacitor?.PluginHeaders;
    if (Array.isArray(headers)) return headers.some((header) => header?.name === name);
    return capacitor?.isPluginAvailable?.(name) === true;
  } catch {
    return false;
  }
}

/**
 * On `<html>` from before the first paint when the page runs inside the app,
 * set to the platform (`ios` or `android`). Absent in a browser and in the
 * server's HTML.
 */
export const NATIVE_APP_ATTRIBUTE = "data-native-app";

/**
 * The inline head script that puts `NATIVE_APP_ATTRIBUTE` on `<html>`, as
 * source text: `nativePlatform()` restated as a few lines of ES5, because a
 * head script runs before any bundle and cannot import it (the tests run both
 * over the same cases so the two cannot drift).
 *
 * Why before the first paint: what is shown only outside the app (Google and
 * Apple sign-in, "Télécharger l'image") is in the server's HTML, which cannot
 * know where it will be opened. `src/styles.css` hides it under this
 * attribute, so the app never shows it, not even for the frame before React
 * starts, while the server markup and the first client render stay identical.
 * React reads the decision back after mount (`useInNativeApp`), the way the
 * theme and the splash scripts are read back.
 *
 * Same constraints as those two: small, synchronous, everything inside the
 * try, and no `</` sequence, so it cannot close its own `<script>`.
 */
export const NATIVE_APP_INIT_SCRIPT = `(function(){try{var w=window,p=null,c=w.Capacitor;if(c&&c.isNativePlatform){if(c.isNativePlatform()){var g=c.getPlatform&&c.getPlatform();if(g==="ios"||g==="android")p=g}}else if(w.androidBridge)p="android";else if(w.webkit&&w.webkit.messageHandlers&&w.webkit.messageHandlers.bridge)p="ios";if(p)document.documentElement.setAttribute(${JSON.stringify(
  NATIVE_APP_ATTRIBUTE,
)},p)}catch(x){}})();`;
