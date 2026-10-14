import type { Match } from "@/types/domain";

/**
 * How a match's score is shown, in one place.
 *
 * A score the provider has not sent is `undefined` on the `Match` (null in the
 * API), and the database only insists on a score once a match is finished. A
 * live match can therefore be without one. Each screen used to write
 * `match.homeScore ?? 0`, which turned "we do not know" into a real-looking
 * 0–0, on screen and in the label a screen reader announces. Zero is a real
 * score and stays one; unknown is a dash.
 */

/** What stands in for a figure we do not have. */
export const UNKNOWN_SCORE_GLYPH = "—";

export interface PresentedScore {
  /** Both figures are known: only then is this a score that can be announced. */
  readonly known: boolean;
  readonly home: number | null;
  readonly away: number | null;
  /** The figure, or the dash: for text that is not animated. */
  readonly homeText: string;
  readonly awayText: string;
  /** "2 – 1", "0 – 0" or "— – —". */
  readonly text: string;
}

export function presentScore(match: Pick<Match, "homeScore" | "awayScore">): PresentedScore {
  const home = match.homeScore ?? null;
  const away = match.awayScore ?? null;
  const homeText = home === null ? UNKNOWN_SCORE_GLYPH : String(home);
  const awayText = away === null ? UNKNOWN_SCORE_GLYPH : String(away);
  return {
    known: home !== null && away !== null,
    home,
    away,
    homeText,
    awayText,
    text: `${homeText} – ${awayText}`,
  };
}

/**
 * The sentence for a screen reader. `known` has `{home} {hs} {away} {as}`
 * (`matches.a11y.score`); `unavailable` has `{home} {away}`
 * (`matches.a11y.score_unavailable`). A score missing either figure is not
 * announced as a score at all.
 */
export function scoreSentence(
  score: PresentedScore,
  names: { readonly home: string; readonly away: string },
  known: string,
  unavailable: string,
): string {
  if (!score.known) {
    return unavailable.replace("{home}", names.home).replace("{away}", names.away);
  }
  return known
    .replace("{home}", names.home)
    .replace("{hs}", String(score.home))
    .replace("{away}", names.away)
    .replace("{as}", String(score.away));
}
