import type { ScorePair } from "./contracts";
import type { ScoredKind } from "./scoring";

/**
 * The rule-v1 cases, shared by the TypeScript scorer's test and, by value, the
 * database's (supabase/tests/database/predictions_rules.test.sql). A new case
 * goes in both.
 */
export const SCORING_CASES: readonly {
  prediction: ScorePair;
  result: ScorePair;
  points: 0 | 1 | 3;
  kind: ScoredKind;
}[] = [
  { prediction: { home: 2, away: 1 }, result: { home: 2, away: 1 }, points: 3, kind: "exact" },
  { prediction: { home: 0, away: 0 }, result: { home: 0, away: 0 }, points: 3, kind: "exact" },
  { prediction: { home: 7, away: 3 }, result: { home: 7, away: 3 }, points: 3, kind: "exact" },
  { prediction: { home: 3, away: 1 }, result: { home: 1, away: 0 }, points: 1, kind: "outcome" },
  { prediction: { home: 1, away: 1 }, result: { home: 2, away: 2 }, points: 1, kind: "outcome" },
  { prediction: { home: 0, away: 2 }, result: { home: 1, away: 3 }, points: 1, kind: "outcome" },
  { prediction: { home: 5, away: 4 }, result: { home: 1, away: 0 }, points: 1, kind: "outcome" },
  { prediction: { home: 1, away: 0 }, result: { home: 0, away: 1 }, points: 0, kind: "miss" },
  { prediction: { home: 1, away: 1 }, result: { home: 1, away: 0 }, points: 0, kind: "miss" },
  { prediction: { home: 2, away: 0 }, result: { home: 0, away: 0 }, points: 0, kind: "miss" },
];
