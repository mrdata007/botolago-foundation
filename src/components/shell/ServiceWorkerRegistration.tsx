import { useEffect } from "react";

import { nativePlatform } from "@/lib/native-app";

/**
 * Registers the site's service worker (`@/lib/service-worker`, FE-H2) once the
 * page has loaded, in a production build in a browser. Renders nothing.
 *
 * Never inside the phone app: it opens the live site in its own web view and
 * has its own offline page (capacitor.config.ts), so there a worker would only
 * get in the way of a fresh site. A worker left there by an earlier visit is
 * removed, with its cache.
 */
export function ServiceWorkerRegistration() {
  useEffect(() => {
    if (!import.meta.env.PROD || !("serviceWorker" in navigator)) return;
    if (nativePlatform() !== null) {
      void navigator.serviceWorker
        .getRegistrations()
        .then((registrations) => registrations.forEach((r) => void r.unregister()))
        .catch(() => undefined);
      void caches
        ?.keys()
        .then((names) =>
          names
            .filter((name) => name.startsWith("botolago-"))
            .forEach((n) => void caches.delete(n)),
        )
        .catch(() => undefined);
      return;
    }
    const register = () => {
      navigator.serviceWorker.register("/sw.js", { scope: "/" }).catch(() => undefined);
    };
    if (document.readyState === "complete") register();
    else window.addEventListener("load", register, { once: true });
    return () => window.removeEventListener("load", register);
  }, []);

  return null;
}
