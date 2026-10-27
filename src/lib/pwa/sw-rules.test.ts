import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";

import { shouldRegisterServiceWorker, type PwaEnvironment } from "./register-sw";

// The worker's own rules file, exactly as it is served.
const rules = (() => {
  const scope: { BotolagoSwRules?: unknown } = {};
  // The file attaches itself to the scope it is given, as it does in the worker.
  new Function("self", readFileSync("public/sw-rules.js", "utf8"))(scope);
  return scope.BotolagoSwRules;
})() as {
  CACHES: Record<string, string>;
  decide: (input: { method: string; url: string; mode?: string; origin: string }) => string;
  isStorable: (r: unknown) => boolean;
  isStaleCacheName: (name: string) => boolean;
};

const ORIGIN = "https://botolago.com";
const decide = (path: string, mode = "navigate", method = "GET", origin = ORIGIN) =>
  rules.decide({ method, url: ORIGIN + path, mode, origin });

function response(init: {
  status?: number;
  type?: string;
  redirected?: boolean;
  headers?: object;
}) {
  const map = new Map(
    Object.entries(init.headers ?? {}).map(([k, v]) => [k.toLowerCase(), String(v)]),
  );
  return {
    status: init.status ?? 200,
    type: init.type ?? "basic",
    redirected: init.redirected ?? false,
    headers: { get: (name: string) => map.get(name.toLowerCase()) ?? null },
  };
}

describe("decide", () => {
  test("personal, auth, admin and data paths are never intercepted", () => {
    for (const path of [
      "/auth/login",
      "/admin",
      "/admin/users",
      "/profile",
      "/profile/security",
      "/notifications",
      "/settings",
      "/fantasy",
      "/fantasy/team",
      "/pronostics/ligues",
      "/_serverFn/abc",
      "/api/x",
      "/mcp",
      "/sw.js",
    ]) {
      expect(decide(path)).toBe("bypass");
      expect(decide(path, "cors")).toBe("bypass");
    }
  });

  test("only GET is handled", () => {
    expect(decide("/matches", "navigate", "POST")).toBe("bypass");
    expect(decide("/assets/app-abc123.js", "no-cors", "POST")).toBe("bypass");
  });

  test("other origins (Supabase, analytics) are not handled", () => {
    expect(
      rules.decide({
        method: "GET",
        url: "https://abc.supabase.co/rest/v1/fixtures",
        mode: "cors",
        origin: ORIGIN,
      }),
    ).toBe("bypass");
  });

  test("build files, fonts and icons are cache-first", () => {
    expect(decide("/assets/index-Dk3j2.js", "no-cors")).toBe("asset");
    expect(decide("/fonts/manrope-latin-wght-normal.woff2", "cors")).toBe("asset");
    expect(decide("/icons/icon-192.png", "no-cors")).toBe("asset");
  });

  test("the public pages are network-first with a stored copy", () => {
    for (const path of ["/", "/matches", "/matches/standings", "/news", "/clubs", "/news/"]) {
      expect(decide(path)).toBe("page");
    }
  });

  test("another navigation falls back to the offline page without storing anything", () => {
    expect(decide("/matches/123")).toBe("navigation");
    expect(decide("/news/some-article")).toBe("navigation");
  });

  test("a sub-resource that is not an asset is left alone", () => {
    expect(decide("/matches", "cors")).toBe("bypass");
    expect(decide("/random.json", "cors")).toBe("bypass");
  });

  test("plain http is not handled except on localhost", () => {
    expect(
      rules.decide({
        method: "GET",
        url: "http://botolago.com/",
        mode: "navigate",
        origin: "http://botolago.com",
      }),
    ).toBe("bypass");
  });
});

describe("isStorable", () => {
  test("a plain 200 is", () => {
    expect(rules.isStorable(response({}))).toBe(true);
  });

  test("never with cookies, private or no-store, redirects, errors or opaque", () => {
    expect(rules.isStorable(response({ headers: { "set-cookie": "a=b" } }))).toBe(false);
    expect(rules.isStorable(response({ headers: { "cache-control": "private, no-store" } }))).toBe(
      false,
    );
    expect(rules.isStorable(response({ headers: { "cache-control": "no-store" } }))).toBe(false);
    expect(rules.isStorable(response({ headers: { "cache-control": "private" } }))).toBe(false);
    expect(rules.isStorable(response({ headers: { vary: "Cookie" } }))).toBe(false);
    expect(rules.isStorable(response({ redirected: true }))).toBe(false);
    expect(rules.isStorable(response({ status: 500 }))).toBe(false);
    expect(rules.isStorable(response({ type: "opaque" }))).toBe(false);
    expect(rules.isStorable(null)).toBe(false);
  });

  test("public caching headers are fine", () => {
    expect(
      rules.isStorable(
        response({ headers: { "cache-control": "public, max-age=60, s-maxage=300" } }),
      ),
    ).toBe(true);
  });
});

describe("cache names", () => {
  test("old versions are stale, current ones and other sites' caches are not", () => {
    expect(rules.isStaleCacheName("botolago-assets-v0")).toBe(true);
    expect(rules.isStaleCacheName(rules.CACHES.assets)).toBe(false);
    expect(rules.isStaleCacheName(rules.CACHES.pages)).toBe(false);
    expect(rules.isStaleCacheName("something-else")).toBe(false);
  });
});

describe("public/sw.js", () => {
  const source = readFileSync("public/sw.js", "utf8");

  test("takes its rules from sw-rules.js and does not decide on its own", () => {
    expect(source).toContain('importScripts("/sw-rules.js")');
    expect(source).toContain("R.decide(");
  });

  test("never forces an update mid-session", () => {
    // skipWaiting only on an explicit message, never in install/activate.
    const install = source.slice(source.indexOf('"install"'), source.indexOf('"message"'));
    expect(install).not.toContain("skipWaiting");
  });

  test("precaches the offline page that exists", () => {
    expect(source).toContain("R.OFFLINE_URL");
    expect(readFileSync("public/offline.html", "utf8")).toContain("غير متصل");
  });
});

describe("manifest", () => {
  const manifest = JSON.parse(readFileSync("public/manifest.webmanifest", "utf8"));
  test("is installable", () => {
    expect(manifest.display).toBe("standalone");
    expect(manifest.start_url).toBe("/?source=pwa");
    expect(manifest.scope).toBe("/");
    const sizes = manifest.icons.map(
      (i: { sizes: string; purpose: string }) => `${i.sizes}:${i.purpose}`,
    );
    expect(sizes).toContain("192x192:any");
    expect(sizes).toContain("512x512:any");
    expect(sizes).toContain("512x512:maskable");
  });
});

describe("shouldRegisterServiceWorker", () => {
  const base: PwaEnvironment = {
    production: true,
    protocol: "https:",
    hostname: "botolago.com",
    pathname: "/matches",
    hasServiceWorker: true,
    native: false,
  };
  test("registers in a production browser on https", () => {
    expect(shouldRegisterServiceWorker(base)).toBe(true);
  });
  test("not in development, on http, in the phone app, or without support", () => {
    expect(shouldRegisterServiceWorker({ ...base, production: false })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, protocol: "http:" })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, native: true })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, hasServiceWorker: false })).toBe(false);
  });
  test("not from admin or auth pages", () => {
    expect(shouldRegisterServiceWorker({ ...base, pathname: "/admin/users" })).toBe(false);
    expect(shouldRegisterServiceWorker({ ...base, pathname: "/auth/login" })).toBe(false);
  });
});
