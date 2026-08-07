import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface GameweekNavigation {
  previous: number;
  next: number;
  hasPrevious: boolean;
  hasNext: boolean;
}

export function getGameweekNavigation(
  value: number,
  min = 1,
  max = 30,
  options?: readonly number[],
): GameweekNavigation {
  if (options?.length) {
    const ordered = Array.from(
      new Set([value, ...options.filter((item) => Number.isInteger(item) && item > 0)]),
    ).sort((a, b) => a - b);
    const index = ordered.indexOf(value);
    return {
      previous: ordered[Math.max(0, index - 1)] ?? value,
      next: ordered[Math.min(ordered.length - 1, index + 1)] ?? value,
      hasPrevious: index > 0,
      hasNext: index >= 0 && index < ordered.length - 1,
    };
  }

  return {
    previous: Math.max(min, value - 1),
    next: Math.min(max, value + 1),
    hasPrevious: value > min,
    hasNext: value < max,
  };
}

export function GameweekSelector({
  value,
  min = 1,
  max = 30,
  options,
  onChange,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  options?: readonly number[];
  onChange: (n: number) => void;
  className?: string;
}) {
  const { t } = useI18n();
  const navigation = getGameweekNavigation(value, min, max, options);
  const prev = () => {
    if (navigation.hasPrevious) onChange(navigation.previous);
  };
  const next = () => {
    if (navigation.hasNext) onChange(navigation.next);
  };
  // Chevrons are logical (start = previous, end = next). The .lucide-chevron-*
  // classes are flipped in RTL by global styles so the visual arrow matches.
  return (
    <div
      className={cn("surface-3 inline-flex items-center gap-1 rounded-full px-1 py-1", className)}
    >
      <button
        type="button"
        onClick={prev}
        disabled={!navigation.hasPrevious}
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
        type="button"
        onClick={next}
        disabled={!navigation.hasNext}
        className="grid h-9 w-9 place-items-center rounded-full text-foreground transition-colors hover:bg-white/70 disabled:opacity-40"
        aria-label={t("fantasy.points.gameweek") + " +1"}
      >
        <ChevronRight className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
}
