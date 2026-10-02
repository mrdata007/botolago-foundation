import type { DeadlineCountdown } from "@/components/fpl/deadline";

/** How far ahead of a Fantasy deadline the strip starts showing. */
export const DEADLINE_STRIP_HOURS = 72;

/**
 * What the deadline strip says: the whole hours and minutes left, or `null`
 * when it should not show — the countdown is not known yet (server render),
 * the deadline has passed, or it is still more than 72 hours away.
 */
export function deadlineStripTime(
  left: DeadlineCountdown | null,
): { hours: number; minutes: number } | null {
  if (!left || left.passed) return null;
  const hours = left.days * 24 + left.hours;
  const withinWindow =
    hours < DEADLINE_STRIP_HOURS || (hours === DEADLINE_STRIP_HOURS && left.minutes === 0);
  return withinWindow ? { hours, minutes: left.minutes } : null;
}

/** True while a deadline is still ahead and less than `hours` whole hours away. */
export function deadlineWithinHours(left: DeadlineCountdown | null, hours: number): boolean {
  if (!left || left.passed) return false;
  return left.days * 24 + left.hours < hours;
}
