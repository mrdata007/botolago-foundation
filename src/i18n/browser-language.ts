import type { Language } from "@/types/domain";

/**
 * The language the first-launch chooser starts on (`FirstLaunchLanguage`).
 *
 * French was always preselected, also on a phone set to Arabic, so an Arabic
 * reader's first tap on BotolaGO was to undo a choice made for them. Now the
 * browser's own list of preferred languages decides: the first entry that
 * BotolaGO speaks wins, Arabic for any `ar` tag (`ar`, `ar-MA`, `ar-SA`…),
 * French for any `fr` tag. A list with neither (`en-US`, `es`…) and an empty
 * one start on French, as before. Only the primary subtag counts, so `arn`
 * (Mapudungun) is not Arabic.
 *
 * It only preselects a tile: nothing is stored and the page does not change
 * language until the reader presses "Continuer".
 */
export function chooserStartLanguage(preferred: readonly string[]): Language {
  for (const tag of preferred) {
    const primary = tag.trim().toLowerCase().split(/[-_]/, 1)[0];
    if (primary === "ar") return "ar";
    if (primary === "fr") return "fr";
  }
  return "fr";
}

/**
 * The browser's preferred languages, most wanted first: `navigator.languages`,
 * or `navigator.language` alone where the list is missing or empty. Empty on
 * the server.
 *
 * Browser only, and only after hydration: the server has no `navigator`, so a
 * component that read this in its first render would disagree with the
 * server's markup (the rule at the top of `src/theme/theme.ts`).
 */
export function browserLanguages(): readonly string[] {
  if (typeof navigator === "undefined") return [];
  try {
    if (navigator.languages?.length) return navigator.languages;
    return navigator.language ? [navigator.language] : [];
  } catch {
    return [];
  }
}
