import { isKickoffDateUnconfirmed, matchDayKey } from "@/lib/match-kickoff";
import type { Match } from "@/types/domain";

/**
 * The next match day, for a day with no match on Home ("Pas de match
 * aujourd'hui · Prochaine journée : mercredi 28 octobre").
 *
 * `null` while a match is live or kicks off today (Casablanca calendar, as
 * everywhere on Home), and when nothing is scheduled ahead: the page then has
 * its own empty state. Otherwise the day key (`YYYY-MM-DD`) of the first
 * scheduled match with a confirmed date. Read from the matches already loaded,
 * never guessed.
 */
export function nextMatchDay(matches: readonly Match[], now: Date): string | null {
  const today = matchDayKey(now);
  const days: string[] = [];
  for (const match of matches) {
    if (match.status === "live") return null;
    if (match.status !== "scheduled" || isKickoffDateUnconfirmed(match)) continue;
    const kickoff = new Date(match.kickoff);
    if (Number.isNaN(kickoff.getTime())) continue;
    const key = matchDayKey(kickoff);
    if (key === today) return null;
    if (key > today) days.push(key);
  }
  return days.sort()[0] ?? null;
}
