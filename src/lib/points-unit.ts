import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * The unit printed after a Fantasy points figure: "pt" for exactly one point,
 * "pts" otherwise ("1 pt", "0 pts", "9 pts", "-4 pts").
 *
 * Only a figure of exactly 1 (or -1) is singular. French files 0 under its
 * "one" plural category too, but "0 pt" reads as a typo and the standings
 * already print "0 pts" (`standings-copy.ts`), so this follows them. Arabic
 * has a one-letter abbreviation that does not change with the number, so both
 * keys hold the same letter there; the full Arabic forms ("نقطة واحدة",
 * "نقطتان", "5 نقاط") are `pointsLabel`'s.
 *
 * Written as two literal translation calls so the i18n gate sees both keys.
 */
export function pointsUnit(points: number, t: (key: TranslationKey) => string): string {
  return Math.abs(points) === 1 ? t("fantasy.points.abbr_one") : t("fantasy.points.abbr");
}
