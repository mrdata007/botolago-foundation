import { useJustChanged, useTickingMinute } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * One figure of a live score. When it changes while the page is open the new
 * figure drops in (`score-flip`); on first show, and under reduced motion, it
 * is plain. Keyed by its value, so each new figure is a new element and the
 * animation plays from its start.
 */
export function FlipScore({ value, className }: { value: number; className?: string }) {
  const changed = useJustChanged(value);
  return (
    <bdi key={value} className={cn(changed && "score-flip", className) || undefined}>
      {value}
    </bdi>
  );
}

/** The live minute ("63′") that ticks on between data refreshes. */
export function TickingMinute({
  minute,
  running,
  className,
}: {
  minute: number;
  running: boolean;
  className?: string;
}) {
  const shown = useTickingMinute(minute, running);
  return <bdi className={className}>{`${shown ?? minute}′`}</bdi>;
}
