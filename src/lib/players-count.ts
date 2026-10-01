import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

/**
 * "25 joueurs sur 621", but "1 joueur sur 1" / "لاعب واحد من أصل 1".
 *
 * Arabic has a form for one, for two, for 3-10 and for 11 and over. Each form
 * is its own key, picked by `Intl.PluralRules`, and written as a literal call
 * so the i18n gate sees every one (the pattern of `standings-copy.ts`).
 */
export function playersShowingLabel(
  shown: number,
  total: number,
  lang: Language,
  t: (key: TranslationKey) => string,
  format: (value: number) => string,
): string {
  const picked = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(shown);
  // The one and two keys spell their number out, and French files 0 under
  // "one" too: they are for exactly 1 and 2 (as in `standings-copy.ts`).
  const rule =
    (picked === "one" && shown !== 1) || (picked === "two" && shown !== 2) ? "other" : picked;
  const template =
    rule === "one"
      ? t("fantasy.players.showing_one")
      : rule === "two"
        ? t("fantasy.players.showing_two")
        : rule === "few"
          ? t("fantasy.players.showing_few")
          : t("fantasy.players.showing_other");
  return template.replace("{n}", format(shown)).replace("{total}", format(total));
}
