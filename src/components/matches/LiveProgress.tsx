import { halfProgress } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * How far into the match, as two bars with a gap between them for the
 * interval: the first half fills over minutes 0-45, the second over 45-90.
 * Decorative (the pill says the minute), so hidden from assistive tech.
 *
 * It fills with `scaleX` from the inline start, so it moves on the GPU, runs
 * the right way in Arabic and, with reduced motion, simply shows its state.
 */
export function LiveProgress({
  minute,
  halfTime = false,
  className,
}: {
  minute: number | undefined;
  halfTime?: boolean;
  className?: string;
}) {
  const { first, second } = halfProgress(minute, halfTime);
  return (
    <div aria-hidden className={cn("flex h-[3px] w-full gap-[3px]", className)}>
      {[first, second].map((fill, index) => (
        <span key={index} className="flex-1 overflow-hidden bg-[color:var(--ui-rule)]">
          <span
            className={cn(
              "block h-full w-full bg-[color:var(--ui-live)] ltr:origin-left rtl:origin-right",
              "transition-transform duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
            )}
            style={{ transform: `scaleX(${fill})` }}
          />
        </span>
      ))}
    </div>
  );
}
