import type { FantasyRulesDto } from "@/backend/fantasy/contracts";

/**
 * Which scoring explanations the rules page's "how points are validated"
 * card shows, and which round each one governs (audit LOC-01).
 *
 * The server can send two policy objects at once: `adaptiveScoring` (the
 * action-based scale, whose paragraph explains what is left out when match
 * statistics are incomplete) and `ratingScoring` (points from the SofaScore
 * rating, from `fromGameweek`). When both are present the action-based
 * paragraph describes only the rounds before the rating rule starts, so it
 * has to say so. Nothing here computes a point or decides a policy: it only
 * reads the two objects the server sent and names the rounds they cover.
 */
export type ScoringPolicyView = {
  /** The first round of the rating rule, or null when the rule is off. */
  ratingFromGameweek: number | null;
  /** Show the action-based paragraph (`fantasy.scoring.policy`). */
  showEventPolicy: boolean;
  /** The last round of the action-based scale, named whenever the rating rule starts after round 1. */
  eventPolicyUntilGameweek: number | null;
};

export function scoringPolicyView(
  rules: Pick<FantasyRulesDto, "adaptiveScoring" | "ratingScoring"> | null | undefined,
): ScoringPolicyView {
  const ratingFrom = rules?.ratingScoring?.fromGameweek ?? null;
  const adaptiveFrom = rules?.adaptiveScoring?.fromGameweek ?? null;
  // A rating rule that starts at round 1 leaves no earlier round to explain.
  const earlierRounds = ratingFrom !== null && ratingFrom > 1;
  // The action-based paragraph (the 12-hour fixing, what is left out when
  // statistics are incomplete) belongs to the adaptive policy, which the server
  // lets start in the very round the rating rule starts (migration
  // 20261014090000: adaptive `from_gameweek <= p_from_gameweek`). Then no
  // earlier round ever used it, and it is not shown as if one had.
  const adaptiveBeforeRating =
    adaptiveFrom !== null && ratingFrom !== null && adaptiveFrom < ratingFrom;
  return {
    ratingFromGameweek: ratingFrom,
    showEventPolicy: ratingFrom === null ? adaptiveFrom !== null : adaptiveBeforeRating,
    eventPolicyUntilGameweek: earlierRounds ? ratingFrom - 1 : null,
  };
}
