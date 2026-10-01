import type { Match } from "@/types/domain";

/**
 * The round the Home band announces: the round of the next match to be
 * played (or being played), not the Fantasy gameweek.
 *
 * Fantasy's "current" gameweek stays on the previous round until that round
 * is finalized, which can be days after its last whistle. During that time
 * Home listed the new round's fixtures under a band reading the old round
 * ("Journée 1" above the J2 fixtures). The fixtures are what the band sits
 * on top of, so they decide; Fantasy's number is only the fallback for when
 * there is no upcoming match to read it from.
 *
 * A postponed match with no date, or one called off, is not "next": it does
 * not say which round is coming.
 */
export function homeBandMatchday(
  matches: readonly Pick<
    Match,
    "gameweek" | "kickoff" | "status" | "dateUnconfirmed" | "calledOff"
  >[],
  fantasyGameweek?: number,
): number | undefined {
  let nextRound: number | undefined;
  let nextKickoff = Number.POSITIVE_INFINITY;
  for (const match of matches) {
    if (match.status === "finished" || match.gameweek <= 0) continue;
    if (match.dateUnconfirmed || match.calledOff) continue;
    const kickoff = Date.parse(match.kickoff);
    if (Number.isNaN(kickoff) || kickoff >= nextKickoff) continue;
    nextKickoff = kickoff;
    nextRound = match.gameweek;
  }
  return nextRound ?? fantasyGameweek;
}
