import type { Match } from "@/types/domain";

/**
 * The "Face à face" summary (A-H2H), counted from the head-to-head meetings
 * the detail payload already carries — real results, nothing derived beyond
 * who won each one.
 *
 * Kept out of the component so the counting is unit-tested, and pure.
 */

type Meeting = Pick<Match, "homeClubId" | "awayClubId" | "homeScore" | "awayScore">;

/**
 * The club that won a meeting, `"draw"`, or `null` when the meeting has no
 * score to read (it should not happen for a finished meeting, and a missing
 * score is not a draw).
 */
export function meetingWinner(meeting: Meeting): string | "draw" | null {
  const { homeScore, awayScore } = meeting;
  if (homeScore === undefined || awayScore === undefined) return null;
  if (homeScore === awayScore) return "draw";
  return homeScore > awayScore ? meeting.homeClubId : meeting.awayClubId;
}

export interface HeadToHeadSummary {
  /** Wins of THIS page's home club, whichever side it played on in each meeting. */
  readonly homeWins: number;
  readonly draws: number;
  /** Wins of this page's away club. */
  readonly awayWins: number;
  /** Meetings that had a result to count. */
  readonly counted: number;
}

/**
 * Wins and draws between the two clubs of this fixture. A win is credited to
 * the CLUB, not to the side it played on: the meetings alternate venues, so
 * "home wins" in the raw list would mix both clubs.
 */
export function summariseHeadToHead(
  meetings: readonly Meeting[],
  homeClubId: string,
  awayClubId: string,
): HeadToHeadSummary {
  let homeWins = 0;
  let draws = 0;
  let awayWins = 0;
  for (const meeting of meetings) {
    const winner = meetingWinner(meeting);
    if (winner === "draw") draws += 1;
    else if (winner === homeClubId) homeWins += 1;
    else if (winner === awayClubId) awayWins += 1;
  }
  return { homeWins, draws, awayWins, counted: homeWins + draws + awayWins };
}

/** "+14", "0", "-3" — a goal difference as a standings table prints it. */
export function formatGoalDifference(value: number): string {
  return value > 0 ? `+${value}` : String(value);
}

/** Most recent meeting first. */
export function newestFirst<T extends Pick<Match, "kickoff">>(meetings: readonly T[]): T[] {
  return [...meetings].sort((a, b) => Date.parse(b.kickoff) - Date.parse(a.kickoff));
}
