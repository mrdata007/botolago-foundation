import type {
  CompletenessReason,
  ProviderSquad,
  ProviderSquadPlayer,
  SquadCompleteness,
} from "./contracts";
import type { ParsedSquad } from "./sofascore-squad";

/**
 * A professional matchday squad is at least 18 (11 starters and 7 substitutes).
 * Fewer than this is treated as a response that is missing players, not as a
 * real squad. Deliberately conservative: it only fires on a clearly short list.
 */
export const MIN_CONSERVATIVE_SQUAD_PLAYERS = 18;
/**
 * "Extreme" disagreement: a provider's squad below this fraction of the largest
 * comparison squad (the other provider's, or the app's). 0.6 is far outside
 * the spread seen across the current 16 clubs (lowest ratio among usable
 * squads about 0.63).
 */
export const EXTREME_DISAGREEMENT_RATIO = 0.6;
/** More than this fraction of malformed entries marks the response as damaged or truncated. */
export const MAX_MALFORMED_FRACTION = 0.1;
/** Position coverage needed before "no goalkeeper listed" means anything. */
const MIN_POSITION_COVERAGE_FOR_GOALKEEPER_CHECK = 0.5;

export interface CompletenessInput {
  readonly fetched: boolean;
  readonly parsed: ParsedSquad | null;
  /** Sizes of the same club's squad elsewhere: the other provider's and the app's. */
  readonly comparisonCounts: readonly number[];
}

/**
 * Generic completeness assessment for one provider squad snapshot. Nothing is
 * hard-coded for any club. A squad that is incomplete still supplies positive
 * evidence for the players present; what it cannot supply is evidence that
 * someone is NOT at the club.
 */
export function assessCompleteness(input: CompletenessInput): SquadCompleteness {
  const reasons: CompletenessReason[] = [];
  if (!input.fetched) reasons.push("fetch_failed");
  else if (!input.parsed || !input.parsed.structureOk) reasons.push("invalid_payload");
  else {
    const { players, diagnostics } = input.parsed;
    if (diagnostics.listedEntries === 0) reasons.push("empty_response");
    if (players.length < MIN_CONSERVATIVE_SQUAD_PLAYERS && diagnostics.listedEntries > 0)
      reasons.push("below_conservative_minimum");
    const largest = Math.max(0, ...input.comparisonCounts);
    if (largest > 0 && players.length < EXTREME_DISAGREEMENT_RATIO * largest)
      reasons.push("extreme_disagreement_with_comparison");
    if (
      diagnostics.listedEntries > 0 &&
      diagnostics.malformedEntries / diagnostics.listedEntries > MAX_MALFORMED_FRACTION
    )
      reasons.push("malformed_entries");
    const withPosition = players.filter((p) => p.positionSignal !== null);
    if (
      players.length > 0 &&
      withPosition.length / players.length >= MIN_POSITION_COVERAGE_FOR_GOALKEEPER_CHECK &&
      !withPosition.some((p) => p.positionSignal === "G")
    )
      reasons.push("no_goalkeeper_listed");
  }
  const unique = [...new Set(reasons)];
  return { state: unique.length === 0 ? "COMPLETE" : "INCOMPLETE_PROVIDER_SQUAD", reasons: unique };
}

export type AbsenceEvidence =
  | { readonly kind: "present" }
  /** The player is not in a complete squad: weak context for a reviewer, never an action. */
  | { readonly kind: "absent_from_complete_squad" }
  /** The squad is incomplete, so absence says nothing: no "not at club" and no ignore suggestion. */
  | { readonly kind: "no_signal"; readonly reason: "incomplete_provider_squad" };

/**
 * What the absence of a provider id from a squad is worth. From an incomplete
 * squad it is worth nothing. Even from a complete one it is only reviewer
 * context: nothing here may be turned into a decision automatically.
 */
export function absenceEvidence(
  squad: Pick<ProviderSquad, "players" | "completeness">,
  externalPlayerId: string,
): AbsenceEvidence {
  if (
    squad.players.some(
      (player: ProviderSquadPlayer) => player.externalPlayerId === externalPlayerId,
    )
  )
    return { kind: "present" };
  if (squad.completeness.state === "INCOMPLETE_PROVIDER_SQUAD")
    return { kind: "no_signal", reason: "incomplete_provider_squad" };
  return { kind: "absent_from_complete_squad" };
}
