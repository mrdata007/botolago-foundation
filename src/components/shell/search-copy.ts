import type { TranslationKey } from "@/i18n/dictionaries";
import type { SearchAnnouncement } from "@/lib/global-search";
import type { Language } from "@/types/domain";

/**
 * What the header search tells a screen reader as its list changes. Arabic
 * agrees the noun with the number (one, two, 3–10, 11+), so each form is its
 * own key, picked by `Intl.PluralRules` and written as a literal call so the
 * i18n gate sees every one — the pattern of `predictions-copy.ts`.
 */

type Translate = (key: TranslationKey) => string;

/** "3 résultats". */
export function searchResultsLabel(n: number, lang: Language, t: Translate): string {
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  const template =
    rule === "one"
      ? t("nav.search.results_one")
      : rule === "two"
        ? t("nav.search.results_two")
        : rule === "few"
          ? t("nav.search.results_few")
          : t("nav.search.results_other");
  return template.replace(
    "{n}",
    new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR").format(n),
  );
}

/** The words the live region carries; empty when there is nothing to say. */
export function searchAnnouncementText(
  announcement: SearchAnnouncement,
  lang: Language,
  t: Translate,
): string {
  if (!announcement) return "";
  switch (announcement.kind) {
    case "results": {
      const count = searchResultsLabel(announcement.count, lang, t);
      // Some results are there, and some could not be read: both are said.
      return announcement.partial ? `${count}. ${t("nav.search.partial")}` : count;
    }
    case "loading":
      return t("nav.search.loading");
    case "empty":
      return t("nav.search.empty");
    case "unavailable":
      return announcement.coverage === "none"
        ? t("nav.search.unavailable")
        : t("nav.search.partial");
  }
}
