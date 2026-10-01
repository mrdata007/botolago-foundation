import { Link } from "@tanstack/react-router";
import { ChevronRight, Clock } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { cn } from "@/lib/utils";

/**
 * The strip under the header in the 72 hours before a Fantasy deadline:
 * "Fantasy J2 : plus que 23 h 58 · ven. 15:30 ›". A light blue band
 * (`--surface-selected`) with navy text, a link to the Fantasy hub. The
 * caller decides whether to show it (`deadlineStripTime`) and passes the time
 * left, so the strip itself holds no clock.
 *
 * Full-bleed on a phone, flush under the bar (cancelling the screen's top
 * padding); inside the content column from `sm`.
 */
export function DeadlineStrip({
  gameweek,
  deadline,
  time,
  flush = true,
}: {
  gameweek: number;
  deadline: string;
  time: { hours: number; minutes: number };
  /** Cancel the screen's top padding; false when something already sits above. */
  flush?: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const left = `${nf.format(time.hours)} ${t("home.hours")} ${nf.format(time.minutes).padStart(2, lang === "ar" ? "٠" : "0")}`;
  const when = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(deadline));
  const text = t("home.deadline_strip")
    .replace("{gw}", nf.format(gameweek))
    .replace("{time}", left)
    .replace("{when}", when);

  return (
    <Link
      to="/fantasy"
      data-testid="deadline-strip"
      className={cn(
        "flex min-h-[var(--ui-tap-min)] items-center gap-2 px-[var(--ui-gutter)] py-2",
        flush && "-mx-[var(--ui-gutter)] -mt-4",
        flush && "sm:mx-0 sm:mt-0 sm:rounded-[var(--ui-radius-card)]",
        "bg-[color:var(--surface-selected)] text-[color:var(--ui-ink-fg)]",
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.focus,
      )}
    >
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      <span className="min-w-0 flex-1 text-balance">{text}</span>
      <ChevronRight className="h-4 w-4 shrink-0 rtl:-scale-x-100" aria-hidden />
    </Link>
  );
}
