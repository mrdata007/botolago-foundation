import type { Language } from "@/types/domain";

/**
 * The language the pages are reading their data in right now, for code that
 * runs outside React: a route loader warming a page's queries before it
 * renders, under the keys the page will ask for.
 *
 * The language provider writes it on `<html data-lang>` after mount, from the
 * same state the pages' `useI18n().lang` comes from (French until an Arabic
 * reader's dictionary has arrived). The server always renders French, so
 * there, and before the provider has run, the answer is French.
 */
export function activeLanguage(): Language {
  if (typeof document === "undefined") return "fr";
  return document.documentElement.dataset.lang === "ar" ? "ar" : "fr";
}
