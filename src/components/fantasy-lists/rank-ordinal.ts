import type { TranslationKey } from "@/i18n/dictionaries";
import type { Language } from "@/types/domain";

/**
 * A rank written as an ordinal, split into the words around the figure.
 *
 * The figure is set in the display face (`ui.score.*`), which is sized for
 * digits only: Changa's Arabic letters rise above its 1.1 line box and a
 * `truncate` cuts them. So the affix never shares the figure's element — it
 * is a sibling span on the text ramp, which carries each language's own
 * leading. French puts it after the number ("12 483e", "1er"); Arabic puts a
 * word before it ("المركز 12.483"). Both come from one `{n}` template per
 * plural category, so the i18n gate sees every form as a literal key.
 */
export interface OrdinalParts {
  /** Words before the figure (Arabic "المركز"); empty in French. */
  before: string;
  /** The localized figure. */
  figure: string;
  /** Words after the figure (French "e" / "er"); empty in Arabic. */
  after: string;
}

/** Splits a `{n}` template around its placeholder and drops the joining space. */
export function splitAroundFigure(template: string, figure: string): OrdinalParts {
  const at = template.indexOf("{n}");
  if (at < 0) return { before: "", figure, after: "" };
  return {
    before: template.slice(0, at).trim(),
    figure,
    after: template.slice(at + "{n}".length).trim(),
  };
}

/**
 * `rank` as ordinal parts in `lang`. `Intl.PluralRules` with `type: "ordinal"`
 * picks the category — French "one" is 1 ("1er"), everything else "other"
 * ("2e", "12 483e"); Arabic has only "other".
 */
export function rankOrdinal(
  rank: number,
  lang: Language,
  t: (key: TranslationKey) => string,
  format: (value: number) => string,
): OrdinalParts {
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr", { type: "ordinal" }).select(rank);
  const template =
    rule === "one" ? t("fantasy.rankings.ordinal_one") : t("fantasy.rankings.ordinal_other");
  return splitAroundFigure(template, format(rank));
}
