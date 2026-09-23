import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Timer } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { cn } from "@/lib/utils";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { d, h, m };
}

/**
 * `tone="onGradient"` is the Home gameweek band's figure: the same countdown
 * set as a stat in the band's own foreground colour (inherited), without the
 * sunken pill, which would read as a grey patch on the band.
 */
export function DeadlineCountdown({
  iso,
  tone = "pill",
}: {
  iso: string;
  tone?: "pill" | "onGradient";
}) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => diff(new Date(iso)));
  useEffect(() => {
    const id = setInterval(() => setNow(diff(new Date(iso))), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  if (tone === "onGradient") {
    return (
      <span className={cn("inline-flex items-center gap-1.5", ui.stat.md)}>
        <Timer className="h-4 w-4 shrink-0" aria-hidden />
        <span className="tabular-nums">
          {now.d}
          {t("home.days")} {now.h}
          {t("home.hours")} {now.m}
          {t("home.minutes")}
        </span>
      </span>
    );
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-3 py-1.5",
        ui.radius.full,
        ui.surface.sunken,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
      )}
    >
      <Timer className="h-3.5 w-3.5 text-[color:var(--brand-accent)]" aria-hidden />
      <span className="tabular-nums">
        {now.d}
        {t("home.days")} {now.h}
        {t("home.hours")} {now.m}
        {t("home.minutes")}
      </span>
    </div>
  );
}
