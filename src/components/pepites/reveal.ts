import type { VersionResponse } from "@/backend/pepites/contracts";

/**
 * When to read the version pointer again (architecture §7, "The reveal").
 *
 * - `countdown`: at `next_reveal_at`, then every 5 s with jitter;
 * - `delayed`: every 30 s with jitter, until the version changes or the state
 *   returns to `current` — so a publication that lands after the delay began
 *   is picked up without a reload;
 * - `current` (or Pépites closed): no timer; the page re-reads on focus.
 *
 * Returns the delay in milliseconds, or null for no timer. `random` is
 * injectable so the jitter is testable.
 */
export const REVEAL_POLL = { countdownMs: 5_000, delayedMs: 30_000, jitter: 0.2 } as const;

export function nextPollDelay(
  pointer: VersionResponse | undefined,
  now: number,
  random: () => number = Math.random,
  intervals: { countdownMs: number; delayedMs: number; jitter: number } = REVEAL_POLL,
): number | null {
  if (!pointer || !pointer.available) return null;
  const jitter = (base: number) => Math.round(base * (1 + (random() * 2 - 1) * intervals.jitter));
  if (pointer.state === "delayed") return jitter(intervals.delayedMs);
  if (pointer.state === "countdown") {
    const reveal = pointer.nextRevealAt ? Date.parse(pointer.nextRevealAt) : Number.NaN;
    if (Number.isFinite(reveal) && reveal > now) return Math.max(250, reveal - now);
    return jitter(intervals.countdownMs);
  }
  return null;
}

/** Seconds left before the reveal, never negative; null without a time. */
export function secondsUntil(nextRevealAt: string | null | undefined, now: number): number | null {
  if (!nextRevealAt) return null;
  const reveal = Date.parse(nextRevealAt);
  if (!Number.isFinite(reveal)) return null;
  return Math.max(0, Math.ceil((reveal - now) / 1000));
}
