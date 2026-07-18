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

function readStored(): { lang: Language; hasChosen: boolean } | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY) as Language | null;
    if (stored === "fr" || stored === "ar") return { lang: stored, hasChosen: true };
  } catch { /* ignore */ }
  return { lang: "fr", hasChosen: false };
}

export function I18nProvider({ children }: { children: ReactNode }) {
  // SSR and first client render MUST match. Server always renders `fr`/`ltr`,
  // so the initial client state is also `fr` — we upgrade after mount.
  const [{ lang, hasChosen }, setState] = useState<{ lang: Language; hasChosen: boolean }>(
    { lang: "fr", hasChosen: true },
  );
  const [isHydrated, setIsHydrated] = useState(false);

  useEffect(() => {
    const stored = readStored();
    if (stored) setState(stored);
    setIsHydrated(true);
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
    setState({ lang: l, hasChosen: true });
    try { window.localStorage.setItem(STORAGE_KEY, l); } catch { /* ignore */ }
  }, []);

  const value = useMemo<I18nContextValue>(() => ({
    lang,
    dir: lang === "ar" ? "rtl" : "ltr",
    isHydrated,
    hasChosen,
    setLanguage,
    t: (key) => (dictionaries[lang] as Record<string, string>)[key] ?? key,
    tr: (s) => s[lang] ?? s.fr,
  }), [lang, hasChosen, isHydrated, setLanguage]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used inside I18nProvider");
  return ctx;
}
