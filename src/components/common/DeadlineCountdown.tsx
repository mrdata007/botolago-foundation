import { useEffect, useState, type ReactNode } from "react";
import { useI18n } from "@/i18n/provider";
import { Clock } from "lucide-react";
import { ui, UiPill } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { d, h, m };
}

/**
 * The time left before a Fantasy deadline, to the minute ("1j 13h 59min").
 * The day part drops out on the last day rather than reading "0j".
 *
 * `tone="pill"` (default) is Option A's deadline pill on Home's gameweek band:
 * the action gradient, fully round, a clock, an optional `label` and the
 * countdown — ink-deep throughout, the one foreground the gradient carries in
 * both themes. `tone="plain"` is the countdown alone, in the inherited type
 * and colour, for a caller that draws its own frame.
 *
 * Tabular figures so the minutes do not shift the pill as they tick.
 */
export function DeadlineCountdown({
  iso,
  tone = "pill",
  label,
}: {
  iso: string;
  tone?: "pill" | "plain";
  /** What the deadline is for ("Date limite Fantasy"), set before the time. */
  label?: ReactNode;
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => diff(new Date(iso)));
  useEffect(() => {
    const id = setInterval(() => setNow(diff(new Date(iso))), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  const countdown = (
    <span className={cn("whitespace-nowrap", ui.text.tabular)}>
      {now.d > 0 ? `${now.d}${t("home.days")} ` : null}
      {now.h}
      {t("home.hours")} {now.m}
      {t("home.minutes")}
    </span>
  );

  if (tone === "plain") return countdown;

  return (
    <UiPill tone="action" className="max-w-full">
      <Clock className="h-4 w-4 shrink-0" aria-hidden />
      {label ? (
        <>
          <span className="min-w-0 truncate">{label}</span>
          <span aria-hidden>·</span>
        </>
      ) : null}
      {countdown}
    </UiPill>
  );
}
