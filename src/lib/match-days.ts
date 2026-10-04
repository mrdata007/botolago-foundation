import type { Match } from "@/types/domain";
import { addMatchDays, matchDayKey, MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";

/** One football day of fixtures, in the order they were given. */
export interface MatchDayGroup {
  /** The competition calendar day, `YYYY-MM-DD` (Africa/Casablanca). */
  key: string;
  /** "Aujourd'hui", "Demain", or the day's date ("Samedi 26 septembre"). */
  label: string;
  matches: Match[];
}

/** "samedi 26 septembre" → "Samedi 26 septembre". CSS `capitalize` would
 *  title-case every word, and French does not capitalise months. */
export function capitalizeFirst(text: string): string {
  return text.charAt(0).toLocaleUpperCase() + text.slice(1);
}

/**
 * Fixtures grouped under the football day they are played on — the
 * competition's calendar, not the viewer's (BG-0100) — keeping their order.
 * Today and tomorrow are named as such (the page around them already carries
 * the date); any other day by its weekday and date in `locale`.
 */
export function groupByMatchDay(
  matches: readonly Match[],
  {
    locale,
    today,
    tomorrow,
    now = new Date(),
  }: { locale: string; today: string; tomorrow: string; now?: Date },
): MatchDayGroup[] {
  const labelFmt = moroccoDateTimeFormat(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const todayKey = matchDayKey(now);
  const tomorrowKey = matchDayKey(addMatchDays(now, 1));
  const days: MatchDayGroup[] = [];
  for (const match of matches) {
    const kickoff = new Date(match.kickoff);
    const key = matchDayKey(kickoff);
    const last = days[days.length - 1];
    if (last && last.key === key) {
      last.matches.push(match);
      continue;
    }
    const label =
      key === todayKey
        ? today
        : key === tomorrowKey
          ? tomorrow
          : capitalizeFirst(labelFmt.format(kickoff));
    days.push({ key, label, matches: [match] });
  }
  return days;
}

/**
 * The rounds a set of matches belongs to: each known round once, ascending.
 * A fixture with no round (`0`, what the presenter writes for a null round
 * number) names none.
 */
export function matchRounds(matches: readonly Pick<Match, "gameweek">[]): number[] {
  return [...new Set(matches.map((m) => m.gameweek).filter((round) => round > 0))].sort(
    (a, b) => a - b,
  );
}

/**
 * The first competition day after `dayKey` (a `YYYY-MM-DD` key) on which one
 * of `matches` is still to be played, or null when there is none. Postponed
 * and finished matches do not count: this answers "when is the next match?".
 */
export function nextMatchDayAfter(
  matches: readonly Pick<Match, "status" | "kickoff">[],
  dayKey: string,
): string | null {
  let next: string | null = null;
  for (const match of matches) {
    if (match.status !== "scheduled" && match.status !== "live") continue;
    const kickoff = new Date(match.kickoff);
    if (Number.isNaN(kickoff.getTime())) continue;
    const key = matchDayKey(kickoff);
    if (key > dayKey && (next === null || key < next)) next = key;
  }
  return next;
}

/**
 * The latest day before `dayKey` that has a result, or null when there is
 * none: where "Derniers résultats" leads from a day with nothing on it.
 * `resultDays` are competition-day keys in any order.
 */
export function latestResultDayBefore(
  resultDays: readonly string[],
  dayKey: string,
): string | null {
  let latest: string | null = null;
  for (const day of resultDays) {
    if (day < dayKey && (latest === null || day > latest)) latest = day;
  }
  return latest;
}

/**
 * The days narrowed to matches that involve a followed club; a day left with
 * no match is dropped. An empty `followedIds` keeps nothing.
 */
export function onlyFollowedClubs(
  days: readonly MatchDayGroup[],
  followedIds: readonly string[],
): MatchDayGroup[] {
  const followed = new Set(followedIds);
  return days.flatMap((day) => {
    const matches = day.matches.filter(
      (match) => followed.has(match.homeClubId) || followed.has(match.awayClubId),
    );
    return matches.length > 0 ? [{ ...day, matches }] : [];
  });
}
