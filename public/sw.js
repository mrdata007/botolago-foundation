/*
 * BotolaGO service worker. Rules live in /sw-rules.js (tested); this file only
 * wires them to the fetch events. See docs/engineering/PWA.md, including how to
 * switch it off (replace this file with the kill-switch version described there).
 *
 * What it does:
 *   - keeps /offline.html, so a navigation with no network shows a page, not the
 *     browser's error;
 *   - assets (/assets/*, fonts, icons): cache-first;
 *   - the public pages (/, /matches, /matches/standings, /news, /clubs):
 *     network-first, last good copy when offline;
 *   - everything else is left to the browser. Personal pages, the CMS, auth,
 *     server functions and every Supabase call are never intercepted: the
 *     data calls are POSTs or carry the visitor's token, so they are not cached.
 *
 * It does not call skipWaiting: a new version waits until the open tabs are
 * closed, so no page is swapped under a visitor mid-session.
 */
importScripts("/sw-rules.js");

var R = self.BotolagoSwRules;

self.addEventListener("install", function (event) {
  event.waitUntil(
    caches.open(R.CACHES.shell).then(function (cache) {
      return cache.addAll([
        new Request(R.OFFLINE_URL, { cache: "reload" }),
        new Request("/icons/icon-192.png", { cache: "reload" }),
      ]);
    }),
  );
});

self.addEventListener("activate", function (event) {
  event.waitUntil(
    caches
      .keys()
      .then(function (names) {
        return Promise.all(
          names.filter(R.isStaleCacheName).map(function (name) {
            return caches.delete(name);
          }),
        );
      })
      .then(function () {
        return self.clients.claim();
      }),
  );
});

self.addEventListener("message", function (event) {
  if (event.data && event.data.type === "SKIP_WAITING") self.skipWaiting();
});

function offlineResponse() {
  return caches.match(R.OFFLINE_URL, { cacheName: R.CACHES.shell }).then(function (hit) {
    return (
      hit ||
      new Response("Hors ligne / غير متصل", {
        status: 503,
        headers: { "content-type": "text/plain; charset=utf-8" },
      })
    );
  });
}

function trimPages(cache) {
  return cache.keys().then(function (keys) {
    var extra = keys.length - R.MAX_PAGES;
    var work = [];
    for (var i = 0; i < extra; i++) work.push(cache.delete(keys[i]));
    return Promise.all(work);
  });
}

function cacheFirst(request) {
  return caches.open(R.CACHES.assets).then(function (cache) {
    return cache.match(request).then(function (hit) {
      if (hit) return hit;
      return fetch(request).then(function (response) {
        if (R.isStorable(response)) cache.put(request, response.clone());
        return response;
      });
    });
  });
}

function networkFirstPage(request) {
  return fetch(request)
    .then(function (response) {
      if (R.isStorable(response)) {
        var copy = response.clone();
        caches.open(R.CACHES.pages).then(function (cache) {
          return cache.put(request, copy).then(function () {
            return trimPages(cache);
          });
        });
      }
      return response;
    })
    .catch(function () {
      return caches
        .open(R.CACHES.pages)
        .then(function (cache) {
          return cache.match(request);
        })
        .then(function (hit) {
          return hit || offlineResponse();
        });
    });
}

function networkThenOffline(request) {
  return fetch(request).catch(offlineResponse);
}

self.addEventListener("fetch", function (event) {
  var request = event.request;
  var action = R.decide({
    method: request.method,
    url: request.url,
    mode: request.mode,
    origin: self.location.origin,
  });
  if (action === "asset") event.respondWith(cacheFirst(request));
  else if (action === "page") event.respondWith(networkFirstPage(request));
  else if (action === "navigation") event.respondWith(networkThenOffline(request));
});
