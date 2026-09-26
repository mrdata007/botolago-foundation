import { matchZoneHour } from "@/lib/match-kickoff";

export type GreetingPart = "morning" | "afternoon" | "evening";

/**
 * The part of the day the home greeting names, by the competition's clock
 * (Africa/Casablanca) like the date printed beside it. It used to read the
 * hour of whichever machine rendered: the server renders in UTC and the
 * browser in the visitor's own zone, so the two disagreed around noon, 18:00
 * and midnight, and the page hydrated with a text mismatch (audit
 * 2026-09-26).
 */
export function greetingPart(instant: Date): GreetingPart {
  const hour = matchZoneHour(instant);
  if (hour < 12) return "morning";
  if (hour < 18) return "afternoon";
  return "evening";
}
