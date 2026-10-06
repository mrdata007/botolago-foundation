import { afterEach, describe, expect, test } from "bun:test";
import { prefetchInBrowser } from "./browser-prefetch";

const settle = () => new Promise((resolve) => setTimeout(resolve, 0));

describe("reads a loader starts in the browser", () => {
  // Other test files stand a fake window up; each test here says which side it is on.
  const global = globalThis as { window?: unknown };
  const saved = global.window;
  afterEach(() => {
    if (saved === undefined) delete global.window;
    else global.window = saved;
  });

  test("start nothing during a server render", async () => {
    delete global.window;
    let started = false;
    prefetchInBrowser(async () => {
      started = true;
    });
    await settle();
    expect(started).toBe(false);
  });

  test("start in the browser, and nothing waits for them", async () => {
    global.window = {};
    let finished = false;
    let release!: () => void;
    const returned = prefetchInBrowser(
      () =>
        new Promise<void>((resolve) => {
          release = () => {
            finished = true;
            resolve();
          };
        }),
    );
    expect(returned).toBeUndefined();
    await settle();
    expect(finished).toBe(false);
    release();
    expect(finished).toBe(true);
  });

  test("a failure is left to the page: nothing is thrown at the loader", async () => {
    global.window = {};
    const unhandled: unknown[] = [];
    const onUnhandled = (reason: unknown) => unhandled.push(reason);
    process.on("unhandledRejection", onUnhandled);
    try {
      expect(() =>
        prefetchInBrowser(() => {
          throw new Error("down");
        }),
      ).not.toThrow();
      prefetchInBrowser(async () => {
        throw new Error("down");
      });
      await settle();
      expect(unhandled).toEqual([]);
    } finally {
      process.off("unhandledRejection", onUnhandled);
    }
  });
});
