import type { Language } from "@/types/domain";

/**
 * The language the reader sees, and the one they asked for, as a pure state
 * machine the provider drives (provider.tsx) and the tests drive directly —
 * this repository has no DOM test environment.
 *
 * French ships with the page; Arabic arrives as a chunk of its own. So asking
 * for Arabic is not the same as having it, and until audit 2026-09-25 (A10)
 * the difference was lost: the choice was marked made before the chunk was
 * requested and a failed request was swallowed, so a reader who chose Arabic
 * on a weak connection had the chooser close on a French page with nothing
 * said. Now the request is a state of its own, `loading`, and its failure is
 * one too, `failed`, kept until the reader tries again, chooses French or
 * closes the notice that reports it.
 */
export interface LanguageState {
  /** The language the page is drawn in. Arabic only once its words are here. */
  lang: Language;
  /**
   * Whether a language is settled. False only on a first visit, until the
   * chosen language can be shown — it is what keeps the chooser open.
   */
  hasChosen: boolean;
  /** The language asked for whose dictionary is on its way. */
  loading: Language | null;
  /** The language asked for whose dictionary did not arrive. */
  failed: Language | null;
}

export type LanguageEvent =
  /** On mount: the language stored on this device, if any. */
  | { type: "restored"; stored: Language | null; ready: boolean }
  /** The reader chose a language (or, in the chooser, tried the failed one again). */
  | { type: "chosen"; lang: Language; ready: boolean }
  /** The notice's Retry: the language that failed is asked for again. */
  | { type: "retried" }
  /** The reader closed the notice, and carries on in French for now. */
  | { type: "dismissed" }
  | { type: "loaded"; lang: Language }
  | { type: "load_failed"; lang: Language };

/**
 * What the server renders and the first client render repeats: French, and
 * no chooser (the chooser also waits for hydration). The stored choice is
 * read after mount.
 */
export const INITIAL_LANGUAGE_STATE: LanguageState = {
  lang: "fr",
  hasChosen: true,
  loading: null,
  failed: null,
};

function settled(lang: Language): LanguageState {
  return { lang, hasChosen: true, loading: null, failed: null };
}

/**
 * `ready` says whether the language's dictionary is already here (French
 * always is), which the reducer cannot know on its own.
 */
export function languageReducer(state: LanguageState, event: LanguageEvent): LanguageState {
  switch (event.type) {
    case "restored":
      if (event.stored === null) return { ...settled("fr"), hasChosen: false };
      if (event.ready) return settled(event.stored);
      // A returning Arabic reader: the choice was made on an earlier visit, so
      // nothing waits for it, and the page stays French until the words come.
      return { lang: "fr", hasChosen: true, loading: event.stored, failed: null };
    case "chosen":
      if (event.ready) return settled(event.lang);
      // `hasChosen` is left as it was: on a first visit the chooser stays open
      // (showing the wait) until the dictionary can be shown.
      return { ...state, loading: event.lang, failed: null };
    case "retried":
      // Unlike a fresh choice, the failure is kept while the retry is on its
      // way: it is what keeps the notice up, showing the wait, rather than
      // gone and then back again if the retry fails too.
      return state.failed === null ? state : { ...state, loading: state.failed };
    case "dismissed":
      // The stored choice is kept, so the next visit tries Arabic again.
      return state.failed === null ? state : { ...state, failed: null };
    case "loaded":
      // A reader who went back to French while Arabic was on its way has
      // moved on; the late arrival must not undo that.
      return state.loading === event.lang ? settled(event.lang) : state;
    case "load_failed":
      return state.loading === event.lang ? { ...state, loading: null, failed: event.lang } : state;
  }
}

/**
 * What the notice outside the chooser shows (`language-load-notice.tsx`):
 * nothing, the failure, or the wait for a retry of it. On a first visit the
 * chooser reports the failure itself, and nothing is drawn over the splash.
 * A returning reader's ordinary download is not news, so a wait is shown only
 * for a retry the notice started.
 */
export type LanguageNotice = "failed" | "retrying" | null;

export function languageNotice(state: LanguageState, splashDone: boolean): LanguageNotice {
  if (!state.hasChosen || !splashDone || state.failed === null) return null;
  return state.loading === state.failed ? "retrying" : "failed";
}
