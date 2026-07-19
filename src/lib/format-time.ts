import type { Language } from "@/types/domain";

/**
 * Bilingual relative-time formatter for editorial timestamps.
 * Uses Intl.RelativeTimeFormat, falling back gracefully.
 */
export function formatRelativeTime(iso: string, lang: Language): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(lang === "ar" ? "ar" : "fr", { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "fr", {
    day: "numeric", month: "short", year: abs > 365 * 86400 ? "numeric" : undefined,
  }).format(new Date(iso));
}

export function formatFullDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar" : "fr", {
    day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit",
  }).format(d);
}
