import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

type Translate = (key: TranslationKey) => string;

/**
 * Which form of a counted phrase to use. Arabic has a form of its own for 1,
 * for 2 and for 3 to 10. The one and two keys spell their number out in both
 * languages, so they are for exactly 1 and 2 (French files 0 under "one" and
 * would otherwise print "1" for none). Each form is a literal translation call
 * below so the i18n gate sees every key.
 */
function form(n: number, lang: Language): "one" | "two" | "few" | "other" {
  if (lang === "fr") return n === 1 ? "one" : n === 2 ? "two" : "other";
  const rule = new Intl.PluralRules("ar").select(n);
  if (rule === "one") return n === 1 ? "one" : "other";
  if (rule === "two") return n === 2 ? "two" : "other";
  return rule === "few" ? "few" : "other";
}

/** "3 titulaires n'ont pas de match en J2". */
export function noMatchLabel(
  n: number,
  gameweek: number,
  lang: Language,
  t: Translate,
  format: (value: number) => string,
): string {
  const f = form(n, lang);
  const template =
    f === "one"
      ? t("fantasy.deadline_card.no_match_one")
      : f === "two"
        ? t("fantasy.deadline_card.no_match_two")
        : f === "few"
          ? t("fantasy.deadline_card.no_match_few")
          : t("fantasy.deadline_card.no_match_other");
  return template.replace("{n}", format(n)).replace("{gw}", format(gameweek));
}

/** "Transferts · 1 gratuit". */
export function transfersLabel(
  n: number,
  lang: Language,
  t: Translate,
  format: (value: number) => string,
): string {
  const f = form(n, lang);
  const template =
    f === "one"
      ? t("fantasy.deadline_card.transfers_one")
      : f === "two"
        ? t("fantasy.deadline_card.transfers_two")
        : f === "few"
          ? t("fantasy.deadline_card.transfers_few")
          : t("fantasy.deadline_card.transfers_other");
  return template.replace("{n}", format(n));
}
