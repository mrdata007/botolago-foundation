import type { Language } from "@/types/domain";
import { ar } from "./dictionary-ar";
import { fr } from "./dictionary-fr";

// Every user-facing string in the app, in both languages. Components must not
// hardcode UI copy -- they call t("key"). The app itself imports the French
// dictionary directly and loads the Arabic one on demand (provider.tsx), so a
// page does not ship both; import this module only where both are needed
// (tests, the i18n gate, an admin screen showing both).
export const dictionaries = { fr, ar } as const satisfies Record<Language, Record<string, string>>;

export type TranslationKey = keyof typeof fr;
