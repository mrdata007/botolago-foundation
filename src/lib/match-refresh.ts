import { partialMatchKey, type QueryClient, type QueryKey } from "@tanstack/react-query";
import { isKickoffTimeUnconfirmed } from "@/lib/match-kickoff";
import type { Match } from "@/types/domain";

/**
 * How often match data refreshes itself, in one place: the match page, the
 * Home fixtures and the live strip all follow these rules. Each is a
 * TanStack Query `refetchInterval` (milliseconds, or `false` for "don't"),
 * and every caller also sets `refetchIntervalInBackground: false`, so a
 * hidden tab never polls. Last, what the match page reads again when its
 * match ends (`rereadTableOnFinish`).
 */

/** How close to kick-off a scheduled match starts refreshing itself. */
export const PRE_KICKOFF_REFRESH_MINUTES = 15;

/** How long past kick-off a match still marked scheduled keeps refreshing. */
export const POST_KICKOFF_REFRESH_MINUTES = 180;

/**
 * How far ahead a kick-off still books the one refetch that starts its
 * watch. Further ahead than a day, nothing is booked at all. The Matches
 * calendar's day list (`matchDayRefetchInterval`) books the same refetch
 * with its own copy of this horizon.
 */
export const KICKOFF_WAKE_UP_HORIZON_MINUTES = 24 * 60;

/** The pace of a match about to kick off, and the shortest wake-up. */
const WATCH_REFRESH_MS = 60_000;

/**
 * How often the match page refetches: every 30 seconds while the match is
 * live, every minute from a quarter of an hour before a scheduled kick-off
 * until the provider flips the status (for at most three hours past it, so a
 * fixture nobody updates does not poll forever), otherwise never. A
 * reader who opened the page before kick-off used to wait for a tab focus to
 * see the match start, and so never saw a goal moment at all.
 *
 * A kick-off still at the provider's placeholder hour (midnight UTC, 01:00 in
 * Casablanca: `isKickoffTimeUnconfirmed`) is not a time anyone plays at, and
 * is not watched: taken as real, it woke the page and Home at 00:45 and kept
 * them polling every minute for three hours of the night. On Home and the
 * Matches calendar, the live strip picks such a match up once the feed marks
 * it started. Nor do the page's empty panels say they update themselves for
 * it: `matchDataPhase` reads this function.
 *
 * Earlier than a quarter of an hour before kick-off, the answer is the one
 * refetch that starts the watch, booked for when it starts. TanStack Query
 * only asks this function again when the query or the page updates, so a
 * plain `false` left a page opened at 18:00 on a 20:00 kick-off unrefreshed
 * through the start of the match unless something re-rendered it. What is
 * still not covered: a kick-off more than a day ahead books nothing; a
 * refetch that falls due while the tab is hidden is skipped, and the refetch
 * on the reader's return to the tab picks the watch up from there; and the
 * match page, which shows no live strip, sees a match at the placeholder
 * hour start only on that return to the tab, or when it is opened again.
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
  if (isKickoffTimeUnconfirmed(match)) return false;
  const untilKickoff = kickoff - now;
  if (
    untilKickoff <= PRE_KICKOFF_REFRESH_MINUTES * 60_000 &&
    -untilKickoff <= POST_KICKOFF_REFRESH_MINUTES * 60_000
  ) {
    return WATCH_REFRESH_MS;
  }
  const untilWatch = untilKickoff - PRE_KICKOFF_REFRESH_MINUTES * 60_000;
  return untilWatch > 0 && untilWatch <= KICKOFF_WAKE_UP_HORIZON_MINUTES * 60_000
    ? Math.max(untilWatch, WATCH_REFRESH_MS)
    : false;
}

/**
 * The shortest interval any match in a list asks for: Home's fixtures keep
 * refreshing while one of them is live or about to kick off, so a match that
 * starts while the reader is on the page becomes the live card. Until then,
 * the soonest kick-off books the refetch that starts its watch.
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

/**
 * What a read of the match page (`getMatchDetailPage`) says that its table
 * depends on: whether the match is over, and which season it counts in.
 */
interface MatchPageReading {
  readonly match: Pick<Match, "status">;
  readonly season: { readonly id: string };
}

/**
 * The final whistle moves the table. Home and the Classement tab hear of it
 * from the live strip (`useOnLiveMatchEnd`), which the match page does not
 * show; the match page hears it from its own reads of the match, the queries
 * under `detailKey` (the match's key without its language, so a switch of
 * language does not lose the whistle). When a read says finished and the one
 * before it did not, every copy of that season's table is marked stale: read
 * again at once where it is on screen (the "Face à face" tab), else when it
 * next is. A page opened on a match already over starts from that read and
 * has nothing to re-read.
 *
 * It watches the query cache, not the page's renders, so the rule does not
 * hang on which values an effect lists: the page starts it in an effect
 * keyed on the match alone, and its test drives a real `QueryClient`.
 * Returns the function that stops the watch.
 */
export function rereadTableOnFinish(queryClient: QueryClient, detailKey: QueryKey): () => void {
  const cache = queryClient.getQueryCache();
  // The newest read already held, in whichever language.
  let last: MatchPageReading | undefined;
  let lastAt = -Infinity;
  for (const query of cache.findAll({ queryKey: detailKey })) {
    if (query.state.data !== undefined && query.state.dataUpdatedAt > lastAt) {
      last = query.state.data as MatchPageReading;
      lastAt = query.state.dataUpdatedAt;
    }
  }
  return cache.subscribe((event) => {
    // A read of this match that landed: a fetch, or data set in its place.
    if (event.type !== "updated" || event.action.type !== "success") return;
    if (!partialMatchKey(event.query.queryKey, detailKey)) return;
    const reading = event.query.state.data as MatchPageReading | undefined;
    if (!reading) return;
    const before = last;
    last = reading;
    if (before && before.match.status !== "finished" && reading.match.status === "finished") {
      void queryClient.invalidateQueries({
        queryKey: ["football", "standings", reading.season.id],
      });
    }
  });
}
