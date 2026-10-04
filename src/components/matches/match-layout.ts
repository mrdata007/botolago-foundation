import type { MatchStatus } from "@/types/domain";

/**
 * Whether, on a phone, the prediction card sits under the tabs rather than
 * above them.
 *
 * Before kickoff the card leads: predicting is the thing to do, and it is
 * still possible. Once the match is live or over there is nothing left to
 * predict, and the card's polls are closed; the events, stats and line-ups are
 * what the reader came for, so they come first. A postponed match has not
 * been played, so it keeps the pre-kickoff order. Desktop places the two in
 * their own columns and is not affected.
 */
export function predictionFollowsTabs(status: MatchStatus): boolean {
  return status === "live" || status === "finished";
}
