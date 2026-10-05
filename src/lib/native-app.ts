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
