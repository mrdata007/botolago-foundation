import { describe, expect, it } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  INITIAL_LANGUAGE_STATE,
  languageNotice,
  languageReducer,
  type LanguageEvent,
  type LanguageState,
} from "./language-state";

/**
 * The language state machine behind `I18nProvider` (audit 2026-09-25, A10):
 * asking for Arabic is not having it, and a failed download is a state the
 * reader is told about, not one that is swallowed. Driven as a pure reducer
 * because the repository has no DOM test environment.
 */

const run = (events: LanguageEvent[], from: LanguageState = INITIAL_LANGUAGE_STATE) =>
  events.reduce(languageReducer, from);

const FIRST_VISIT = run([{ type: "restored", stored: null, ready: true }]);

describe("the language on the server and the first client render", () => {
  it("is French with no chooser, so hydration matches", () => {
    expect(INITIAL_LANGUAGE_STATE).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });
});

describe("a first visit (nothing stored)", () => {
  it("opens the chooser on a French page", () => {
    expect(FIRST_VISIT).toEqual({ lang: "fr", hasChosen: false, loading: null, failed: null });
  });

  it("closes the chooser at once on French", () => {
    expect(run([{ type: "chosen", lang: "fr", ready: true }], FIRST_VISIT)).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });

  it("keeps the chooser open while Arabic downloads, the page still French", () => {
    const waiting = run([{ type: "chosen", lang: "ar", ready: false }], FIRST_VISIT);
    expect(waiting).toEqual({ lang: "fr", hasChosen: false, loading: "ar", failed: null });
  });

  it("closes the chooser on Arabic only once the dictionary has arrived", () => {
    const shown = run(
      [
        { type: "chosen", lang: "ar", ready: false },
        { type: "loaded", lang: "ar" },
      ],
      FIRST_VISIT,
    );
    expect(shown).toEqual({ lang: "ar", hasChosen: true, loading: null, failed: null });
  });

  it("keeps the chooser open, and says Arabic failed, when the download fails", () => {
    const failed = run(
      [
        { type: "chosen", lang: "ar", ready: false },
        { type: "load_failed", lang: "ar" },
      ],
      FIRST_VISIT,
    );
    expect(failed).toEqual({ lang: "fr", hasChosen: false, loading: null, failed: "ar" });
  });

  it("clears the failure when the reader tries again, and closes once it works", () => {
    const failed = run(
      [
        { type: "chosen", lang: "ar", ready: false },
        { type: "load_failed", lang: "ar" },
      ],
      FIRST_VISIT,
    );
    const retrying = run([{ type: "chosen", lang: "ar", ready: false }], failed);
    expect(retrying).toEqual({ lang: "fr", hasChosen: false, loading: "ar", failed: null });
    expect(run([{ type: "loaded", lang: "ar" }], retrying)).toEqual({
      lang: "ar",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });

  it("lets a reader whose Arabic failed continue in French instead", () => {
    const failed = run(
      [
        { type: "chosen", lang: "ar", ready: false },
        { type: "load_failed", lang: "ar" },
      ],
      FIRST_VISIT,
    );
    expect(run([{ type: "chosen", lang: "fr", ready: true }], failed)).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });

  it("switches straight to Arabic when the dictionary is already here", () => {
    expect(run([{ type: "chosen", lang: "ar", ready: true }], FIRST_VISIT)).toEqual({
      lang: "ar",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });
});

describe("a returning reader", () => {
  it("is shown French at once when French is stored", () => {
    expect(run([{ type: "restored", stored: "fr", ready: true }])).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });

  it("is not shown the chooser while Arabic downloads; the page stays French", () => {
    expect(run([{ type: "restored", stored: "ar", ready: false }])).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: "ar",
      failed: null,
    });
  });

  it("is shown Arabic once it arrives", () => {
    expect(
      run([
        { type: "restored", stored: "ar", ready: false },
        { type: "loaded", lang: "ar" },
      ]),
    ).toEqual({ lang: "ar", hasChosen: true, loading: null, failed: null });
  });

  it("keeps a failed Arabic download as a failure (the notice), not a silent French page", () => {
    expect(
      run([
        { type: "restored", stored: "ar", ready: false },
        { type: "load_failed", lang: "ar" },
      ]),
    ).toEqual({ lang: "fr", hasChosen: true, loading: null, failed: "ar" });
  });
});

describe("a late result", () => {
  it("does not undo a switch back to French made while Arabic was on its way", () => {
    const state = run([
      { type: "restored", stored: "fr", ready: true },
      { type: "chosen", lang: "ar", ready: false },
      { type: "chosen", lang: "fr", ready: true },
      { type: "loaded", lang: "ar" },
    ]);
    expect(state).toEqual({ lang: "fr", hasChosen: true, loading: null, failed: null });
  });

  it("does not report a failure for a download the reader has moved on from", () => {
    const state = run([
      { type: "restored", stored: "fr", ready: true },
      { type: "chosen", lang: "ar", ready: false },
      { type: "chosen", lang: "fr", ready: true },
      { type: "load_failed", lang: "ar" },
    ]);
    expect(state.failed).toBeNull();
  });

  it("reports a second rejection of the same download once", () => {
    const once = run([
      { type: "restored", stored: "ar", ready: false },
      { type: "load_failed", lang: "ar" },
    ]);
    expect(run([{ type: "load_failed", lang: "ar" }], once)).toBe(once);
  });
});

describe("the menu switcher, with a language already settled", () => {
  it("leaves the page French and the chooser closed while Arabic downloads", () => {
    const state = run([
      { type: "restored", stored: "fr", ready: true },
      { type: "chosen", lang: "ar", ready: false },
    ]);
    expect(state).toEqual({ lang: "fr", hasChosen: true, loading: "ar", failed: null });
  });

  it("switches back to French from Arabic at once", () => {
    const state = run([
      { type: "restored", stored: "ar", ready: true },
      { type: "chosen", lang: "fr", ready: true },
    ]);
    expect(state).toEqual({ lang: "fr", hasChosen: true, loading: null, failed: null });
  });
});

describe("the notice's retry, outside the chooser", () => {
  const FAILED = run([
    { type: "restored", stored: "ar", ready: false },
    { type: "load_failed", lang: "ar" },
  ]);

  it("keeps the failure while the retry is on its way", () => {
    expect(run([{ type: "retried" }], FAILED)).toEqual({
      lang: "fr",
      hasChosen: true,
      loading: "ar",
      failed: "ar",
    });
  });

  it("shows Arabic when the retry works", () => {
    expect(run([{ type: "retried" }, { type: "loaded", lang: "ar" }], FAILED)).toEqual({
      lang: "ar",
      hasChosen: true,
      loading: null,
      failed: null,
    });
  });

  it("is back to the failure when the retry fails too", () => {
    expect(run([{ type: "retried" }, { type: "load_failed", lang: "ar" }], FAILED)).toEqual(FAILED);
  });

  it("is nothing to retry when nothing failed", () => {
    const settled = run([{ type: "restored", stored: "fr", ready: true }]);
    expect(run([{ type: "retried" }], settled)).toBe(settled);
  });
});

describe("closing the notice", () => {
  it("forgets the failure and stays in French", () => {
    const state = run([
      { type: "restored", stored: "ar", ready: false },
      { type: "load_failed", lang: "ar" },
      { type: "dismissed" },
    ]);
    expect(state).toEqual({ lang: "fr", hasChosen: true, loading: null, failed: null });
  });

  it("changes nothing when there is no failure", () => {
    const settled = run([{ type: "restored", stored: "ar", ready: true }]);
    expect(run([{ type: "dismissed" }], settled)).toBe(settled);
  });
});

describe("what the notice outside the chooser shows", () => {
  const FAILED = run([
    { type: "restored", stored: "ar", ready: false },
    { type: "load_failed", lang: "ar" },
  ]);

  it("shows the failure once the splash has gone", () => {
    expect(languageNotice(FAILED, true)).toBe("failed");
  });

  it("waits for the splash", () => {
    expect(languageNotice(FAILED, false)).toBeNull();
  });

  it("follows its own retry through the wait", () => {
    expect(languageNotice(run([{ type: "retried" }], FAILED), true)).toBe("retrying");
  });

  it("leaves when Arabic arrives, the reader turns to French or closes it", () => {
    const retried = run([{ type: "retried" }], FAILED);
    expect(languageNotice(run([{ type: "loaded", lang: "ar" }], retried), true)).toBeNull();
    expect(
      languageNotice(run([{ type: "chosen", lang: "fr", ready: true }], FAILED), true),
    ).toBeNull();
    expect(languageNotice(run([{ type: "dismissed" }], FAILED), true)).toBeNull();
  });

  it("says nothing about a returning reader's ordinary download", () => {
    expect(
      languageNotice(run([{ type: "restored", stored: "ar", ready: false }]), true),
    ).toBeNull();
  });

  it("leaves a first visit's failure to the chooser", () => {
    const chooserFailed = run(
      [
        { type: "chosen", lang: "ar", ready: false },
        { type: "load_failed", lang: "ar" },
      ],
      FIRST_VISIT,
    );
    expect(languageNotice(chooserFailed, true)).toBeNull();
  });
});

describe("the provider's wiring", () => {
  // Source-shape, like `launch-sequence.test.ts`: the provider's effects do
  // not run under react-dom/server, and there is no DOM here.
  const provider = readFileSync(join(import.meta.dir, "provider.tsx"), "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, " ")
    .replace(/\/\/[^\n]*/g, " ");

  it("drives this reducer", () => {
    expect(provider).toContain("useReducer(languageReducer, INITIAL_LANGUAGE_STATE)");
  });

  it("downloads Arabic through the retryable import, resolved against its own module", () => {
    expect(provider).toContain("retryableImport<Dictionary>(");
    expect(provider).toContain('() => import("./dictionary-ar").then((module) => module.ar)');
    expect(provider).toContain("base: import.meta.url");
    // A retry fetched by URL is the emitted chunk: found by content, not name.
    expect(provider).toContain('dictionaryInChunk(chunk, "language.choose_title")');
  });

  it("draws the notice this module decides on, retrying through the reducer", () => {
    expect(provider).toContain("languageNotice(state, splashDone)");
    expect(provider).toContain('retrying={notice === "retrying"}');
    expect(provider).toContain("onRetry={retryLanguage}");
    expect(provider).toContain('dispatch({ type: "retried" })');
    expect(provider).toContain('dispatch({ type: "dismissed" })');
  });
});
