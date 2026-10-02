import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * The unit printed beside a points figure: "pt" for one, "pts" otherwise.
 * Arabic abbreviates the unit to one letter, which does not inflect, so both
 * forms read the same there. Both keys are literal calls so the i18n gate
 * sees them. A missing figure takes the plural, as "– pts" reads naturally.
 */
export function pointsUnit(n: number | null | undefined, t: (key: TranslationKey) => string) {
  return n !== null && n !== undefined && Math.abs(n) === 1
    ? t("fantasy.points.unit_one")
    : t("fantasy.points.unit_other");
}
