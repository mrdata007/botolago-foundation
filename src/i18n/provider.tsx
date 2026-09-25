import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import type { TranslationKey } from "./dictionaries";
import { fr } from "./dictionary-fr";
import type { Language, LocalizedString } from "@/types/domain";

const STORAGE_KEY = "botolago.language";

type Dictionary = Readonly<Record<string, string>>;

/**
 * The Arabic dictionary is loaded on demand: every page is first rendered in
 * French, and shipping both dictionaries in the main bundle cost every reader
 * ~75 KB of Arabic text (audit 2026-09-24, P1-11). The switch to Arabic waits
 * for it, so the page never shows Arabic layout with French words.
 */
let arabic: Dictionary | null = null;
let arabicLoad: Promise<Dictionary> | null = null;

function loadArabicDictionary(): Promise<Dictionary> {
  arabicLoad ??= import("./dictionary-ar").then(
    (module) => (arabic = module.ar),
    (error: unknown) => {
      arabicLoad = null;
      throw error;
    },
  );
  return arabicLoad;
}

function dictionaryFor(lang: Language): Dictionary {
  return lang === "ar" && arabic ? arabic : fr;
}

interface I18nContextValue {
  lang: Language;
  dir: "ltr" | "rtl";
  isHydrated: boolean;
  hasChosen: boolean;
  setLanguage: (l: Language) => void;
  t: (key: TranslationKey) => string;
  tr: (s: LocalizedString) => string;
}

const I18nContext = createContext<I18nContextValue | null>(null);

function readStored(): { lang: Language; hasChosen: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "fr" || stored === "ar") return { lang: stored, hasChosen: true };
  } catch {
    /* ignore */
  }
  return { lang: "fr", hasChosen: false };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR and first client render MUST match. Server always renders `fr`/`ltr`,
  // so the initial client state is also `fr` — we upgrade after mount.
  const [{ lang, hasChosen }, setState] = useState<{ lang: Language; hasChosen: boolean }>({
    lang: "fr",
    hasChosen: true,
  });
  const [isHydrated, setIsHydrated] = useState(false);
  // The language asked for last: a switch back to French while the Arabic
  // dictionary is still on its way must not be undone when it arrives.
  const wanted = useRef<Language>("fr");

  useEffect(() => {
    const stored = readStored();
    setIsHydrated(true);
    if (!stored) return;
    wanted.current = stored.lang;
    if (stored.lang !== "ar") {
      setState(stored);
      return;
    }
    // An Arabic reader: remember the choice at once, show Arabic as soon as
    // its dictionary is here; until then the page stays in French.
    setState({ lang: "fr", hasChosen: stored.hasChosen });
    loadArabicDictionary().then(
      () => {
        if (wanted.current === "ar") setState(stored);
      },
      () => {
        /* offline: stay in French until the next choice */
      },
    );
  }, []);

  // Sync <html lang> and <html dir> only after mount, never during render.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    if (document.documentElement.dir !== dir) document.documentElement.dir = dir;
    document.documentElement.dataset.lang = lang;
  }, [lang]);

  const setLanguage = useCallback((l: Language) => {
    wanted.current = l;
    try {
      window.localStorage.setItem(STORAGE_KEY, l);
    } catch {
      /* ignore */
    }
    if (l !== "ar" || arabic) {
      setState({ lang: l, hasChosen: true });
      return;
    }
    setState((current) => ({ ...current, hasChosen: true }));
    loadArabicDictionary().then(
      () => {
        if (wanted.current === "ar") setState({ lang: "ar", hasChosen: true });
      },
      () => {
        /* offline: stay in French; the choice is stored for next time */
      },
    );
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      lang,
      dir: lang === "ar" ? "rtl" : "ltr",
      isHydrated,
      hasChosen,
      setLanguage,
      t: (key) => dictionaryFor(lang)[key] ?? key,
      tr: (s) => s[lang] ?? s.fr,
    }),
    [lang, hasChosen, isHydrated, setLanguage],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
