import type { Language } from "@/types/domain";

import { moroccoDateTimeFormat } from "./morocco-time";

/**
 * Editorial dates, printed on Morocco's clock (`morocco-time.ts`).
 *
 * The server renders in UTC and a reader's phone in its own zone, and their
 * time-zone data disagree about Morocco after 2026-09-20. A formatter with no
 * zone of its own therefore printed one day on the server and the next in the
 * browser for anything published late in the evening, and React threw
 * "Hydration failed" on the news pages. Every date here goes through the
 * app's Morocco clock, which answers the same on every runtime.
 */
const locale = (lang: Language) => (lang === "ar" ? "ar-MA" : "fr-FR");

/**
 * Bilingual relative-time formatter for editorial timestamps.
 * Uses Intl.RelativeTimeFormat; past a week, the Moroccan calendar date.
 */
export function formatRelativeTime(iso: string, lang: Language): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.round((then - Date.now()) / 1000);
  const abs = Math.abs(diffSec);
  const rtf = new Intl.RelativeTimeFormat(locale(lang), { numeric: "auto" });
  if (abs < 60) return rtf.format(Math.round(diffSec), "second");
  if (abs < 3600) return rtf.format(Math.round(diffSec / 60), "minute");
  if (abs < 86400) return rtf.format(Math.round(diffSec / 3600), "hour");
  if (abs < 7 * 86400) return rtf.format(Math.round(diffSec / 86400), "day");
  return moroccoDateTimeFormat(locale(lang), {
    day: "numeric",
    month: "short",
    year: abs > 365 * 86400 ? "numeric" : undefined,
  }).format(then);
}

export function formatFullDate(iso: string, lang: Language): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return moroccoDateTimeFormat(locale(lang), {
    day: "numeric",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
