import { isolateText } from "@/components/manager-card/interpolate";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

type Translate = (key: TranslationKey) => string;
type Format = (value: number) => string;

/**
 * The Fantasy picker's and the transfer review's counted phrases. Arabic has
 * a word of its own for none, for 1 and for 2, a plural for 3 to 10 (and 103,
 * 210…) and the singular again after 11 ("عرض لاعبين", "عرض 3 لاعبين", "عرض
 * 11 لاعبًا"); French files 0 under "one" and would print "Voir 0 joueur…".
 * Each form is its own key, picked by `Intl.PluralRules` and written as a
 * literal translation call so the i18n gate sees every one (the pattern of
 * `standings-copy.ts` and `picker-copy.ts`).
 *
 * The bare key is the general form (`other`); the `_zero`, `_one`, `_two` and
 * `_few` keys spell their number out where it is exactly 0, 1 or 2, so they
 * carry no `{n}` unless the form is the 3-to-10 one.
 */
export type CountForm = "zero" | "one" | "two" | "few" | "other";

export function countForm(n: number, lang: Language): CountForm {
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  // "one" and "two" are for exactly 1 and 2: French files 0 under "one".
  if (n === 0) return "zero";
  if (rule === "one") return n === 1 ? "one" : "other";
  if (rule === "two") return n === 2 ? "two" : "other";
  return rule === "few" ? "few" : "other";
}

/**
 * A number inside Arabic text sits in an isolate, so a neighbouring Latin
 * word or sign cannot reorder it. French text takes it as is.
 */
function figure(value: number, lang: Language, format: Format): string {
  const text = format(value);
  return lang === "ar" ? isolateText(text) : text;
}

/** The picker's filter sheet button: "Voir 12 joueurs" / "عرض 12 لاعبًا". */
export function pickerApplyLabel(n: number, lang: Language, t: Translate, format: Format): string {
  const form = countForm(n, lang);
  const template =
    form === "zero"
      ? t("fpl.pick.filters_apply_zero")
      : form === "one"
        ? t("fpl.pick.filters_apply_one")
        : form === "two"
          ? t("fpl.pick.filters_apply_two")
          : form === "few"
            ? t("fpl.pick.filters_apply_few")
            : t("fpl.pick.filters_apply");
  return template.replace("{n}", figure(n, lang, format));
}

/**
 * The transfer review's headline: "Vous allez effectuer 3 transferts." /
 * "ستُجري 3 انتقالات." Nothing to confirm cannot be reached; it reads as the
 * general form rather than inventing a sentence for it.
 */
export function transferCountLabel(
  n: number,
  lang: Language,
  t: Translate,
  format: Format,
): string {
  const form = countForm(n, lang);
  const template =
    form === "one"
      ? t("fpl.about_to_transfer_one")
      : form === "two"
        ? t("fpl.about_to_transfer_two")
        : form === "few"
          ? t("fpl.about_to_transfer_few")
          : t("fpl.about_to_transfer");
  return template.replace("{n}", figure(n, lang, format));
}

/**
 * A count with no action to name: "Joueurs affichés : 12 sur 40". It is a
 * label and a figure, not a sentence, so it never needs a plural.
 */
export function playersShownLabel(
  shown: number,
  total: number,
  lang: Language,
  t: Translate,
  format: Format,
): string {
  return t("fantasy.players.showing")
    .replace("{n}", figure(shown, lang, format))
    .replace("{total}", figure(total, lang, format));
}
