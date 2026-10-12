import type { Match } from "@/types/domain";

/**
 * The live minute as the product writes it.
 *
 * SofaScore's clock stops at 45 (first half) and 90 (second half), and at 120
 * in extra time, while the referee adds time. A bare "90" for five minutes
 * reads as a frozen feed, and counting on from 90 would be a minute nobody
 * measured. So once the clock has reached the end of a period the label says
 * "45+" / "90+" / "120+", from the period alone. The added minutes themselves
 * ("45+2") are shown only when the provider gave them (`addedTime`), never
 * guessed.
 *
 * `minute` may already be the ticking minute (`useTickingMinute`, at most one
 * ahead of the data): anything at or past the end of the period reads the
 * same. No minute, no label: nothing is made up. Half-time, penalties and the
 * pre- and post-match periods have no running minute.
 *
 * Extra time has one period in the data, so only its end (120) is told apart;
 * the stoppage of its first half (105) cannot be, and shows as the number.
 */
export function liveMinuteLabel(input: {
  readonly minute?: number | null;
  readonly period?: Match["period"] | null;
  readonly addedTime?: number | null;
}): string | undefined {
  const { minute, period, addedTime } = input;
  if (minute === undefined || minute === null || !Number.isFinite(minute) || minute < 0) {
    return undefined;
  }
  const whole = Math.floor(minute);
  const added =
    addedTime !== undefined && addedTime !== null && addedTime > 0 ? Math.floor(addedTime) : 0;
  const end = periodEnd(period);
  if (period === undefined || period === null) return String(whole);
  if (end === null) return undefined;
  if (whole >= end) return added > 0 ? `${end}+${added}` : `${end}+`;
  return String(whole);
}

function periodEnd(period: Match["period"] | null | undefined): number | null {
  switch (period) {
    case "first_half":
      return 45;
    case "second_half":
      return 90;
    case "extra_time":
      return 120;
    default:
      return null;
  }
}
