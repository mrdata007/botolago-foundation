import type { Match } from "@/types/domain";
import { addMatchDays, matchDayKey, MATCH_TIME_ZONE } from "@/lib/match-kickoff";

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
  const labelFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
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
