/**
 * Behaviour that only applies inside the BotolaGO phone app (Capacitor).
 *
 * The app is a native shell around the live site (see capacitor.config.ts),
 * so this same code runs on the web too. The shell injects `window.Capacitor`
 * before the page loads; without it this does nothing and the Capacitor
 * packages are never downloaded.
 */

type CapacitorGlobal = { isNativePlatform?: () => boolean };

export function isNativeShell(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: CapacitorGlobal }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Wires Android's back button to page history. Returns a cleanup. */
export function installNativeShell(): () => void {
  if (!isNativeShell()) return () => {};
  let removed = false;
  let remove: (() => void) | undefined;
  void import("@capacitor/app").then(({ App }) =>
    App.addListener("backButton", ({ canGoBack }) => {
      if (canGoBack) window.history.back();
      else void App.exitApp();
    }).then((handle) => {
      if (removed) void handle.remove();
      else remove = () => void handle.remove();
    }),
  );
  return () => {
    removed = true;
    remove?.();
  };
}
