import { describe, expect, it } from "bun:test";

import { failedModuleUrl, retryableImport, withRetryQuery } from "./retryable-import";

/**
 * The Arabic dictionary's download must be retryable for real (audit
 * 2026-09-25, A10): a rejected import is not replayed from our memo, and in
 * a browser that caches the failed fetch in its module map, the retry asks
 * for the chunk under a URL of its own. Driven with fake importers — nothing
 * here touches the network.
 */

const CHUNK = "https://botolago.com/assets/dictionary-ar-Bx12.js";
const CHROMIUM = (url: string) =>
  new TypeError(`Failed to fetch dynamically imported module: ${url}`);
const FIREFOX = (url: string) => new TypeError(`error loading dynamically imported module: ${url}`);
const SAFARI = () => new TypeError("Importing a module script failed.");

/** An importer that rejects with each of `failures` in turn, then resolves. */
function scripted(failures: Error[]) {
  let calls = 0;
  const importer = () => {
    const failure = failures[calls];
    calls += 1;
    return failure ? Promise.reject(failure) : Promise.resolve({ ar: { "app.name": "BotolaGO" } });
  };
  return { importer, calls: () => calls };
}

describe("retryableImport — the memo", () => {
  it("shares one import between callers that ask at the same time", async () => {
    const { importer, calls } = scripted([]);
    const loader = retryableImport(importer);
    const [a, b] = await Promise.all([loader.load(), loader.load()]);
    expect(a).toBe(b);
    expect(calls()).toBe(1);
  });

  it("keeps a module that arrived, and never imports it again", async () => {
    const { importer, calls } = scripted([]);
    const loader = retryableImport(importer);
    expect(loader.current()).toBeNull();
    const module = await loader.load();
    expect(loader.current()).toBe(module);
    await loader.load();
    expect(calls()).toBe(1);
  });

  it("forgets a rejection, so the next load imports again instead of replaying it", async () => {
    const { importer, calls } = scripted([SAFARI()]);
    const loader = retryableImport(importer, { reimport: () => Promise.reject(SAFARI()) });
    await expect(loader.load()).rejects.toThrow("Importing a module script failed.");
    expect(loader.current()).toBeNull();
    const module = await loader.load();
    expect(calls()).toBe(2);
    expect(loader.current()).toBe(module);
  });
});

describe("retryableImport — a browser that caches the failed fetch", () => {
  it("asks for the chunk the error names under a fresh URL when the plain retry fails too", async () => {
    const { importer, calls } = scripted([CHROMIUM(CHUNK), CHROMIUM(CHUNK)]);
    const asked: string[] = [];
    const loader = retryableImport(importer, {
      reimport: (url) => {
        asked.push(url);
        return Promise.resolve({ ar: { "app.name": "BotolaGO" } });
      },
    });
    await expect(loader.load()).rejects.toThrow(CHUNK);
    await loader.load();
    expect(calls()).toBe(2);
    expect(asked).toEqual([`${CHUNK}?retry=1`]);
    expect(loader.current()).not.toBeNull();
  });

  it("does not bust the URL on the first attempt, or when the plain retry works", async () => {
    const { importer } = scripted([FIREFOX(CHUNK)]);
    const asked: string[] = [];
    const loader = retryableImport(importer, {
      reimport: (url) => {
        asked.push(url);
        return Promise.reject(new Error("not expected"));
      },
    });
    await expect(loader.load()).rejects.toThrow();
    await loader.load();
    expect(asked).toEqual([]);
  });

  it("uses a new URL for every retry that is needed", async () => {
    const { importer } = scripted([CHROMIUM(CHUNK), CHROMIUM(CHUNK), CHROMIUM(CHUNK)]);
    const asked: string[] = [];
    let reimports = 0;
    const loader = retryableImport(importer, {
      reimport: (url) => {
        asked.push(url);
        reimports += 1;
        return reimports === 1
          ? Promise.reject(CHROMIUM(url))
          : Promise.resolve({ ar: { "app.name": "BotolaGO" } });
      },
    });
    await expect(loader.load()).rejects.toThrow();
    await expect(loader.load()).rejects.toThrow(`${CHUNK}?retry=1`);
    await loader.load();
    expect(asked).toEqual([`${CHUNK}?retry=1`, `${CHUNK}?retry=2`]);
  });

  it("gives up with the plain import's error when no URL can be recovered", async () => {
    const { importer } = scripted([SAFARI(), SAFARI()]);
    const loader = retryableImport(importer, {
      reimport: () => Promise.reject(new Error("not expected")),
    });
    await expect(loader.load()).rejects.toThrow("Importing a module script failed.");
    await expect(loader.load()).rejects.toThrow("Importing a module script failed.");
    // …and the one after that is a fresh attempt again, which here succeeds.
    await expect(loader.load()).resolves.toEqual({ ar: { "app.name": "BotolaGO" } });
  });
});

describe("failedModuleUrl", () => {
  it("reads the URL from Chromium's and Firefox's messages", () => {
    expect(failedModuleUrl(CHROMIUM(CHUNK), () => null, undefined)).toBe(CHUNK);
    expect(failedModuleUrl(FIREFOX(CHUNK), () => null, undefined)).toBe(CHUNK);
  });

  it("drops the query a dev server adds, so the retry's own query is the only one", () => {
    const dev = "http://localhost:8080/src/i18n/dictionary-ar.ts";
    expect(failedModuleUrl(CHROMIUM(`${dev}?t=1727`), () => null, undefined)).toBe(dev);
  });

  it("falls back to the specifier written in the importer, resolved against its module", () => {
    // Built from a string so the test never tries to load the chunk: what
    // matters is the source text, which is what the bundler leaves behind.
    const bundled = new Function('return import("./dictionary-ar-Bx12.js")') as () => unknown;
    expect(failedModuleUrl(SAFARI(), bundled, "https://botolago.com/assets/index-9f3a.js")).toBe(
      CHUNK,
    );
    // Vite wraps it in its preload helper; the inner import is still there.
    const preloaded = new Function(
      'return __vitePreload(() => import("./dictionary-ar-Bx12.js"), [])',
    ) as () => unknown;
    expect(failedModuleUrl(SAFARI(), preloaded, "https://botolago.com/assets/index-9f3a.js")).toBe(
      CHUNK,
    );
  });

  it("finds nothing without a URL, a written specifier or a base to resolve it against", () => {
    const bundled = new Function('return import("./dictionary-ar-Bx12.js")') as () => unknown;
    expect(failedModuleUrl(SAFARI(), () => null, "https://botolago.com/")).toBeNull();
    expect(failedModuleUrl(SAFARI(), bundled, undefined)).toBeNull();
    expect(failedModuleUrl("not an error", () => null, undefined)).toBeNull();
  });

  it("finds nothing for a bare package specifier", () => {
    const bare = new Function('return import("some-package")') as () => unknown;
    expect(failedModuleUrl(SAFARI(), bare, "not a url")).toBeNull();
  });
});

describe("withRetryQuery", () => {
  it("adds the attempt as a query of its own, keeping any other", () => {
    expect(withRetryQuery(CHUNK, 1)).toBe(`${CHUNK}?retry=1`);
    expect(withRetryQuery(`${CHUNK}?v=2`, 3)).toBe(`${CHUNK}?v=2&retry=3`);
  });
});
