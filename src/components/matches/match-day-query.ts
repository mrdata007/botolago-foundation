import type { QueryClient, QueryKey } from "@tanstack/react-query";
import type { FootballLanguage } from "@/backend/football/contracts";
import { matchDayFromKey } from "@/lib/match-kickoff";
import {
  matchRefetchInterval,
  POST_KICKOFF_REFRESH_MINUTES,
  WATCH_REFRESH_MS,
} from "@/lib/match-refresh";
import {
  footballService,
  type FootballMatchCollection,
  type FootballSeason,
} from "@/services/football";
import type { Match } from "@/types/domain";

/**
 * The Matches calendar's query: one competition day's fixtures, `day` being
 * a `YYYY-MM-DD` key of the Casablanca calendar (`@/lib/match-kickoff`). The
 * route's loader and the page build it here, so the fixtures the server
 * rendered are under the key the browser's first render asks for.
 */
export function matchDayQuery(
  day: string,
  language: FootballLanguage,
  seasonId: string | undefined,
) {
  return {
    queryKey: ["football", "matches", day, seasonId ?? "default", language] as const,
    queryFn: () => footballService.getMatchDay(matchDayFromKey(day), language, seasonId),
  };
}

/**
 * True when two of `matchDayQuery`'s keys name the same day of the same
 * season, whatever their language. The page's `placeholderData` goes by it:
 * the fixtures the server rendered in French stay on screen while an Arabic
 * reader's read of that same day loads, instead of turning back into the
 * skeleton; another day's or another season's fixtures never stand in under
 * the date just picked.
 */
export function isSameMatchDayQuery(a: QueryKey, b: QueryKey): boolean {
  const LANGUAGE = 4;
  return a.length === b.length && a.every((part, index) => index === LANGUAGE || part === b[index]);
}

type SeasonDates = Pick<FootballSeason, "startsOn" | "endsOn" | "firstMatchDate" | "lastMatchDate">;

/**
 * The day the calendar opens on: today while the season is on, its first
 * match day before it starts, its last once it is over. Every argument is a
 * day key, so the answer does not depend on the zone of the machine asking:
 * the server's is UTC, the competition's Casablanca. `today` is decided once
 * per visit, by the route's loader, so the server's render and the browser's
 * first render open on the same day even across midnight.
 */
export function openingMatchDay(season: SeasonDates | undefined, today: string): string {
  if (!season) return today;
  if (today < season.startsOn) return season.firstMatchDate ?? season.startsOn;
  if (today > season.endsOn) return season.lastMatchDate ?? season.endsOn;
  return today;
}

/** A day the reader picked, kept inside the season on show. */
export function clampMatchDay(
  day: string,
  season: Pick<FootballSeason, "startsOn" | "endsOn"> | undefined,
): string {
  if (!season) return day;
  if (day < season.startsOn) return season.startsOn;
  if (day > season.endsOn) return season.endsOn;
  return day;
}

/**
 * How long past kick-off a finished match keeps its day refreshing: a league
 * match is over about two hours after kick-off, and the half hour after the
 * whistle is when a feed settles a late goal or corrects the final score.
 */
export const JUST_FINISHED_REFRESH_MINUTES = 150;

function dayMatchRefetchInterval(
  match: Pick<Match, "status" | "kickoff">,
  now: number,
): number | false {
  const kickoff = Date.parse(match.kickoff);
  if (Number.isNaN(kickoff)) return false;
  const sinceKickoff = now - kickoff;
  if (match.status === "finished") {
    return sinceKickoff >= 0 && sinceKickoff <= JUST_FINISHED_REFRESH_MINUTES * 60_000
      ? WATCH_REFRESH_MS
      : false;
  }
  // A feed that never marked a match finished would otherwise keep a past
  // day polling for as long as anyone looks at it.
  if (match.status === "live" && sinceKickoff > POST_KICKOFF_REFRESH_MINUTES * 60_000) {
    return false;
  }
  // The rest is the match page's own rule, the placeholder hour's silence
  // and the refetch that starts the watch included: one rule, so the list
  // and the page agree on when to look at a match to come.
  return matchRefetchInterval(match, now);
}

