# Installable site and offline page (PWA)

The website can be added to a phone's home screen and shows an offline page
when there is no network. Web push, store pipelines and install banners are not
part of it.

## Parts

| File                           | Role                                                                                                       |
| ------------------------------ | ---------------------------------------------------------------------------------------------------------- |
| `public/manifest.webmanifest`  | Name, icons, `start_url` `/?source=pwa`, `standalone`, colours. Linked from the root head.                 |
| `public/icons/`                | 192, 512 and maskable 512 icons, drawn from `src/assets/brand/botolago-mark-color.svg` on the light plate. |
| `public/sw.js`                 | The worker: install, activate, fetch wiring.                                                               |
| `public/sw-rules.js`           | The routing rules as pure functions, loaded by `sw.js` with `importScripts` and by the tests.              |
| `public/offline.html`          | French and Arabic page shown for a navigation with no network. Precached on install.                       |
| `src/lib/pwa/register-sw.ts`   | Registers the worker once after load, when idle.                                                           |
| `src/lib/pwa/sw-rules.test.ts` | `bun test src/lib/pwa`                                                                                     |

`theme-color` (`#0c3164`, the brand blue) is in the root head. It is the same
value as the manifest's `theme_color`; change both together.

## What is cached

- `/assets/*`, `/fonts/*`, `/icons/*`: cache-first.
- `/`, `/matches`, `/matches/standings`, `/news`, `/clubs`: network first, the
  last good copy when offline (at most 30 entries), the offline page after that.
- Any other same-origin navigation: network, the offline page when offline.
  Nothing is stored.
- Stored only if the answer is a 200 from this origin, not redirected, with no
  `Set-Cookie`, no `private` or `no-store` in `Cache-Control` and no
  `Vary: Cookie`.

## What is never touched

Everything that is not a GET to this origin; `/auth`, `/admin`, `/profile`,
`/notifications`, `/settings`, `/fantasy`, `/pronostics`, `/curva`, `/plus`,
`/jouer`, `/unsubscribe`, `/suppression-compte`, `/dev`, `/demo`, `/mcp`,
`/api`, `/_serverFn`; the worker's own files, `sitemap.xml`, `robots.txt`.
Supabase calls go to another origin, so the worker never sees them: no
fixture or standings data is cached by it (the pages are, as rendered).
`bun test src/lib/pwa` fails if these rules change by accident.

## When it registers

Only in a production build, on https, in a browser (never inside the Capacitor
phone app, which has its own offline page, `mobile/www/offline.html`), and not
from `/admin` or `/auth` pages. Registration uses `updateViaCache: "none"`, so
the browser checks `sw.js` and `sw-rules.js` against the network every time.

A new version waits until the open tabs are closed (no `skipWaiting`), so a page
is never swapped under a visitor mid-session. To change what is cached, edit
`sw-rules.js` and bump `VERSION` there: the old caches are deleted on activate.

## Rollback

1. Preferred: set `SERVICE_WORKER_ENABLED = false` in `src/lib/pwa/register-sw.ts`
   and ship. Returning browsers unregister the worker and delete the
   `botolago-*` caches on their next visit.
2. If that cannot ship, replace `public/sw.js` with the following and ship it.
   Every browser fetches `sw.js` on its next visit, runs this, and the worker
   removes itself:

   ```js
   self.addEventListener("install", () => self.skipWaiting());
   self.addEventListener("activate", (event) => {
     event.waitUntil(
       caches
         .keys()
         .then((names) =>
           Promise.all(names.filter((n) => n.startsWith("botolago-")).map((n) => caches.delete(n))),
         )
         .then(() => self.registration.unregister())
         .then(() => self.clients.matchAll({ type: "window" }))
         .then((clients) => clients.forEach((c) => c.navigate(c.url))),
     );
   });
   ```

Keep the file served at `/sw.js` until the rollback has been live long enough
(a few weeks) for returning visitors to pick it up.

## Headers

`src/lib/response-headers.ts` sets only `frame-ancestors 'self'` as a
content-security-policy, so it does not restrict `worker-src`, `manifest-src`
or `script-src`; nothing needed changing. `withSiteHeaders` runs on the app's
own responses; static files from `public/` are served by the host, which the
app cannot add headers to. The worker does not depend on it: `updateViaCache:
"none"` makes browsers bypass the HTTP cache for `sw.js` regardless. If the host
allows a headers file, give `/sw.js` and `/sw-rules.js` `Cache-Control: no-cache`.
