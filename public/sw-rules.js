/*
 * BotolaGO service worker: the routing rules, as pure functions.
 *
 * Loaded by /sw.js with importScripts, and by the tests (src/lib/pwa/sw-rules.test.ts)
 * as a CommonJS module, so the rules the worker runs are the rules that are tested.
 * No browser API is used here. Plain ES5-style JS on purpose: it is served as is.
 */
(function (root) {
  "use strict";

  // Bump to drop every cache the previous worker made (old names are deleted on activate).
  var VERSION = "v1";
  var PREFIX = "botolago-";
  var CACHES = {
    shell: PREFIX + "shell-" + VERSION, // the offline page
    assets: PREFIX + "assets-" + VERSION, // fingerprinted build files, fonts, icons
    pages: PREFIX + "pages-" + VERSION, // public pages, last good copy
  };
  var OFFLINE_URL = "/offline.html";
  var MAX_PAGES = 30;

  // Public pages whose last good copy is kept for offline reading. Exact paths.
  var PUBLIC_PAGES = ["/", "/matches", "/matches/standings", "/news", "/clubs"];

  // Never touched by the worker, whatever the method: the browser handles them.
  // Personal or privileged pages, server functions, APIs, and the worker itself.
  var NEVER = [
    /^\/(auth|admin|profile|notifications|settings|fantasy|pronostics|curva|plus|jouer|unsubscribe|suppression-compte|dev|demo|mcp|api|_serverFn|\.mcp|\.well-known|\.lovable|lovable)(\/|$)/,
    /^\/(sw\.js|sw-rules\.js|sitemap\.xml|robots\.txt)$/,
  ];

  var ASSET_PREFIXES = ["/assets/", "/fonts/", "/icons/"];

  function normalizePath(pathname) {
    if (pathname.length > 1 && pathname.charAt(pathname.length - 1) === "/") {
      return pathname.slice(0, -1);
    }
    return pathname;
  }

  function isNever(pathname) {
    for (var i = 0; i < NEVER.length; i++) if (NEVER[i].test(pathname)) return true;
    return false;
  }

  /**
   * What to do with a request.
   *
   * input: { method, url, mode, origin }  (origin = the worker's own origin)
   * returns one of:
   *   "bypass"          do not intercept
   *   "asset"           cache-first (fingerprinted build files, fonts, icons)
   *   "page"            network-first, last good copy when offline, offline page last
   *   "navigation"      network, offline page when offline, nothing stored
   */
  function decide(input) {
    if (!input || String(input.method).toUpperCase() !== "GET") return "bypass";
    var url;
    try {
      url = new URL(input.url);
    } catch (e) {
      return "bypass";
    }
    if (url.origin !== input.origin) return "bypass";
    if (url.protocol !== "https:" && url.hostname !== "localhost") return "bypass";
    var path = normalizePath(url.pathname);
    if (isNever(path)) return "bypass";

    for (var i = 0; i < ASSET_PREFIXES.length; i++) {
      if (path.indexOf(ASSET_PREFIXES[i]) === 0) return "asset";
    }
    if (input.mode === "navigate") {
      return PUBLIC_PAGES.indexOf(path) !== -1 ? "page" : "navigation";
    }
    return "bypass";
  }

  /**
   * Whether a response may be stored. Only complete, same-origin, anonymous,
   * shareable answers: no cookies set, nothing marked private or no-store,
   * nothing that varies on the visitor's cookies.
   *
   * response: { status, type, headers: { get(name) } }
   */
  function isStorable(response) {
    if (!response || response.status !== 200) return false;
    if (response.type && response.type !== "basic") return false;
    // A redirected answer (a sign-in bounce, say) cannot be served to a navigation.
    if (response.redirected) return false;
    var h = response.headers;
    if (!h || typeof h.get !== "function") return false;
    if (h.get("set-cookie")) return false;
    var cc = String(h.get("cache-control") || "").toLowerCase();
    if (/(^|[\s,])(private|no-store)([\s,=]|$)/.test(cc)) return false;
    var vary = String(h.get("vary") || "").toLowerCase();
    if (vary.indexOf("cookie") !== -1 || vary.indexOf("*") !== -1) return false;
    return true;
  }

  /** True for a cache this worker family made but that is not a current one. */
  function isStaleCacheName(name) {
    if (String(name).indexOf(PREFIX) !== 0) return false;
    return name !== CACHES.shell && name !== CACHES.assets && name !== CACHES.pages;
  }

  var api = {
    VERSION: VERSION,
    CACHES: CACHES,
    OFFLINE_URL: OFFLINE_URL,
    MAX_PAGES: MAX_PAGES,
    PUBLIC_PAGES: PUBLIC_PAGES,
    decide: decide,
    isStorable: isStorable,
    isStaleCacheName: isStaleCacheName,
  };

  if (typeof module !== "undefined" && module.exports) module.exports = api;
  root.BotolagoSwRules = api;
})(typeof self !== "undefined" ? self : globalThis);
