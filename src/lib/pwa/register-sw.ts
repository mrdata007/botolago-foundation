import { nativePlatform, type NativeScope } from "../native-app";

/**
 * Registers the site's service worker (`public/sw.js`) once, after the page has
 * loaded and the browser is idle. See docs/engineering/PWA.md.
 *
 * Kill switch: set `SERVICE_WORKER_ENABLED` to false and ship. Every browser
 * that still has the worker then unregisters it and deletes its caches on its
 * next visit. If the page itself cannot be shipped, replace `public/sw.js` with
 * the self-unregistering worker in the doc instead.
 */
export const SERVICE_WORKER_ENABLED = true;

export const SERVICE_WORKER_URL = "/sw.js";

/** Path prefixes where no worker is registered from (the CMS and sign-in). */
const EXCLUDED_PATHS = /^\/(admin|auth)(\/|$)/;

export interface PwaEnvironment {
  readonly production: boolean;
  readonly protocol: string;
  readonly hostname: string;
  readonly pathname: string;
  readonly hasServiceWorker: boolean;
  readonly native: boolean;
}

/** Whether this page should register the worker. Pure, so it is tested. */
export function shouldRegisterServiceWorker(env: PwaEnvironment): boolean {
  if (!SERVICE_WORKER_ENABLED) return false;
  if (!env.production || !env.hasServiceWorker || env.native) return false;
  if (env.protocol !== "https:") return false;
  return !EXCLUDED_PATHS.test(env.pathname);
}

function currentEnvironment(): PwaEnvironment {
  return {
    production: import.meta.env.PROD === true,
    protocol: window.location.protocol,
    hostname: window.location.hostname,
    pathname: window.location.pathname,
    hasServiceWorker: "serviceWorker" in navigator,
    native: nativePlatform(globalThis as NativeScope) !== null,
  };
}

async function removeWorkerAndCaches(): Promise<void> {
  const registrations = await navigator.serviceWorker.getRegistrations();
  await Promise.all(registrations.map((registration) => registration.unregister()));
  if ("caches" in window) {
    const names = await caches.keys();
    await Promise.all(names.filter((n) => n.startsWith("botolago-")).map((n) => caches.delete(n)));
  }
}

function whenIdle(task: () => void): void {
  const run = () => {
    if (typeof window.requestIdleCallback === "function") {
      window.requestIdleCallback(task, { timeout: 5000 });
    } else {
      window.setTimeout(task, 2000);
    }
  };
  if (document.readyState === "complete") run();
  else window.addEventListener("load", run, { once: true });
}

/** Call once from the root component's effect. Never throws. */
export function registerServiceWorker(): void {
  try {
    if (typeof window === "undefined" || !("serviceWorker" in navigator)) return;
    if (!SERVICE_WORKER_ENABLED) {
      // Switched off: take the worker and its caches away from returning visitors.
      if (import.meta.env.PROD === true)
        whenIdle(() => void removeWorkerAndCaches().catch(() => {}));
      return;
    }
    if (!shouldRegisterServiceWorker(currentEnvironment())) return;
    whenIdle(() => {
      navigator.serviceWorker
        .register(SERVICE_WORKER_URL, { scope: "/", updateViaCache: "none" })
        .catch(() => {
          // Offline support is an extra: a failed registration changes nothing.
        });
    });
  } catch {
    // Same: never let this break the page.
  }
}
