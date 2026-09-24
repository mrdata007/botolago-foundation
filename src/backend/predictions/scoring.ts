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

/** Who wins, as the results line says it: "Bon résultat (Raja gagne)". */
export type MatchOutcome = "home" | "draw" | "away";

export function matchOutcome(score: ScorePair): MatchOutcome {
  const sign = Math.sign(score.home - score.away);
  return sign > 0 ? "home" : sign < 0 ? "away" : "draw";
}
