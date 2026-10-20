import { nativePlatform } from "@/lib/native-app";

let scriptPromise: Promise<void> | undefined;
const requested = new WeakSet<HTMLElement>();
type AdWindow = Window & { adsbygoogle?: { push(value: object): unknown } };

/** One library per page. It is never loaded by the disabled configuration. */
export function loadAdSense(publisherId: string): Promise<void> {
  if (nativePlatform()) return Promise.reject(new Error("Web ads are disabled in the native app"));
  return (scriptPromise ??= new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.id = "botolago-adsense";
    script.async = true;
    script.crossOrigin = "anonymous";
    script.src = `https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=${publisherId}`;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error("AdSense unavailable"));
    document.head.appendChild(script);
  }));
}

/** Guards the actual DOM node, including StrictMode's effect replay. Never auto-refresh ads. */
export function requestAd(element: HTMLElement): void {
  if (
    nativePlatform() ||
    !element.isConnected ||
    element.offsetWidth === 0 ||
    requested.has(element) ||
    element.dataset.adsbygoogleStatus
  )
    return;
  requested.add(element);
  const scope = window as AdWindow;
  (scope.adsbygoogle ??= [] as object[]).push({});
}
