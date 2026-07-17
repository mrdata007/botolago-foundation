import { cn } from "@/lib/utils";

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
  const same = delta === 0;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-0.5 text-[11px] font-bold tabular-nums",
        up && "text-emerald-600",
        down && "text-red-600",
        same && "text-muted-foreground",
        className,
      )}
      aria-label={`change ${delta}`}
    >
      <span aria-hidden>{up ? "▲" : down ? "▼" : "="}</span>
      {Math.abs(delta) || 0}
    </span>
  );
}
