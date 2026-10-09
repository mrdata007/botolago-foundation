/** Face-à-face's comparison, pure (plan 4.4). */

/** The width of the bar under the higher value, for a value of 99. */
const BAR_FULL = 48;

/** Which of two values is higher: `a`, `b`, `equal`, or `none` when either is missing. */
export function compareValues(a: number | null, b: number | null): "a" | "b" | "equal" | "none" {
  if (a === null || b === null) return "none";
  if (a === b) return "equal";
  return a > b ? "a" : "b";
}

/** The width of a value's bar in px: value ÷ 99 of 48. */
export function barWidth(value: number): number {
  return Math.round((Math.max(0, Math.min(99, value)) / 99) * BAR_FULL * 10) / 10;
}
