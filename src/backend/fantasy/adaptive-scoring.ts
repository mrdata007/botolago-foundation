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
/** A scoring item the observation row itself marks as awaiting confirmation (C1). */
export interface RowPendingItem {
  readonly category: string;
  readonly reason?: string | null;
}

/**
 * The fields each category depends on. `clean_sheet` and `goals_conceded` also
 * stand in for their fields below the full-appearance minutes (see
 * `scorableCategories`); SQL: app_private.fantasy_category_fields.
 */
export const categoryFields: Record<string, readonly ScoringField[]> = {
  appearance: ["minutes"],
  goal: ["goals"],
  assist: ["assists"],
  clean_sheet: ["minutes", "cleanSheet"],
  goals_conceded: ["minutes", "goalsConceded"],
  saves: ["saves"],
  penalty_save: ["penaltiesSaved"],
  penalty_miss: ["penaltiesMissed"],
  yellow_card: ["yellowCards"],
  red_card: ["redCards"],
  second_yellow_dismissal: ["secondYellowDismissals"],
  own_goal: ["ownGoals"],
};
const ALL_CATEGORIES = Object.keys(categoryFields);

/** The categories a mode counts: simple mode leaves four out (they are not pending, just not counted). */
export function scopedCategories(mode: ScoringMode | null): string[] {
  return ALL_CATEGORIES.filter(
    (category) =>
      !(mode === "simple" && (EXCLUDED_SIMPLE_CATEGORIES as readonly string[]).includes(category)),
  ).sort();
}

/**
 * The categories of one player-fixture whose facts allow a score, sorted. The
 * rule is the same as SQL app_private.fantasy_row_scorable_categories:
 *   appearance      minutes scorable
 *   clean_sheet     minutes scorable and (cleanSheet scorable, or minutes under the
 *                   full-appearance minutes with no appearance pending item)
 *   goals_conceded  minutes scorable and (goalsConceded scorable, or the same)
 *   the others      their own field
 * "Scorable" is certified evidence (simple mode also accepts reviewed estimates).
 */
export function scorableCategories(
  stats: CertifiedStats,
  evidence: FieldEvidence,
  fullAppearanceMinutes: number,
  mode: ScoringMode | null,
  pendingItems: readonly RowPendingItem[] = [],
): string[] {
  const ok = (field: ScoringField) => certified(field, stats, evidence, mode === "simple");
  const minutes = ok("minutes");
  const appearancePending = pendingItems.some((item) => item.category === "appearance");
  const underFull = minutes && (stats.minutes as number) < fullAppearanceMinutes;
  const scorable = (category: string): boolean => {
    switch (category) {
      case "clean_sheet":
        return minutes && (ok("cleanSheet") || (underFull && !appearancePending));
      case "goals_conceded":
        return minutes && (ok("goalsConceded") || (underFull && !appearancePending));
      default:
        return categoryFields[category]!.every(ok);
    }
  };
  return scopedCategories(mode).filter(scorable);
}

/**
 * The categories that wait: in the mode's scope but not scorable, plus the
 * categories the row's pending items name. Sorted. An `appearance` pending item
 * still scores its confirmed value (it is scorable) and is listed here too.
 */
export function pendingCategories(
  stats: CertifiedStats,
  evidence: FieldEvidence,
  fullAppearanceMinutes: number,
  mode: ScoringMode | null,
  pendingItems: readonly RowPendingItem[] = [],
): string[] {
  const scorable = new Set(
    scorableCategories(stats, evidence, fullAppearanceMinutes, mode, pendingItems),
  );
  const waiting = new Set(scopedCategories(mode).filter((category) => !scorable.has(category)));
  for (const item of pendingItems)
    if (ALL_CATEGORIES.includes(item.category)) waiting.add(item.category);
  return [...waiting].sort();
}

/** Pending categories emit no event; unknown is never turned into a zero fact. */
export function scoreCertifiedPlayerFixture(
  playerId: string,
  fixtureId: string,
  position: FantasyPosition,
  stats: CertifiedStats,
  evidence: FieldEvidence,
  rules: ScoringRules,
  mode: ScoringMode | null,
  pendingItems: readonly RowPendingItem[] = [],
): readonly PointEvent[] {
  // Defaults only satisfy the arithmetic interface; the category filter below
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
  const allowed = new Set(
    scorableCategories(stats, evidence, rules.fullAppearanceMinutes, mode, pendingItems),
  );
  return scorePlayerFixture(playerId, fixtureId, position, complete, rules).filter((event) =>
    allowed.has(event.category),
  );
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
