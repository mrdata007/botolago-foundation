/**
 * The site's service worker (FE-H2), served at `/sw.js` by
 * `src/routes/sw[.]js.ts` and registered by `ServiceWorkerRegistration`.
 *
 * It makes the site installable and keeps a second visit from downloading the
 * same files again, and nothing more:
 * - The build's own files (`/assets/*`, named after their contents, so a file
 *   never changes under its name), the self-hosted fonts and the app icons:
 *   from the cache once fetched (cache first).
 * - Pages: always from the network. With no network, the offline page
 *   (`public/offline.html`, French and Arabic) instead of the browser's error.
 *   A page is never kept: it carries live scores and the reader's data.
 * - Everything else goes straight to the network, untouched: Supabase (data,
 *   sign-in, realtime, storage, Edge Functions) is another origin and is never
 *   seen; the site's own server functions, sitemaps and anything not a GET
 *   are passed through.
 *
 * The worker is generated per release (the cache name carries the commit), so
 * a deploy changes the file, the browser installs the new worker, it takes
 * over at once and deletes the old release's cache: no reader is left on old
 * files. A `/sw.js` that answers 404 (this file removed) makes browsers drop
 * the worker altogether.
 */

export const OFFLINE_PATH = "/offline.html";

/** The same-origin paths whose files are kept: content-named, or stable for a release. */
export const CACHED_PATH_PREFIXES = ["/assets/", "/fonts/", "/icons/"] as const;

/** The JavaScript of the worker for one release. */
export function serviceWorkerSource(release: string): string {
  const cacheName = `botolago-static-${release.replace(/[^0-9a-zA-Z_-]/g, "")}`;
  return `// BotolaGO service worker (src/lib/service-worker.ts). Release ${JSON.stringify(release)}.
"use strict";
const CACHE = ${JSON.stringify(cacheName)};
const OFFLINE = ${JSON.stringify(OFFLINE_PATH)};
const CACHED = ${JSON.stringify(CACHED_PATH_PREFIXES)};

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(new Request(OFFLINE, { cache: "reload" })))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((names) =>
        Promise.all(
          names
            .filter((name) => name.startsWith("botolago-") && name !== CACHE)
            .map((name) => caches.delete(name)),
        ),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;
  if (request.method !== "GET") return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === "navigate") {
    event.respondWith(
      fetch(request).catch(() =>
        caches.match(OFFLINE).then((offline) => offline || Response.error()),
      ),
    );
    return;
  }

  if (!CACHED.some((prefix) => url.pathname.startsWith(prefix))) return;
  event.respondWith(
    caches.open(CACHE).then((cache) =>
      cache.match(request).then(
        (hit) =>
          hit ||
          fetch(request).then((response) => {
            if (response.ok && response.type === "basic") cache.put(request, response.clone());
            return response;
          }),
      ),
    ),
  );
});
`;
}
