import type { Match } from "@/types/domain";

/**
 * How often match data refreshes itself, in one place: the match page, the
 * Home fixtures and the live strip all follow these rules. Each is a
 * TanStack Query `refetchInterval` (milliseconds, or `false` for "don't"),
 * and every caller also sets `refetchIntervalInBackground: false`, so a
 * hidden tab never polls.
 */

/** How close to kick-off a scheduled match starts refreshing itself. */
export const PRE_KICKOFF_REFRESH_MINUTES = 15;

/** How long past kick-off a match still marked scheduled keeps refreshing. */
export const POST_KICKOFF_REFRESH_MINUTES = 180;

/**
 * How often the match page refetches: every 30 seconds while the match is
 * live, every minute from a quarter of an hour before a scheduled kick-off
 * until the provider flips the status (for at most three hours past it, so a
 * fixture nobody updates does not poll forever), otherwise never. A
 * reader who opened the page before kick-off used to wait for a tab focus to
 * see the match start, and so never saw a goal moment at all.
 */
export function matchRefetchInterval(
  match: Pick<Match, "status" | "kickoff"> | undefined,
  now: number,
): number | false {
  if (!match) return false;
  if (match.status === "live") return 30_000;
  if (match.status !== "scheduled") return false;
  const kickoff = Date.parse(match.kickoff);
  if (Number.isNaN(kickoff)) return false;
  const untilKickoff = kickoff - now;
  return untilKickoff <= PRE_KICKOFF_REFRESH_MINUTES * 60_000 &&
    -untilKickoff <= POST_KICKOFF_REFRESH_MINUTES * 60_000
    ? 60_000
    : false;
}

/**
 * The shortest interval any match in a list asks for: Home's fixtures keep
 * refreshing while one of them is live or about to kick off, so a match that
 * starts while the reader is on the page becomes the live card.
 */
export function matchesRefetchInterval(
  matches: readonly Pick<Match, "status" | "kickoff">[] | undefined,
  now: number,
): number | false {
  let shortest: number | false = false;
  for (const match of matches ?? []) {
    const interval = matchRefetchInterval(match, now);
    if (interval !== false && (shortest === false || interval < shortest)) shortest = interval;
  }
  return shortest;
}

/** Every 30 seconds while something is live; otherwise once a minute. */
export const LIVE_STRIP_IDLE_REFRESH_MS = 60_000;

/**
 * The live strip's cadence. It has no fixture list to read a kick-off from,
 * so with nothing live it keeps a slow watch instead of none: stopping there
 * meant a match that went live while the reader stayed on Home or Matches
 * never brought the strip up.
 */
export function liveStripRefetchInterval(liveCount: number): number {
  return liveCount > 0 ? 30_000 : LIVE_STRIP_IDLE_REFRESH_MS;
}
