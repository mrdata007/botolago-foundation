import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * "5 min de lecture" / "5 دقائق قراءة", with the noun agreeing with the
 * number. Arabic counts differently from French: one minute, two minutes
 * (dual), 3–10 minutes (plural "دقائق") and 11+ minutes (singular again).
 * A fixed "{n} دقيقة" read "3 دقيقة", which is wrong. `Intl.PluralRules`
 * gives the category; each form is a literal key so the i18n gate sees it.
 */
export function readTimeLabel(
  minutes: number,
  lang: "fr" | "ar",
  t: (key: TranslationKey) => string,
): string {
  const n = Math.max(1, Math.round(minutes));
  const rule = new Intl.PluralRules(lang === "ar" ? "ar" : "fr").select(n);
  const template =
    rule === "one"
      ? t("news.read_time_one")
      : rule === "two"
        ? t("news.read_time_two")
        : rule === "few"
          ? t("news.read_time_few")
          : t("news.read_time_other");
  return template.replace("{n}", String(n));
}
