import { describe, expect, it } from "bun:test";
import { CACHED_PATH_PREFIXES, OFFLINE_PATH, serviceWorkerSource } from "./service-worker";

describe("the service worker (FE-H2)", () => {
  const source = serviceWorkerSource("58279273f301f504dc212008d4669d6f72b191bb");

  it("is valid JavaScript", () => {
    expect(() => new Function(source)).not.toThrow();
  });

  it("names its cache after the release, so a deploy replaces it", () => {
    expect(source).toContain('"botolago-static-58279273f301f504dc212008d4669d6f72b191bb"');
    expect(source).toContain('name.startsWith("botolago-") && name !== CACHE');
    expect(source).toContain("self.skipWaiting()");
    expect(source).toContain("self.clients.claim()");
  });

  it("keeps nothing in the cache name but letters, digits, - and _", () => {
    expect(serviceWorkerSource('x"; alert(1); "')).toContain('"botolago-static-xalert1"');
  });

  it("keeps only the site's own files, and the offline page", () => {
    expect(CACHED_PATH_PREFIXES).toEqual(["/assets/", "/fonts/", "/icons/"]);
    expect(OFFLINE_PATH).toBe("/offline.html");
  });

  it("leaves other origins (Supabase) and anything but a GET to the network", () => {
    expect(source).toContain('if (request.method !== "GET") return;');
    expect(source).toContain("if (url.origin !== self.location.origin) return;");
  });

  it("never stores a page: pages come from the network, else the offline page", () => {
    const navigate = source.slice(source.indexOf('request.mode === "navigate"'));
    const branch = navigate.slice(0, navigate.indexOf("return;"));
    expect(branch).toContain("fetch(request).catch(");
    expect(branch).toContain("caches.match(OFFLINE)");
    expect(branch).not.toContain("cache.put");
  });
});
