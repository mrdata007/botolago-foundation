import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export function GameweekSelector({
  value,
  min = 1,
  max = 30,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const prev = () => onChange(Math.max(min, value - 1));
  const next = () => onChange(Math.min(max, value + 1));
  // Chevrons are logical (start = previous, end = next). The .lucide-chevron-*
  // classes are flipped in RTL by global styles so the visual arrow matches.
  return (
    <div
      className={cn("surface-3 inline-flex items-center gap-1 rounded-full px-1 py-1", className)}
    >
      <button
        onClick={prev}
        disabled={value <= min}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-white/70 disabled:opacity-40"
        aria-label={t("fantasy.points.gameweek") + " -1"}
      >
        <ChevronLeft className="h-4 w-4" aria-hidden />
      </button>
      <div className="flex min-w-28 select-none flex-col items-center leading-tight">
        <span className="text-[9px] font-black uppercase tracking-[0.16em] text-muted-foreground">
          {t("fantasy.points.gameweek")}
        </span>
        <span className="text-sm font-black tabular-nums text-foreground">{value}</span>
      </div>
      <button
        onClick={next}
        disabled={value >= max}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-white/70 disabled:opacity-40"
        aria-label={t("fantasy.points.gameweek") + " +1"}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
