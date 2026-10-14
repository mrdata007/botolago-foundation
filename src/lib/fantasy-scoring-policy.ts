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
  /** The last round that paragraph governs, when it needs naming; null when it is the only rule. */
  eventPolicyUntilGameweek: number | null;
};

export function scoringPolicyView(
  rules: Pick<FantasyRulesDto, "adaptiveScoring" | "ratingScoring"> | null | undefined,
): ScoringPolicyView {
  const ratingFrom = rules?.ratingScoring?.fromGameweek ?? null;
  // A rating rule that starts at round 1 leaves no earlier round to explain.
  const earlierRounds = ratingFrom !== null && ratingFrom > 1;
  return {
    ratingFromGameweek: ratingFrom,
    showEventPolicy: Boolean(rules?.adaptiveScoring) && (ratingFrom === null || earlierRounds),
    eventPolicyUntilGameweek: earlierRounds ? ratingFrom - 1 : null,
  };
}
