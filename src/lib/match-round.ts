import { matchBucket } from "@/lib/match-bucket";
import { isKickoffDateUnconfirmed, matchDayKey } from "@/lib/match-kickoff";
import type { Match } from "@/types/domain";

/**
 * The round (journée) behind a day of the Matches calendar: the figures of the
 * round summary, the whole round grouped by day, the days that have a match
 * (the day strip's dots), and the "Résultats" / "À venir" fallback.
 *
 * Everything is worked out from matches the page already holds: the season's
 * fixture list, with the selected day's rows laid over it. Those rows are the
 * ones on screen (they carry the live strip's newer reading), so a figure here
 * and the row it counts cannot disagree. Nothing is guessed: a match with no
 * confirmed date is counted, but never filed under a day.
 */

/** The matches of one competition day, earliest kick-off first. */
export interface RoundDay {
  /** `YYYY-MM-DD`, the competition's calendar (Africa/Casablanca). */
  readonly key: string;
  readonly matches: readonly Match[];
}

export interface RoundSummary {
  readonly round: number;
  /** Every match of the round, whatever its state. */
  readonly total: number;
  /** Played to the end. */
  readonly played: number;
  readonly live: number;
  /** Still to be played: scheduled, or postponed with no date yet. */
  readonly upcoming: number;
  /** Cancelled or abandoned: never counted as to come. */
  readonly calledOff: number;
  /** The round's matches on the day asked about: the rows that day lists. */
  readonly onDay: number;
  /** The round's earliest match still to kick off, with a date. */
  readonly next: Match | null;
  /** The round's dated matches, day by day, ascending. */
  readonly days: readonly RoundDay[];
  /** Matches with no confirmed date (postponed, cancelled). */
  readonly undated: readonly Match[];
}

const byKickoff = (a: Match, b: Match) => a.kickoff.localeCompare(b.kickoff);

function hasDay(match: Match): boolean {
  return !isKickoffDateUnconfirmed(match) && !Number.isNaN(Date.parse(match.kickoff));
}

/**
 * The competition days that have at least one match with a date: what the day
 * strip marks. A postponed match's stored day is a placeholder, not a day it
 * is played on, so it marks nothing.
 */
export function matchDaySet(matches: readonly Match[]): ReadonlySet<string> {
  const days = new Set<string>();
  for (const match of matches) {
    if (hasDay(match)) days.add(matchDayKey(new Date(match.kickoff)));
  }
  return days;
}

/**
 * The season's matches with a day's own reading laid over them: a match of
 * `day` replaces the season list's copy of it (the day is read more often, and
 * carries the live strip's reading), and one the season list does not have yet
 * is added.
 */
export function overlayDay(season: readonly Match[], day: readonly Match[]): readonly Match[] {
  if (day.length === 0) return season;
  const fresh = new Map(day.map((match) => [match.id, match]));
  const merged = season.map((match) => fresh.get(match.id) ?? match);
  const known = new Set(season.map((match) => match.id));
  for (const match of day) if (!known.has(match.id)) merged.push(match);
  return merged;
}

/**
 * The round a day belongs to: its only round, or, when the day mixes a
 * catch-up with the current round, the one with the most matches that day (the
 * later round on a tie). None for a day with no match, or whose matches carry
 * no round (`0`).
 */
export function roundOfDay(dayMatches: readonly Pick<Match, "gameweek">[]): number | undefined {
  const counts = new Map<number, number>();
  for (const { gameweek } of dayMatches) {
    if (gameweek > 0) counts.set(gameweek, (counts.get(gameweek) ?? 0) + 1);
  }
  let best: number | undefined;
  for (const [round, count] of counts) {
    if (
      best === undefined ||
      count > (counts.get(best) ?? 0) ||
      (count === counts.get(best) && round > best)
    ) {
      best = round;
    }
  }
  return best;
}

/**
 * The round's figures. `matches` is the season's list (already overlaid with
 * the day's rows, `overlayDay`); `dayKey` is the day on show, for `onDay`; `now`
 * decides which kick-off is next (a match still "scheduled" past its kick-off
 * is waiting on the feed and is not offered as the next one).
 */
export function summariseRound(
  matches: readonly Match[],
  round: number,
  dayKey: string,
  now: number,
): RoundSummary {
  const inRound = matches.filter((match) => match.gameweek === round);
  let played = 0;
  let live = 0;
  let upcoming = 0;
  let calledOff = 0;
  let onDay = 0;
  let next: Match | null = null;
  const dated = new Map<string, Match[]>();
  const undated: Match[] = [];

  for (const match of inRound) {
    const bucket = matchBucket(match);
    if (bucket === "finished") played++;
    else if (bucket === "live") live++;
    else if (bucket === "called_off") calledOff++;
    else upcoming++;

    if (!hasDay(match)) {
      undated.push(match);
      continue;
    }
    const key = matchDayKey(new Date(match.kickoff));
    if (key === dayKey) onDay++;
    const day = dated.get(key);
    if (day) day.push(match);
    else dated.set(key, [match]);

    if (
      match.status === "scheduled" &&
      Date.parse(match.kickoff) >= now &&
      (next === null || byKickoff(match, next) < 0)
    ) {
      next = match;
    }
  }

  const days = [...dated.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, list]) => ({ key, matches: list.sort(byKickoff) }));
  return {
    round,
    total: inRound.length,
    played,
    live,
    upcoming,
    calledOff,
    onDay,
    next,
    days,
    undated: undated.sort(byKickoff),
  };
}

/** The round narrowed to the matches `keep` accepts; days left empty are dropped. */
export function narrowRound(
  round: Pick<RoundSummary, "days" | "undated">,
  keep: (match: Match) => boolean,
  order: "asc" | "desc",
): { days: RoundDay[]; undated: Match[]; count: number } {
  const days = round.days
    .map((day) => ({
      key: day.key,
      matches: day.matches
        .filter(keep)
        .sort((a, b) => (order === "asc" ? 1 : -1) * byKickoff(a, b)),
    }))
    .filter((day) => day.matches.length > 0);
  if (order === "desc") days.reverse();
  const undated = round.undated.filter(keep);
  const count = days.reduce((sum, day) => sum + day.matches.length, 0) + undated.length;
  return { days, undated, count };
}