/**
 * How often the Matches calendar refetches the day on show, as a TanStack
 * Query `refetchInterval`. The match page's pace (`matchRefetchInterval`):
 * every 30 seconds while a match is in play, every minute from a quarter of
 * an hour before a kick-off until the feed marks it started, and before that
 * the single refetch that starts the watch, booked up to a day ahead; a
 * kick-off still at the provider's placeholder hour is not watched at all.
 * What a list adds: a match that has just finished keeps its day refreshing
 * for a short while, so the final score reaches the list; and a match still
 * marked live three hours after kick-off no longer counts. A past day has
 * none of these and never polls, nor does a day more than a day ahead; the
 * caller sets `refetchIntervalInBackground: false`, so a hidden tab never
 * polls either.
 *
 * The list used to be read once: the live strip above it moved on every 30
 * seconds while the rows under it kept the score, the minute and the status
 * they opened with (audit 2026-09-25, A05).
 */
export function matchDayRefetchInterval(
  matches: readonly Pick<Match, "status" | "kickoff">[] | undefined,
  now: number,
): number | false {
  let shortest: number | false = false;
  for (const match of matches ?? []) {
    const interval = dayMatchRefetchInterval(match, now);
    if (interval !== false && (shortest === false || interval < shortest)) shortest = interval;
  }
  return shortest;
}

/** A list of matches as read at one moment (a query's `dataUpdatedAt`). */
export interface MatchesReading {
  readonly matches: readonly Match[];
  readonly updatedAt: number;
}

/**
 * The day's matches, with the live strip's reading of the ones it follows
 * when that reading is the newer: the strip and the rows under it then show
 * one score, one minute and one status, instead of two readings taken up to
 * half a minute apart. The strip's copy only moves what a live match
 * changes; a match it does not follow, or a reading older than the day's
 * (the list refetched after the strip), is left as the day's query has it.
 */
export function withLiveReadings(
  day: MatchesReading,
  live: MatchesReading | undefined,
): readonly Match[] {
  if (!live || live.matches.length === 0 || live.updatedAt < day.updatedAt) return day.matches;
  const inPlay = new Map(live.matches.map((match) => [match.id, match]));
  let changed = false;
  const matches = day.matches.map((match) => {
    const reading = inPlay.get(match.id);
    if (!reading) return match;
    changed = true;
    return {
      ...match,
      status: reading.status,
      minute: reading.minute,
      homeScore: reading.homeScore,
      awayScore: reading.awayScore,
      halfTimeHomeScore: reading.halfTimeHomeScore,
      halfTimeAwayScore: reading.halfTimeAwayScore,
    };
  });
  return changed ? matches : day.matches;
}

/**
 * Matches have left the live strip (`useOnLiveMatchEnd`): finished, or
 * stopped. When one of them is on the day under `queryKey`, the day reads its
 * final state at once instead of at its next refresh, and returns true.
 *
 * Until that read lands, the day keeps the strip's last reading of them. The
 * row showed that reading a moment ago; falling back to the day's own copy,
 * up to half a minute older, would step it back to an earlier minute or the
 * score before a late goal. It is stamped with the strip's time, not now, so
 * the strip's next reading of a match still in play stays the newer one.
 */
export function settleEndedMatches(
  queryClient: QueryClient,
  queryKey: QueryKey,
  ended: readonly string[],
  lastReading: MatchesReading,
): boolean {
  const state = queryClient.getQueryState<FootballMatchCollection>(queryKey);
  const day = state?.data;
  if (!state || !day?.matches.some((match) => ended.includes(match.id))) return false;
  const matches = withLiveReadings(
    { matches: day.matches, updatedAt: state.dataUpdatedAt },
    lastReading,
  );
  if (matches !== day.matches) {
    queryClient.setQueryData<FootballMatchCollection>(
      queryKey,
      { ...day, matches },
      { updatedAt: lastReading.updatedAt },
    );
  }
  void queryClient.invalidateQueries({ queryKey, exact: true });
  return true;
}
