import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

export function RankChangeIndicator({
  rank,
  previousRank,
  className,
}: {
  rank: number;
  previousRank: number;
  className?: string;
}) {
  const delta = previousRank - rank;
  const up = delta > 0;
  const down = delta < 0;
  const Icon = up ? ArrowUp : down ? ArrowDown : Minus;
  const abs = Math.abs(delta) || 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums ring-1",
        up && "bg-emerald-500/12 text-emerald-700 ring-emerald-600/25",
        down && "bg-red-500/12 text-red-700 ring-red-600/25",
        !up && !down && "bg-muted text-muted-foreground ring-black/5",
        className,
      )}
      aria-label={`change ${delta}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {abs}
    </span>
  );
}
