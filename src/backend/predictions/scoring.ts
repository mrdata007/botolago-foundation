import type { ScorePair } from "./contracts";

/**
 * Rule v1, the TypeScript twin of `app_private.prediction_points` and
 * `app_private.prediction_result_kind`
 * (supabase/migrations/20260925090100_predictions_rules.sql):
 *
 *   exact score                                  3
 *   right outcome (home win / draw / away win)   1
 *   otherwise                                    0
 *
 * The database is the authority for every signed-in player. This copy scores
 * a guest's picks on the phone, where nothing is ranked. Both are checked
 * against the same cases (`scoring-cases.ts` and predictions_rules.test.sql).
 */
export type ScoredKind = "exact" | "outcome" | "miss";

export function predictionResultKind(prediction: ScorePair, result: ScorePair): ScoredKind {
  if (prediction.home === result.home && prediction.away === result.away) return "exact";
  if (Math.sign(prediction.home - prediction.away) === Math.sign(result.home - result.away))
    return "outcome";
  return "miss";
}

export function predictionPoints(prediction: ScorePair, result: ScorePair): 0 | 1 | 3 {
  const kind = predictionResultKind(prediction, result);
  return kind === "exact" ? 3 : kind === "outcome" ? 1 : 0;
}

/**
 * A guest's pick, scored on the phone the way the database scores a signed-in
 * player's: a void match (cancelled, abandoned, or voided by an operator) is
 * `void` for 0 points whatever its score; anything else waits for the final.
 */
export function guestPickScore(
  pick: ScorePair | null,
  fixture: { readonly final: boolean; readonly void: boolean; readonly result: ScorePair | null },
): { points: 0 | 1 | 3; kind: ScoredKind | "void" } | null {
  if (!pick) return null;
  if (fixture.void) return { points: 0, kind: "void" };
  if (!fixture.final || !fixture.result) return null;
  return {
    points: predictionPoints(pick, fixture.result),
    kind: predictionResultKind(pick, fixture.result),
  };
}

/** Who wins, as the results line says it: "Bon résultat (Raja gagne)". */
export type MatchOutcome = "home" | "draw" | "away";

export function matchOutcome(score: ScorePair): MatchOutcome {
  const sign = Math.sign(score.home - score.away);
  return sign > 0 ? "home" : sign < 0 ? "away" : "draw";
}
