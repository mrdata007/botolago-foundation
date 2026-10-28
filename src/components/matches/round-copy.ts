import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

/**
 * The round summary's counted phrase. Arabic agrees the noun with the number
 * ("مباراة واحدة", "مباراتان", "5 مباريات", "11 مباراة"), so each form is its
 * own key, picked by `Intl.PluralRules` and written as a literal call so the
 * i18n gate sees every one (the pattern of `standings-copy.ts`).
 */

type Translate = (key: TranslationKey) => string;

/** "8 matchs" / "8 مباريات". Latin digits in both languages. */
export function matchCountLabel(n: number, lang: Language, t: Translate): string {
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  // The one and two keys spell their number out; French files 0 under "one".
  const form = (rule === "one" && n !== 1) || (rule === "two" && n !== 2) ? "other" : rule;
  const template =
    form === "one"
      ? t("matches.round.count_one")
      : form === "two"
        ? t("matches.round.count_two")
        : form === "few"
          ? t("matches.round.count_few")
          : t("matches.round.count_other");
  return template.replace("{n}", String(n));
}
