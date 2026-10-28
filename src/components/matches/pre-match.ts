import type { Match, TableRow } from "@/types/domain";

/**
 * What the "Avant-match" module of a match still to be played is built from.
 * Both helpers read only what the page already holds; neither makes up a value.
 * A missing value stays missing (`null`, `undefined`), and the module draws a
 * dash or leaves the row out, never a 0.
 */

type Meeting = Pick<
  Match,
  "id" | "kickoff" | "status" | "homeClubId" | "awayClubId" | "homeScore" | "awayScore"
>;

/**
 * The most recent finished meeting of the two clubs that has a score, apart
 * from this fixture itself. `null` when there is none: a meeting with no
 * score to read, one not played, or the fixture the page is about is not "the
 * last meeting".
 */
export function lastMeeting<T extends Meeting>(
  meetings: readonly T[],
  fixtureId: string,
): T | null {
  let latest: T | null = null;
  for (const meeting of meetings) {
    if (meeting.id === fixtureId || meeting.status !== "finished") continue;
    if (meeting.homeScore === undefined || meeting.awayScore === undefined) continue;
    const at = Date.parse(meeting.kickoff);
    if (Number.isNaN(at)) continue;
    if (latest === null || at > Date.parse(latest.kickoff)) latest = meeting;
  }
  return latest;
}

/** The club's row in the season table, or `undefined` while it has none. */
export function standingOf(
  rows: readonly TableRow[] | undefined,
  clubId: string,
): TableRow | undefined {
  return rows?.find((row) => row.clubId === clubId);
}
