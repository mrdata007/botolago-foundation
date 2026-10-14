import type { Match } from "@/types/domain";

/**
 * How fresh the match page's read of a live match is, in one place
 * (docs/screens/2026-10-14-live-match-freshness/BRIEF.md).
 *
 * The page refetches a live match every 30 seconds (`matchRefetchInterval`),
 * but nothing on screen said when a read last landed: on 2026-10-13 a page
 * left open read "EN DIRECT 0–1" hours after a 1–1 full time, its minute still
 * ticking. These rules decide what the page says about the age of its data:
 *
 * - `fresh`: the last successful read is at most two minutes old;
 * - `stale`: older than that (refetches failing, or none happening): the page
 *   says since when, and offers to refresh;
 * - `expired`: stale AND the kickoff is more than three hours ago: no match is
 *   still on by then, so the page stops claiming it is live and shows a
 *   neutral "score to confirm" instead. Only a fresh read is trusted: one that
 *   still says live (a long delay, extra time and penalties) shows the live
 *   pill again.
 * - `not_live`: the read does not say live; nothing to say.
 */
export type LiveFreshness = "not_live" | "fresh" | "stale" | "expired";

/** A live read older than this is stale (two live refetches missed, and more). */
export const LIVE_STALE_AFTER_MS = 2 * 60_000;

/** A stale live read this long after kickoff is no longer shown as live. */
export const LIVE_EXPIRED_AFTER_KICKOFF_MS = 3 * 60 * 60_000;

/**
 * Coming back to the page (tab shown again, page restored from the
 * back/forward cache, window focused, network back) refetches a live match
 * whose read is older than this: the default `staleTime`, so a return right
 * after a tick does not double it.
 */
export const RETURN_REFETCH_AFTER_MS = 15_000;

/**
 * `updatedAt` is when the last successful read landed (React Query's
 * `dataUpdatedAt`), in milliseconds; 0 or less means unknown and is treated as
 * fresh rather than alarming the reader about a read that just happened.
 */
export function liveFreshness(
  match: Pick<Match, "status" | "kickoff"> | undefined,
  updatedAt: number,
  now: number,
): LiveFreshness {
  if (!match || match.status !== "live") return "not_live";
  if (!(updatedAt > 0) || now - updatedAt <= LIVE_STALE_AFTER_MS) return "fresh";
  const kickoff = Date.parse(match.kickoff);
  if (Number.isFinite(kickoff) && now - kickoff > LIVE_EXPIRED_AFTER_KICKOFF_MS) return "expired";
  return "stale";
}

/** Whether coming back to the page should refetch this read now. */
export function shouldRefetchOnReturn(
  match: Pick<Match, "status"> | undefined,
  updatedAt: number,
  now: number,
): boolean {
  return match?.status === "live" && now - updatedAt > RETURN_REFETCH_AFTER_MS;
}
