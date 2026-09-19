import { cn } from "@/lib/utils";
import { ArrowUp, ArrowDown, Minus } from "lucide-react";

/**
 * Rank movement pill, on the same green-up / pink-down scale as
 * `FplRankMovement` in `fpl/primitives.tsx`, but keeps the numeric delta this
 * screen also needs (the primitive is glyph-only).
 */
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
        "inline-flex items-center gap-0.5 rounded-full px-1.5 py-0.5 text-[10px] font-black tabular-nums",
        up && "text-[oklch(0.5_0.17_150)]",
        down && "text-[color:var(--fpl-pink)]",
        !up && !down && "text-[color:var(--fpl-grey-text)]",
        className,
      )}
      aria-label={`change ${delta}`}
    >
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {abs}
    </span>
  );
}
