import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  SPLASH_ATTRIBUTE,
  SPLASH_CLAIMED_ATTRIBUTE,
  SPLASH_FAILSAFE_MS,
  SPLASH_INIT_SCRIPT,
  SPLASH_SEEN_KEY,
  claimLaunchSplash,
  releaseLaunchSplash,
} from "./launch-splash";

/** Just the attribute surface of `<html>` that the script and helpers use. */
function fakeRoot() {
  const attrs = new Map<string, string>();
  return {
    attrs,
    getAttribute: (name: string) => attrs.get(name) ?? null,
    setAttribute: (name: string, value: string) => void attrs.set(name, value),
    hasAttribute: (name: string) => attrs.has(name),
    removeAttribute: (name: string) => void attrs.delete(name),
  };
}

/**
 * Run the head script against a fake page. `stored` is the seen flag already
 * in this tab's sessionStorage; `blocked` makes touching storage throw, as it
 * does in a browser set to block site data.
 */
function runHeadScript({
  stored = null,
  blocked = false,
}: { stored?: string | null; blocked?: boolean } = {}) {
  const root = fakeRoot();
  const session = new Map<string, string>();
  if (stored !== null) session.set(SPLASH_SEEN_KEY, stored);
  const timers: { fn: () => void; ms: number }[] = [];
  const window = {
    get sessionStorage() {
      if (blocked) throw new Error("SecurityError: access is denied for this document");
      return {
        getItem: (key: string) => session.get(key) ?? null,
        setItem: (key: string, value: string) => void session.set(key, value),
      };
    },
  };
  new Function("document", "window", "performance", "setTimeout", SPLASH_INIT_SCRIPT)(
    { documentElement: root },
    window,
    { now: () => 1234.4 },
    (fn: () => void, ms: number) => timers.push({ fn, ms }),
  );
  return { root, session, timers };
}

/** Point the global `document` at a fake `<html>` for the length of `body`. */
function withDocument(root: ReturnType<typeof fakeRoot>, body: () => void) {
  const scope = globalThis as { document?: unknown };
  const saved = scope.document;
  scope.document = { documentElement: root };
  try {
    body();
  } finally {
    scope.document = saved;
  }
}

describe("launch splash: the head script", () => {
  it("uses the key the e2e support seeds", () => {
    // tests/e2e/support.ts sets this to keep the splash out of every other
    // browser test; a renamed key would put it back over all of them.
    expect(SPLASH_SEEN_KEY).toBe("botolago.splashShown");
  });

  it("cannot terminate its own <script> element", () => {
    expect(SPLASH_INIT_SCRIPT).not.toContain("</");
  });

  it("is synchronous, self-contained and small enough to inline", () => {
    expect(SPLASH_INIT_SCRIPT.startsWith("(function(){")).toBe(true);
    expect(SPLASH_INIT_SCRIPT.length).toBeLessThan(600);
  });

  it("opens the tab's first load on the splash, and remembers that it did", () => {
    const { root, session, timers } = runHeadScript();
    expect(root.getAttribute(SPLASH_ATTRIBUTE)).toBe("1234");
    expect(session.get(SPLASH_SEEN_KEY)).toBe("1");
    expect(timers.map((t) => t.ms)).toEqual([SPLASH_FAILSAFE_MS]);
  });

  it("leaves every later load in the tab alone", () => {
    const { root, timers } = runHeadScript({ stored: "1" });
    expect(root.attrs.size).toBe(0);
    expect(timers).toEqual([]);
  });

  it("shows no splash, and does not throw, when storage is blocked", () => {
    // The old gate read sessionStorage unguarded in an effect, and the throw
    // took the whole app down to the error screen.
    const { root, timers } = runHeadScript({ blocked: true });
    expect(root.attrs.size).toBe(0);
    expect(timers).toEqual([]);
  });

  it("takes the splash down itself if the app never claims it", () => {
    const { root, timers } = runHeadScript();
    timers[0].fn();
    expect(root.hasAttribute(SPLASH_ATTRIBUTE)).toBe(false);
  });

  it("leaves a claimed splash to the app", () => {
    const { root, timers } = runHeadScript();
    root.setAttribute(SPLASH_CLAIMED_ATTRIBUTE, "");
    timers[0].fn();
    expect(root.getAttribute(SPLASH_ATTRIBUTE)).toBe("1234");
  });

  it("marks the attribute the stylesheet shows the splash on", () => {
    const css = readFileSync(join(import.meta.dir, "../../styles.css"), "utf8");
    expect(css).toMatch(/\n\.launch-splash \{\n {2}display: none;\n\}/);
    expect(css).toContain(`:root[${SPLASH_ATTRIBUTE}] .launch-splash {`);
    const component = readFileSync(join(import.meta.dir, "SplashScreen.tsx"), "utf8");
    expect(component).toContain("launch-splash fixed inset-0");
  });
});

describe("launch splash: the app's side", () => {
  it("finds no splash on a load the head script did not mark", () => {
    const root = fakeRoot();
    withDocument(root, () => {
      expect(claimLaunchSplash()).toBeNull();
    });
    expect(root.attrs.size).toBe(0);
  });

  it("claims a marked splash and reads back when it went up, as often as asked", () => {
    const { root } = runHeadScript();
    withDocument(root, () => {
      // StrictMode runs a mount effect twice; both runs must see the same splash.
      expect(claimLaunchSplash()).toBe(1234);
      expect(claimLaunchSplash()).toBe(1234);
    });
    expect(root.hasAttribute(SPLASH_CLAIMED_ATTRIBUTE)).toBe(true);
  });

  it("clears both marks when the splash is done", () => {
    const { root } = runHeadScript();
    withDocument(root, () => {
      claimLaunchSplash();
      releaseLaunchSplash();
      expect(claimLaunchSplash()).toBeNull();
    });
    expect(root.attrs.size).toBe(0);
  });
});
