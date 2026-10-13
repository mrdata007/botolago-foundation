import type { PlayerFixtureStats, PointEvent, ScoringRules } from "./scoring";
import { scorePlayerFixture } from "./scoring";
import {
  DETAIL_FIELDS,
  SIMPLE_FIELDS,
  certified,
  type CertifiedStats,
  type FieldEvidence,
  type ScoringField,
} from "../../../supabase/functions/_shared/fantasy-adaptive-core.ts";
import type { FantasyPosition } from "./contracts";

// Evidence, certification, readiness and participation are shared with the Edge
// Function (the SofaScore Fantasy builder); they are re-exported unchanged.
export {
  DETAIL_FIELDS,
  SIMPLE_FIELDS,
  certified,
  compareMoments,
  deriveOrderedParticipation,
  deriveParticipation,
  readiness,
  type CertifiedStats,
  type ClockMoment,
  type EvidenceState,
  type FieldEvidence,
  type OrderedParticipation,
  type OrderedParticipationTimeline,
  type ParticipationTimeline,
  type ScoringField,
  type StatisticEvidence,
} from "../../../supabase/functions/_shared/fantasy-adaptive-core.ts";

export type ScoringMode = "full" | "simple";
export const EXCLUDED_SIMPLE_CATEGORIES = [
  "assist",
  "saves",
  "penalty_save",
  "penalty_miss",
] as const;
const categoryFields: Record<string, readonly ScoringField[]> = {
  appearance: ["minutes"],
  goal: ["goals"],
  assist: ["assists"],
  clean_sheet: ["minutes", "cleanSheet", "goalsConceded"],
  goals_conceded: ["minutes", "goalsConceded"],
  saves: ["saves"],
  penalty_save: ["penaltiesSaved"],
  penalty_miss: ["penaltiesMissed"],
  yellow_card: ["yellowCards"],
  red_card: ["redCards"],
  second_yellow_dismissal: ["secondYellowDismissals"],
  own_goal: ["ownGoals"],
};
/** Excluded/unknown categories are absent, never manufactured zero facts. */
export function scoreCertifiedPlayerFixture(
  playerId: string,
  fixtureId: string,
  position: FantasyPosition,
  stats: CertifiedStats,
  evidence: FieldEvidence,
  rules: ScoringRules,
  mode: ScoringMode | null,
): readonly PointEvent[] {
  // Defaults only satisfy the arithmetic interface; the evidence filter below
  // prevents any category with a defaulted input from escaping this function.
  const numeric = Object.fromEntries(
    [...SIMPLE_FIELDS, ...DETAIL_FIELDS].map((field) => [field, stats[field] ?? 0]),
  );
  const complete = {
    ...numeric,
    cleanSheet: stats.cleanSheet ?? false,
    bonus: 0,
    playerOfMatchPoints: 0,
  } as PlayerFixtureStats;
  return scorePlayerFixture(playerId, fixtureId, position, complete, rules).filter((event) => {
    if (
      mode === "simple" &&
      (EXCLUDED_SIMPLE_CATEGORIES as readonly string[]).includes(event.category)
    )
      return false;
    const fields = categoryFields[event.category];
    return (
      fields !== undefined &&
      fields.every((field) => certified(field, stats, evidence, mode === "simple"))
    );
  });
}

export function chooseFixtureMode(input: {
  now: string;
  cutoff: string;
  lockedMode: ScoringMode | null;
  snapshots: readonly { observedAt: string; fullReady: boolean }[];
}): ScoringMode | null {
  if (input.lockedMode) return input.lockedMode;
  const now = Date.parse(input.now),
    cutoff = Date.parse(input.cutoff);
  if (!Number.isFinite(now) || !Number.isFinite(cutoff)) throw new Error("invalid_selection_time");
  if (now < cutoff) return null;
  const snapshot = input.snapshots
    .filter((item) => Date.parse(item.observedAt) <= cutoff)
    .sort((a, b) => Date.parse(b.observedAt) - Date.parse(a.observedAt))[0];
  return snapshot?.fullReady ? "full" : "simple";
}
