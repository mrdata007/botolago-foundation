export type ExceptionalFixtureState = "postponed" | "suspended" | "abandoned" | "completed";

export type FixtureAssignmentDecision =
  | "reassign_before_lock"
  | "keep_original_gameweek"
  | "move_to_actual_gameweek"
  | "count_official_result"
  | "void_and_replay_later"
  | "remain_provisional";

export interface FixtureResolutionInput {
  readonly state: ExceptionalFixtureState;
  readonly locked: boolean;
  readonly competitionConfirmedResult: boolean;
  readonly resumedFromSuspension: boolean;
  readonly replayedFromBeginning: boolean;
  readonly completedAt: Date | null;
  readonly originalKickoffAt: Date;
  readonly nextGameweekDeadlineAt: Date;
  readonly completionWindowHours: number;
}

export function resolveFixtureAssignment(input: FixtureResolutionInput): FixtureAssignmentDecision {
  if (!input.locked && input.state === "postponed") return "reassign_before_lock";
  if (input.competitionConfirmedResult) return "count_official_result";
  if (input.replayedFromBeginning) return "void_and_replay_later";
  if (input.completedAt) {
    const elapsedHours =
      (input.completedAt.getTime() - input.originalKickoffAt.getTime()) / (60 * 60 * 1000);
    if (
      elapsedHours <= input.completionWindowHours &&
      input.completedAt < input.nextGameweekDeadlineAt &&
      (input.state === "postponed" || input.resumedFromSuspension || input.state === "completed")
    )
      return "keep_original_gameweek";
    return "move_to_actual_gameweek";
  }
  return "remain_provisional";
}
