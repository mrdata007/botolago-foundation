/**
 * The pressure chart's numbers (A-Stats), from the provider's pressure index:
 * one value per club per minute, only one club positive at a time.
 *
 * Pure, and kept out of `PressureChart.tsx` so that file exports components
 * only and this one is unit-tested on its own.
 */

export interface PressurePoint {
  readonly minute: number;
  readonly homeValue: number | null;
  readonly awayValue: number | null;
}

export interface PressureBin {
  /** First and last minute the bin covers: 1–5, 6–10, …, 91–95. */
  readonly from: number;
  readonly to: number;
  /** Each club's average over the minutes the provider sent in the bin. */
  readonly home: number;
  readonly away: number;
}

/** Five minutes a bar: ~18 bars for a match, legible at 320px. */
export const PRESSURE_BIN_MINUTES = 5;

/**
 * The curve in five-minute bins, from the first to the last minute there is
 * data for. A minute a club has no value for counts as 0 (the other club had
 * the pressure); a bin the provider sent nothing for is 0 for both, so the
 * time axis never skips. Minute 0 joins the first bin.
 */
export function pressureBins(
  points: readonly PressurePoint[],
  binMinutes = PRESSURE_BIN_MINUTES,
): PressureBin[] {
  if (points.length === 0) return [];
  const sums = new Map<number, { home: number; away: number; minutes: number }>();
  let last = 0;
  for (const point of points) {
    const index = Math.max(0, Math.ceil(point.minute / binMinutes) - 1);
    last = Math.max(last, index);
    const sum = sums.get(index) ?? { home: 0, away: 0, minutes: 0 };
    sum.home += point.homeValue ?? 0;
    sum.away += point.awayValue ?? 0;
    sum.minutes += 1;
    sums.set(index, sum);
  }
  return Array.from({ length: last + 1 }, (_, index) => {
    const sum = sums.get(index);
    return {
      from: index * binMinutes + 1,
      to: (index + 1) * binMinutes,
      home: sum ? sum.home / sum.minutes : 0,
      away: sum ? sum.away / sum.minutes : 0,
    };
  });
}

/**
 * Each club's share of all the pressure in the match, as whole percentages
 * that add up to 100. `null` when there was none at all.
 */
export function pressureShare(
  points: readonly PressurePoint[],
): { home: number; away: number } | null {
  let home = 0;
  let away = 0;
  for (const point of points) {
    home += point.homeValue ?? 0;
    away += point.awayValue ?? 0;
  }
  if (home + away <= 0) return null;
  const homeShare = Math.round((home / (home + away)) * 100);
  return { home: homeShare, away: 100 - homeShare };
}
