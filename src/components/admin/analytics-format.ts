/**
 * Number and date formatting for the admin dashboard, kept free of React so
 * it can be tested without a DOM. Latin digits in both languages, as the rest
 * of the console writes them (`ar-MA-u-nu-latn`).
 */

type Lang = "fr" | "ar";

export function analyticsLocale(lang: Lang): string {
  return lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR";
}

/** 1 284 as is; 12 900 as "12,9 k" -- a tile is read at a glance. */
export function formatCount(value: number, lang: Lang): string {
  return new Intl.NumberFormat(analyticsLocale(lang), {
    notation: value >= 10_000 ? "compact" : "standard",
    maximumFractionDigits: 1,
  }).format(value);
}

/** "25 août" for a calendar day sent as YYYY-MM-DD (a date, not an instant). */
export function formatDay(isoDate: string, lang: Lang, withYear = false): string {
  return new Date(`${isoDate}T00:00:00Z`).toLocaleDateString(analyticsLocale(lang), {
    day: "numeric",
    month: "short",
    ...(withYear ? { year: "numeric" } : {}),
    timeZone: "UTC",
  });
}

/**
 * The top of the value axis. The axis shows three ticks -- 0, half, top -- so
 * the half is picked first: the smallest clean step at or above half the
 * busiest day, which keeps every tick a whole number (0-2-4, 0-15-30,
 * 0-800-1 600) and the tallest column in the upper half of the plot.
 */
export function axisTop(max: number): number {
  const half = Math.max(max / 2, 1);
  const power = 10 ** Math.floor(Math.log10(half));
  // Below ten the steps must be whole numbers themselves; from ten up, 1.5×
  // and 2.5× a power of ten are whole too (15, 25, 150...).
  const factors = power >= 10 ? [1, 1.5, 2, 2.5, 3, 4, 5, 6, 8, 10] : [1, 2, 3, 4, 5, 6, 8, 10];
  const step = factors.map((factor) => factor * power).find((candidate) => candidate >= half);
  return (step ?? 10 * power) * 2;
}

/** "1 suppression demandée", "3 suppressions demandées" (0 and 1 are singular in French). */
export function frCount(value: number, one: string, other: string): string {
  const form = new Intl.PluralRules("fr-FR").select(value) === "one" ? one : other;
  return `${formatCount(value, "fr")} ${form}`;
}

/**
 * Sign-ups with the noun agreeing with its number, in both languages. Arabic
 * has six plural forms; this one noun is written out for each of them.
 */
export function signupsLabel(value: number, lang: Lang): string {
  if (lang === "fr") return frCount(value, "inscription", "inscriptions");
  const n = formatCount(value, "ar");
  switch (new Intl.PluralRules("ar").select(value)) {
    case "zero":
      return `${n} تسجيل`;
    case "one":
      return "تسجيل واحد";
    case "two":
      return "تسجيلان";
    case "few":
      return `${n} تسجيلات`;
    case "many":
      return `${n} تسجيلاً`;
    default:
      return `${n} تسجيل`;
  }
}
