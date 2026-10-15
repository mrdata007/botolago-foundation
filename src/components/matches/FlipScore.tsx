import { liveClock, type LiveStageLabels } from "@/lib/live-minute";
import { UNKNOWN_SCORE_GLYPH } from "@/lib/match-score";
import { useJustChanged, useTickingMinute } from "@/lib/motion";
import type { Match } from "@/types/domain";
import { cn } from "@/lib/utils";

/**
 * One figure of a live score. When it changes while the page is open the new
 * figure drops in (`score-flip`); on first show, and under reduced motion, it
 * is plain. Keyed by its value, so each new figure is a new element and the
 * animation plays from its start.
 *
 * `null` is a score the provider has not sent: a dash, never a zero, and the
 * dash does not animate (only a number is a figure that changed).
 */
export function FlipScore({ value, className }: { value: number | null; className?: string }) {
  const changed = useJustChanged(value) && value !== null;
  return (
    <bdi key={value ?? "unknown"} className={cn(changed && "score-flip", className) || undefined}>
      {value ?? UNKNOWN_SCORE_GLYPH}
    </bdi>
  );
}

/** The live minute ("63′") that ticks on between data refreshes. */
export function TickingMinute({
  minute,
  running,
  period,
  addedTime,
  stages,
  className,
}: {
  minute?: number;
  stages?: LiveStageLabels;
  running: boolean;
  period?: Match["period"];
  addedTime?: number;
  className?: string;
}) {
  const shown = useTickingMinute(minute, running);
  const clock = liveClock({ minute: shown ?? minute, period, addedTime, stages });
  if (clock.minute !== undefined) return <bdi className={className}>{`${clock.minute}′`}</bdi>;
  return clock.stage === undefined ? null : <bdi className={className}>{clock.stage}</bdi>;
}
