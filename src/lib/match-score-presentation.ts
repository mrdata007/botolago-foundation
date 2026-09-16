import type { Match } from "@/types/domain";

export interface MatchScorePresentation {
  readonly available: boolean;
  readonly home: number | null;
  readonly away: number | null;
}

function isValidScore(value: number | undefined): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value >= 0;
}

/**
 * A score is authoritative only when both sides are present and valid.
 * In particular, missing provider values must never be presented as 0–0.
 */
export function presentMatchScore(
  match: Pick<Match, "homeScore" | "awayScore">,
): MatchScorePresentation {
  if (!isValidScore(match.homeScore) || !isValidScore(match.awayScore)) {
    return { available: false, home: null, away: null };
  }

  return { available: true, home: match.homeScore, away: match.awayScore };
}

/** Returns only a real, positive gameweek. Provider fallback 0 stays hidden. */
export function presentGameweek(gameweek: number | null | undefined): number | null {
  return typeof gameweek === "number" && Number.isSafeInteger(gameweek) && gameweek > 0
    ? gameweek
    : null;
}
