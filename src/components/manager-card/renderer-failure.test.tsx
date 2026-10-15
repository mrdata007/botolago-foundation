import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { renderToString } from "react-dom/server";

import { dictionaries } from "@/i18n/dictionaries";
import { I18nProvider } from "@/i18n/provider";
import { setOperationalTransport, type OperationalEvent } from "@/lib/operational-errors";

import { activeRenderer } from "./active-renderer";
import { CardLoadFailed } from "./CardLoadFailed";
import { plainRenderer } from "./plain-renderer";
import {
  preloadCardRenderer,
  rendererStateForTests,
  retryCardRenderer,
  setLoadedRendererForTests,
} from "./use-card-renderer";

// SEC-04: a renderer chunk that fails, or never arrives, must end in a visible failure with a
// retry, and a retry that works must recover the cards that are already on the page.

const realLoad = activeRenderer.load;
const settle = (ms = 5) => new Promise((resolve) => setTimeout(resolve, ms));
const events: OperationalEvent[] = [];

// Test files share one process: give this one a `window` (what `preloadCardRenderer` checks, and
// what the error report reads the route from) and its own error sink, and put both back as found.
const globals = globalThis as { window?: unknown };
const hadWindow = "window" in globals;
const previousWindow = globals.window;
beforeEach(() => {
  globals.window = { location: { pathname: "/curva" } };
  setOperationalTransport((event) => void events.push(event));
  setLoadedRendererForTests(null);
});

afterEach(() => {
  activeRenderer.load = realLoad;
  setLoadedRendererForTests(null);
  setOperationalTransport(null);
  if (hadWindow) globals.window = previousWindow;
  else delete globals.window;
  events.length = 0;
});

describe("the renderer's load state", () => {
  it("an import that fails ends in a failed state, reported once", async () => {
    activeRenderer.load = () =>
      Promise.reject(new Error("Failed to fetch dynamically imported module"));
    preloadCardRenderer();
    await settle();
    expect(rendererStateForTests.failed()).toBe(true);
    expect(rendererStateForTests.loaded()).toBeNull();
    expect(events.map((event) => [event.area, event.code, event.detail.reason])).toEqual([
      ["manager_card.renderer", "renderer_load_failed", "error"],
    ]);
  });

  it("an import that never settles ends in a failed state after the time limit", async () => {
    rendererStateForTests.setTimeoutMs(20);
    activeRenderer.load = () => new Promise<never>(() => {});
    preloadCardRenderer();
    expect(rendererStateForTests.failed()).toBe(false);
    await settle(60);
    expect(rendererStateForTests.failed()).toBe(true);
    expect(events[0]?.detail.reason).toBe("timeout");
  });

  it("a retry that works loads the renderer and clears the failure", async () => {
    let calls = 0;
    activeRenderer.load = () => {
      calls += 1;
      return calls === 1 ? Promise.reject(new Error("offline")) : Promise.resolve(plainRenderer);
    };
    preloadCardRenderer();
    await settle();
    expect(rendererStateForTests.failed()).toBe(true);

    retryCardRenderer();
    await settle();
    expect(calls).toBe(2);
    expect(rendererStateForTests.failed()).toBe(false);
    expect(rendererStateForTests.loaded()).toBe(plainRenderer);
  });

  it("one retry is one attempt: a failed retry stays failed and does not loop", async () => {
    let calls = 0;
    activeRenderer.load = () => {
      calls += 1;
      return Promise.reject(new Error("offline"));
    };
    preloadCardRenderer();
    await settle();
    retryCardRenderer();
    await settle(30);
    expect(calls).toBe(2);
    expect(rendererStateForTests.failed()).toBe(true);
  });

  it("a chunk that arrives after the limit still recovers the cards", async () => {
    rendererStateForTests.setTimeoutMs(10);
    let arrive: (value: typeof plainRenderer) => void = () => {};
    activeRenderer.load = () => new Promise((resolve) => (arrive = resolve));
    preloadCardRenderer();
    await settle(40);
    expect(rendererStateForTests.failed()).toBe(true);
    arrive(plainRenderer);
    await settle();
    expect(rendererStateForTests.failed()).toBe(false);
    expect(rendererStateForTests.loaded()).toBe(plainRenderer);
  });
});

describe("the failed card", () => {
  const render = () =>
    renderToString(
      <I18nProvider>
        <CardLoadFailed aspect={1.366} label="Carte de manager, Ali" onRetry={() => {}} />
      </I18nProvider>,
    ).replace(/<!-- -->/g, "");

  it("keeps the box's shape, says what happened, offers a retry and keeps the card's label", () => {
    const html = render();
    expect(html).toContain("aspect-ratio:1 / 1.366");
    expect(html).toContain(dictionaries.fr["card.load_failed"]);
    expect(html).toContain(dictionaries.fr["state.retry"]);
    expect(html).toContain("<button");
    expect(html).toContain("Carte de manager, Ali");
    expect(html).not.toContain("shimmer");
  });

  it("exists in Arabic too", () => {
    expect(dictionaries.ar["card.load_failed"]).toBeTruthy();
    expect(dictionaries.ar["card.load_failed"]).not.toBe(dictionaries.fr["card.load_failed"]);
  });
});
