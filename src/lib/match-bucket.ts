import type { Match } from "@/types/domain";

/**
 * Groups a match into a display bucket driven purely by domain status.
 *
 * Postponed and suspended matches are still to come, so they stay under
 * upcoming. Cancelled and abandoned ones are not: they are listed on the "all"
 * view with their own label, and never under "upcoming", which would promise
 * a match that will not be played.
 */
export function matchBucket(m: Pick<Match, "status" | "calledOff">): MatchBucket {
  if (m.status === "live") return "live";
  if (m.status === "scheduled") return "upcoming";
  if (m.status === "finished") return "finished";
  if (m.calledOff) return "called_off";
  return "other";
}

export type MatchBucket = "live" | "upcoming" | "finished" | "called_off" | "other";
