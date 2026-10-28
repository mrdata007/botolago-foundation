import {
  isKickoffDateUnconfirmed,
  isKickoffTimeUnconfirmed,
  matchDayKey,
} from "@/lib/match-kickoff";
import { moroccoDayBounds } from "@/lib/morocco-time";
import type { Match } from "@/types/domain";

/**
 * What the band card says about a match still to be played, from the kick-off
 * and the clock alone (nothing is guessed):
 *
 * - `countdown`: how long is left, to the minute. Under a day it is hours and
 *   minutes, from a day on it is days and hours, under an hour minutes only;
 * - `imminent`: under a minute to go;
 * - `waiting`: the kick-off has passed and the data still says "scheduled" (the
 *   read has not caught up), so no countdown is shown, and nothing is claimed
 *   about the match having started;
 * - `unconfirmed`: the date or the time is not confirmed, so there is nothing
 *   to count down to.
 */
export type KickoffClock =
  | {
      readonly kind: "countdown";
      readonly days: number;
      readonly hours: number;
      readonly minutes: number;
    }
  | { readonly kind: "imminent" }
  | { readonly kind: "waiting" }
  | { readonly kind: "unconfirmed" };

export function kickoffClock(
  match: Pick<Match, "kickoff" | "status" | "dateUnconfirmed">,
  now: number,
): KickoffClock {
  const kickoff = Date.parse(match.kickoff);
  if (Number.isNaN(kickoff) || isKickoffDateUnconfirmed(match) || isKickoffTimeUnconfirmed(match)) {
    return { kind: "unconfirmed" };
  }
  const left = kickoff - now;
  if (left <= 0) return { kind: "waiting" };
  if (left < 60_000) return { kind: "imminent" };
  return {
    kind: "countdown",
    days: Math.floor(left / 86_400_000),
    hours: Math.floor((left % 86_400_000) / 3_600_000),
    minutes: Math.floor((left % 3_600_000) / 60_000),
  };
}

/**
 * Whether the kick-off is on Morocco's calendar day of `now`, or the next one.
 * The competition's own clock, as every kick-off time on the page: a viewer in
 * another zone reads the same answer.
 */
export function kickoffDay(kickoffIso: string, now: number): "today" | "tomorrow" | null {
  const kickoff = Date.parse(kickoffIso);
  if (Number.isNaN(kickoff)) return null;
  const today = matchDayKey(new Date(now));
  const day = matchDayKey(new Date(kickoff));
  if (day === today) return "today";
  const end = moroccoDayBounds(today)?.end;
  return end && day === matchDayKey(end) ? "tomorrow" : null;
}
