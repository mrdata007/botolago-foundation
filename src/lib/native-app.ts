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
