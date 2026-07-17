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

export function I18nProvider({ children }: { children: ReactNode }) {
  // Render deterministically on SSR to avoid hydration mismatch; the stored
  // preference is applied after mount inside useEffect.
  const [lang, setLang] = useState<Language>("fr");
  const [hasChosen, setHasChosen] = useState<boolean>(true);
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
      if (stored === "fr" || stored === "ar") {
        setLang(stored);
        setHasChosen(true);
      } else {
        setHasChosen(false);
      }
    } catch {
      setHasChosen(false);
    }
    setIsHydrated(true);
  }, []);

  useEffect(() => {
    if (!isHydrated) return;
    const dir = lang === "ar" ? "rtl" : "ltr";
    document.documentElement.lang = lang;
    document.documentElement.dir = dir;
    document.documentElement.dataset.lang = lang;
  }, [lang, isHydrated]);

  const setLanguage = useCallback((l: Language) => {
    setLang(l);
    setHasChosen(true);
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
