import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import type { Language } from "@/types/domain";

/**
 * How a journée's publication moment reads (migration 20261030100000), in
 * Morocco's time, in French and in Arabic.
 */

/**
 * The day and the hour of the moment, in Morocco's time whatever the viewer's
 * clock says. French: "samedi 31 oct." and "14h" (or "14h30"). Arabic:
 * "السبت 31 أكتوبر" and "14:00", with Latin digits like the rest of the screen.
 */
export function formatPublicationMoment(
  lang: Language,
  publishAt: string,
): { day: string; time: string } {
  const instant = new Date(publishAt);
  if (lang === "ar") {
    const locale = "ar-MA-u-nu-latn";
    return {
      day: moroccoDateTimeFormat(locale, { weekday: "long", day: "numeric", month: "long" }).format(
        instant,
      ),
      time: moroccoDateTimeFormat(locale, {
        hour: "2-digit",
        minute: "2-digit",
        hourCycle: "h23",
      }).format(instant),
    };
  }
  const parts = moroccoDateTimeFormat("fr-FR", {
    hour: "numeric",
    minute: "2-digit",
    hourCycle: "h23",
  }).formatToParts(instant);
  const hour = parts.find((part) => part.type === "hour")?.value ?? "";
  const minute = parts.find((part) => part.type === "minute")?.value ?? "00";
  return {
    day: moroccoDateTimeFormat("fr-FR", { weekday: "long", day: "numeric", month: "short" }).format(
      instant,
    ),
    time: minute === "00" ? `${hour}h` : `${hour}h${minute}`,
  };
}
