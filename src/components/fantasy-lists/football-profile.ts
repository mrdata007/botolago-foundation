import type { FootballPlayerSeasonProfileDto } from "@/backend/fantasy/contracts";

type LastMatch = FootballPlayerSeasonProfileDto["lastMatches"][number];

export type MatchOutcome = "win" | "draw" | "loss";

/**
 * The player's club's score first, the opponent's second: a match is told from
 * the player's side, whoever hosted. `null` when the fixture carries no score,
 * in which case nothing is drawn and nothing is guessed.
 */
export function clubScore(match: LastMatch): { own: number; other: number } | null {
  if (match.homeScore === null || match.awayScore === null) return null;
  return match.home
    ? { own: match.homeScore, other: match.awayScore }
    : { own: match.awayScore, other: match.homeScore };
}

/** Win, draw or loss for the player's club, or `null` without a score. */
export function matchOutcome(match: LastMatch): MatchOutcome | null {
  const score = clubScore(match);
  if (!score) return null;
  if (score.own === score.other) return "draw";
  return score.own > score.other ? "win" : "loss";
}

/**
 * The coverage the page has to admit to: the figures only reach `covered` of
 * the `finished` matches of the player's club. `null` when they reach all of
 * them (or the club has played none), because then there is nothing to admit.
 */
export function partialCoverage(
  coverage: FootballPlayerSeasonProfileDto["coverage"],
): { covered: number; finished: number } | null {
  return coverage.finished > 0 && coverage.covered < coverage.finished ? coverage : null;
}
