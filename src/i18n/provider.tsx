import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { dictionaries, type TranslationKey } from "./dictionaries";
import type { Language, LocalizedString } from "@/types/domain";

const STORAGE_KEY = "botolago.language";

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

function readInitial(): { lang: Language; hasChosen: boolean } {
  if (typeof window === "undefined") return { lang: "fr", hasChosen: true };
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "fr" || stored === "ar") return { lang: stored, hasChosen: true };
  } catch { /* ignore */ }
  return { lang: "fr", hasChosen: false };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // Synchronous initial read so lang/dir are correct on first paint after
  // hydration — prevents the RTL flash between server HTML and client state.
  const [{ lang, hasChosen }, setState] = useState(readInitial);

  // Apply html attributes as early as possible (during first client render).
  if (typeof document !== "undefined") {
    const dir = lang === "ar" ? "rtl" : "ltr";
    if (document.documentElement.lang !== lang) document.documentElement.lang = lang;
    if (document.documentElement.dir !== dir) document.documentElement.dir = dir;
    if (document.documentElement.dataset.lang !== lang) document.documentElement.dataset.lang = lang;
  }

  // Kept for API compatibility with existing consumers (FirstLaunchLanguage,
  // legacy call sites). Flip after mount so gated overlays only appear once
  // the client is ready.
  const [isHydrated, setIsHydrated] = useState(false);
  useEffect(() => { setIsHydrated(true); }, []);

  const setLanguage = useCallback((l: Language) => {
    setState({ lang: l, hasChosen: true });
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    isHydrated,
    hasChosen,
    setLanguage,
    t: (key) => dictionaries[lang][key] ?? key,
    tr: (s) => s[lang] ?? s.fr,
  }), [lang, hasChosen, isHydrated, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
