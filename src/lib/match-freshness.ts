import type { Match } from "@/types/domain";

/**
 * How fresh the match page's read of a live match is, in one place
 * (docs/screens/2026-10-14-live-match-freshness/BRIEF.md).
 *
 * The page refetches a live match every 30 seconds (`matchRefetchInterval`),
 * but nothing on screen said when a read last landed: on 2026-10-13 a page
 * left open read "EN DIRECT 0–1" hours after a 1–1 full time, its minute still
 * ticking. These rules decide what the page says about the age of its data.
 * Two ages are kept apart (audit 2026-10-14, DATA-01):
 *
 * - the READ: when the last request to our own server succeeded. If it is old,
 *   the page cannot reach the server;
 * - the DATA: when the stored fixture last changed (`Match.dataUpdatedAt`). A
 *   successful read of a row nobody has written for hours is a brand new read
 *   of old data, and must not look like a healthy live feed.
 *
 * The states:
 *
 * - `fresh`: the read is at most two minutes old AND the data is not quiet;
 * - `stale`: either is too old: the page says since when, and offers to
 *   refresh;
 * - `expired`: stale AND the kickoff is more than three hours ago: no match is
 *   still on by then, so the page stops claiming it is live and shows a
 *   neutral "score to confirm" instead, keeping the last known score. Only
 *   data written recently is trusted: one that still says live (a long delay,
 *   extra time and penalties) shows the live pill again;
 * - `not_live`: the read does not say live; nothing to say.
 *
 * Without any data timestamp (a source that gives none) the page cannot tell a
 * quiet feed from a live one, so past the three hours it does not call the
 * match live whatever the read says. Nothing here ever decides a result or a
 * final status: it only withdraws a claim the page cannot back.
 */
export type LiveFreshness = "not_live" | "fresh" | "stale" | "expired";

/** A live read older than this is stale (two live refetches missed, and more). */
export const LIVE_STALE_AFTER_MS = 2 * 60_000;

/**
 * Live data not written for this long is quiet, but ONLY where a write is due
 * every tick: a half is being played AND the fixture carries a running minute
 * strictly below the end of its period. The live refresh then writes the
 * fixture on every 60 second tick because the minute moves
 * (docs/backend/SOFASCORE_LIVE_EDGE.md), so five minutes is several missed
 * ticks.
 */
export const LIVE_DATA_QUIET_AFTER_MS = 5 * 60_000;

/**
 * Everywhere else a healthy feed writes nothing for a long time, because a row
 * is written only when the score, status, period or computed minute changes
 * (sofascore-live-refresh.ts `classifyCall`): the minute stops at 45 / 90 /
 * 105 / 120 (added time), is null when the provider sends no half start or no
 * clock (SportsMonks has none either), and does not exist at half-time or in a
 * shoot-out. A goalless half is 45 minutes without a write and half-time is a
 * quarter of an hour more, so this is an hour. It is a limit on how long
 * silence is believed, not a promise: the three-hour expiry still ends a live
 * claim that nothing backs.
 */
export const LIVE_UNWRITTEN_DATA_QUIET_AFTER_MS = 60 * 60_000;

/** A stale live read this long after kickoff is no longer shown as live. */
export const LIVE_EXPIRED_AFTER_KICKOFF_MS = 3 * 60 * 60_000;

/**
 * Coming back to the page (tab shown again, page restored from the
 * back/forward cache, window focused, network back) refetches a live match
 * whose read is older than this: the default `staleTime`, so a return right
 * after a tick does not double it.
 */
export const RETURN_REFETCH_AFTER_MS = 15_000;

type FreshnessMatch = Pick<Match, "status" | "kickoff"> &
  Partial<Pick<Match, "period" | "minute" | "dataUpdatedAt">>;

const RUNNING_PERIODS: readonly NonNullable<Match["period"]>[] = [
  "first_half",
  "second_half",
  "extra_time",
];

/** The minutes the clock stops at: nothing is written while it sits on one. */
const PERIOD_END_MINUTES: readonly number[] = [45, 90, 105, 120];

/**
 * Whether the live refresh is writing this fixture every tick: a half is being
 * played and the minute is a number that is not the end of a period.
 */
function writtenEveryTick(match: FreshnessMatch): boolean {
  return (
    match.period !== undefined &&
    RUNNING_PERIODS.includes(match.period) &&
    typeof match.minute === "number" &&
    !PERIOD_END_MINUTES.includes(match.minute)
  );
}

function dataTime(match: FreshnessMatch): number | null {
  const time = match.dataUpdatedAt === undefined ? NaN : Date.parse(match.dataUpdatedAt);
  return Number.isFinite(time) ? time : null;
}

/**
 * `updatedAt` is when the last successful read landed (React Query's
 * `dataUpdatedAt`), in milliseconds; 0 or less means unknown and is treated as
 * a fresh read rather than alarming the reader about a read that just
 * happened.
 *
 * RESIDUAL: the age of the data is `now` (this device's clock) minus a server
 * timestamp, and the API gives no server "now" to correct it by. A device
 * clock that is minutes fast ages the data by as much; with the generous limit
 * almost everywhere that only matters for a running minute below its cap
 * (5 minutes), where a clock more than that fast reads healthy data as stale.
 */
export function liveFreshness(
  match: FreshnessMatch | undefined,
  updatedAt: number,
  now: number,
): LiveFreshness {
  if (!match || match.status !== "live") return "not_live";

  const readIsOld = updatedAt > 0 && now - updatedAt > LIVE_STALE_AFTER_MS;
  const written = dataTime(match);
  const quietAfter = writtenEveryTick(match)
    ? LIVE_DATA_QUIET_AFTER_MS
    : LIVE_UNWRITTEN_DATA_QUIET_AFTER_MS;
  const dataIsQuiet = written !== null && now - written > quietAfter;

  const kickoff = Date.parse(match.kickoff);
  const pastExpiry = Number.isFinite(kickoff) && now - kickoff > LIVE_EXPIRED_AFTER_KICKOFF_MS;
  // Nothing says the data is current: the kickoff is all that is left to go on.
  const unbacked = written === null && pastExpiry;

  if (!readIsOld && !dataIsQuiet && !unbacked) return "fresh";
  return pastExpiry ? "expired" : "stale";
}

/**
 * The moment the page can still vouch for, when it is not fresh: the older of
 * the last read and the last change of the data (0 when neither is known).
 * "Score not refreshed since 21:05" names this, not the read that merely
 * re-fetched an old row.
 */
export function freshnessSince(match: FreshnessMatch | undefined, updatedAt: number): number {
  const written = match ? dataTime(match) : null;
  if (written === null) return updatedAt > 0 ? updatedAt : 0;
  return updatedAt > 0 ? Math.min(updatedAt, written) : written;
}

/** Whether coming back to the page should refetch this read now. */
export function shouldRefetchOnReturn(
  match: Pick<Match, "status"> | undefined,
  updatedAt: number,
  now: number,
): boolean {
  return match?.status === "live" && now - updatedAt > RETURN_REFETCH_AFTER_MS;
}
