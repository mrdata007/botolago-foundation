import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
  type ReactNode,
} from "react";
import type { TranslationKey } from "./dictionaries";
import { dictionaryInChunk } from "./dictionary-chunk";
import { fr } from "./dictionary-fr";
import { INITIAL_LANGUAGE_STATE, languageNotice, languageReducer } from "./language-state";
import { LanguageLoadNotice } from "./language-load-notice";
import { retryableImport } from "./retryable-import";
import { useSplashDone } from "@/lib/launch-sequence";
import type { Language, LocalizedString } from "@/types/domain";

const STORAGE_KEY = "botolago.language";

type Dictionary = Readonly<Record<string, string>>;

/**
 * The Arabic dictionary is loaded on demand: every page is first rendered in
 * French, and shipping both dictionaries in the main bundle cost every reader
 * ~75 KB of Arabic text (audit 2026-09-24, P1-11). The switch to Arabic waits
 * for it, so the page never shows Arabic layout with French words — and when
 * it does not arrive, the reader is told and can try again (audit 2026-09-25,
 * A10; `language-state.ts`). `retryableImport` makes that retry a real
 * request, not a replay of the first failure.
 */
const arabic = retryableImport<Dictionary>(
  () => import("./dictionary-ar").then((module) => module.ar),
  {
    base: import.meta.url,
    // A retry under a URL of its own gets the chunk as emitted, not the
    // module as written, so the dictionary is looked for by its contents.
    reimport: (url) =>
      import(/* @vite-ignore */ url).then((chunk: unknown) => {
        const found = dictionaryInChunk(chunk, "language.choose_title");
        if (!found) throw new Error(`No dictionary in ${url}`);
        return found;
      }),
  },
);

function arabicDictionary(): Dictionary | null {
  return arabic.current();
}

/** Whether a language can be shown right now, without a download. */
function isReady(lang: Language): boolean {
  return lang !== "ar" || arabicDictionary() !== null;
}

function dictionaryFor(lang: Language): Dictionary {
  return (lang === "ar" && arabicDictionary()) || fr;
}

interface I18nContextValue {
  lang: Language;
  dir: "ltr" | "rtl";
  isHydrated: boolean;
  hasChosen: boolean;
  /** The language asked for whose dictionary is on its way, if any. */
  loadingLanguage: Language | null;
  /**
   * The language asked for whose dictionary did not arrive, if any; kept
   * while the notice's retry of it is on its way.
   */
  failedLanguage: Language | null;
  setLanguage: (l: Language) => void;
  /** Asks again for the language that failed to load. */
  retryLanguage: () => void;
  t: (key: TranslationKey) => string;
  tr: (s: LocalizedString) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStored(): Language | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored === "fr" || stored === "ar") return stored;
  } catch {
    /* ignore */
  }
  return null;
}

/**
 * The 404 and error screens (`__root.tsx`) wrap themselves in a provider, for
 * when the root that holds this one is what failed. Under a working root they
 * are nested inside it, and a second provider there was a second copy of the
 * language: a retry of Arabic reached the outer one and left the 404 page's
 * own in French, under `<html lang="ar" dir="rtl">`. A provider inside
 * another now hands its children the outer one.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const outer = useContext(I18nContext);
  if (outer) return <>{children}</>;
  return <LanguageProvider>{children}</LanguageProvider>;
}

function LanguageProvider({ children }: { children: ReactNode }) {
  // SSR and first client render MUST match. Server always renders `fr`/`ltr`,
  // so the initial client state is also `fr` — we upgrade after mount.
  const [state, dispatch] = useReducer(languageReducer, INITIAL_LANGUAGE_STATE);
  const { lang, hasChosen, loading, failed } = state;
  const [isHydrated, setIsHydrated] = useState(false);

  // Only Arabic is ever fetched. A result that arrives after the reader has
  // moved on is dropped by the reducer, which knows what is still wanted.
  const fetchDictionary = useCallback((l: Language) => {
    arabic.load().then(
      () => dispatch({ type: "loaded", lang: l }),
      () => dispatch({ type: "load_failed", lang: l }),
    );
  }, []);

  useEffect(() => {
    const stored = readStored();
    setIsHydrated(true);
    const ready = stored === null || isReady(stored);
    dispatch({ type: "restored", stored, ready });
    if (!ready && stored) fetchDictionary(stored);
  }, [fetchDictionary]);

  // Sync <html lang> and <html dir> only after mount, never during render.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    if (document.documentElement.dir !== dir) document.documentElement.dir = dir;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const setLanguage = useCallback(
    (l: Language) => {
      // Stored at once, even before its dictionary arrives: it is the reader's
      // choice, and the next visit should try it again.
      try {
        window.localStorage.setItem(STORAGE_KEY, l);
      } catch {
        /* ignore */
      }
      const ready = isReady(l);
      dispatch({ type: "chosen", lang: l, ready });
      if (!ready) fetchDictionary(l);
    },
    [fetchDictionary],
  );

  const retryLanguage = useCallback(() => {
    if (!failed) return;
    if (isReady(failed)) {
      dispatch({ type: "chosen", lang: failed, ready: true });
      return;
    }
    dispatch({ type: "retried" });
    fetchDictionary(failed);
  }, [failed, fetchDictionary]);

  const closeNotice = useCallback(() => dispatch({ type: "dismissed" }), []);

  // Outside the first-launch chooser (which shows its own error and retry),
  // a failed download is reported by a notice under the top bar, once the
  // splash has gone. It follows its own retry through the wait, and leaves
  // when the language arrives, the reader turns to French or closes it.
  const splashDone = useSplashDone();
  const notice = languageNotice(state, splashDone);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      isHydrated,
      hasChosen,
      loadingLanguage: loading,
      failedLanguage: failed,
      setLanguage,
      retryLanguage,
      t: (key) => dictionaryFor(lang)[key] ?? key,
      tr: (s) => s[lang] ?? s.fr,
    }),
    [lang, hasChosen, loading, failed, isHydrated, setLanguage, retryLanguage],
  );

  return (
    <I18nContext.Provider value={value}>
      {/* Before the page in the document, so the keyboard reaches Retry
          without crossing the whole page first. */}
      {notice ? (
        <LanguageLoadNotice
          retrying={notice === "retrying"}
          onRetry={retryLanguage}
          onClose={closeNotice}
        />
      ) : null}
      {children}
    </I18nContext.Provider>
  );
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
