import type { Match } from "@/types/domain";

/** The match stage in words, shown in place of a minute the server did not write. */
export interface LiveStageLabels {
  readonly first_half: string;
  readonly half_time: string;
  readonly second_half: string;
  readonly extra_time: string;
  readonly penalties: string;
}

/** The minutes where SofaScore's clock stops while time is added. */
export const PERIOD_END_MINUTES: ReadonlySet<number> = new Set([45, 90, 105, 120]);

/**
 * The live clock as the product writes it.
 *
 * The server computes the minute from the current half's start time and caps it
 * at the end of the period (45 / 90 / 105 / 120). A capped minute reads "45+" /
 * "90+" / "105+" / "120+": the clock stopped, time is being added. The added
 * minutes themselves ("45+2") are shown only when the provider gave them
 * (`addedTime`), never worked out.
 *
 * With no minute (the feed did not send the half's start time) nothing is made
 * up: when `stages` is given the label is the stage of the match instead
 * ("1st half", "Half-time", "2nd half", extra time, penalties), so a live match
 * never shows a blank clock. Half-time and penalties always read as their stage.
 * Before and after the match there is no label.
 *
 * `minute` may be the ticking minute (`useTickingMinute`, at most one ahead of the
 * data); anything at or past the end of the period reads the same. In extra time
 * 105 can only be the first half's cap (the second half starts at 106).
 */
export function liveMinuteLabel(input: {
  readonly minute?: number | null;
  readonly period?: Match["period"] | null;
  readonly addedTime?: number | null;
  readonly stages?: LiveStageLabels;
}): string | undefined {
  const { minute, period, addedTime, stages } = input;
  const hasMinute =
    minute !== undefined && minute !== null && Number.isFinite(minute) && minute >= 0;
  if (period === undefined || period === null) {
    return hasMinute ? String(Math.floor(minute)) : undefined;
  }
  if (period === "half_time") return stages?.half_time;
  if (period === "penalties") return stages?.penalties;
  if (period === "pre_match" || period === "post_match") return undefined;
  if (!hasMinute) return stages?.[period];
  const whole = Math.floor(minute);
  const added =
    addedTime !== undefined && addedTime !== null && addedTime > 0 ? Math.floor(addedTime) : 0;
  const end = periodEnd(period, whole);
  if (end !== null) return added > 0 ? `${end}+${added}` : `${end}+`;
  return String(whole);
}

/**
 * The clock split for rendering: `minute` (a number or "45+", the pill adds the
 * prime) when the server gave one, else `stage` (words, no prime). Never both.
 */
export function liveClock(input: Parameters<typeof liveMinuteLabel>[0]): {
  readonly minute?: string;
  readonly stage?: string;
} {
  const minute = liveMinuteLabel({ ...input, stages: undefined });
  if (minute !== undefined) return { minute };
  const stage = liveMinuteLabel(input);
  return stage === undefined ? {} : { stage };
}

/** The end of the period the minute has reached, or null while it is still running. */
function periodEnd(
  period: "first_half" | "second_half" | "extra_time",
  whole: number,
): number | null {
  switch (period) {
    case "first_half":
      return whole >= 45 ? 45 : null;
    case "second_half":
      return whole >= 90 ? 90 : null;
    case "extra_time":
      if (whole >= 120) return 120;
      return whole === 105 ? 105 : null;
  }
}
