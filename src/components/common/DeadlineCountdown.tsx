import { useEffect, useState } from "react";
import { useI18n } from "@/i18n/provider";
import { Timer } from "lucide-react";

function diff(target: Date) {
  const ms = Math.max(0, target.getTime() - Date.now());
  const d = Math.floor(ms / 86_400_000);
  const h = Math.floor((ms % 86_400_000) / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  return { d, h, m };
}

export function DeadlineCountdown({ iso }: { iso: string }) {
  const { t } = useI18n();
  const [now, setNow] = useState(() => diff(new Date(iso)));
  useEffect(() => {
    const id = setInterval(() => setNow(diff(new Date(iso))), 30_000);
    return () => clearInterval(id);
  }, [iso]);

  return (
    <div className="inline-flex items-center gap-2 rounded-full border border-[var(--glass-border)] bg-white/50 px-3 py-1.5 text-xs font-semibold text-foreground backdrop-blur">
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
