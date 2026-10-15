import type { Language } from "@/types/domain";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";

/**
 * Bilingual relative-time formatter for editorial timestamps.
 * Uses Intl.RelativeTimeFormat, falling back gracefully.
 */
export function formatRelativeTime(iso: string, lang: Language): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: abs > 365 * 86400 ? "numeric" : undefined,
  }).format(new Date(iso));
}

export function formatFullDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}

/**
 * A calendar date in the language the reader chose, never the browser's:
 * « 14 octobre 2026 » / « 14 أكتوبر 2026 ».
 *
 * The locale is explicit (`fr-FR`, or `ar-MA` with Latin digits forced, like
 * every other date in the product) and the day is the one on Morocco's
 * calendar (`moroccoDateTimeFormat`, the app's own Casablanca clock, the same
 * on the server and in every browser), so an English browser or a reader in
 * another time zone sees the same date as everyone else. A bare
 * `toLocaleDateString()` answered `10/14/2026` to an English browser inside a
 * French page (audit 2026-10-14, LOC-07). Empty for an invalid date.
 */
export function formatMoroccoDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return moroccoDateTimeFormat(lang === "ar" ? "ar-MA-u-nu-latn" : "fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}
