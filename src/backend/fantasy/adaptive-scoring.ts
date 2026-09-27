import type { PlayerFixtureStats, PointEvent, ScoringRules } from "./scoring";
import { scorePlayerFixture } from "./scoring";
import type { FantasyPosition } from "./contracts";

export type ScoringMode = "full" | "simple";
export type EvidenceState = "verified" | "derived" | "estimated" | "unknown";
export interface StatisticEvidence {
  state: EvidenceState;
  source: string;
  observedAt: string;
  references: readonly string[];
  /** Explicit assumption retained for a reviewed best-available value. */
  reason?: string;
}
export const SIMPLE_FIELDS = [
  "minutes",
  "goals",
  "cleanSheet",
  "goalsConceded",
  "yellowCards",
  "redCards",
  "secondYellowDismissals",
  "ownGoals",
] as const;
export const DETAIL_FIELDS = ["assists", "saves", "penaltiesSaved", "penaltiesMissed"] as const;
export const EXCLUDED_SIMPLE_CATEGORIES = [
  "assist",
  "saves",
  "penalty_save",
  "penalty_miss",
] as const;
export type ScoringField = (typeof SIMPLE_FIELDS)[number] | (typeof DETAIL_FIELDS)[number];
export type CertifiedStats = Partial<Pick<PlayerFixtureStats, ScoringField>>;
export type FieldEvidence = Partial<Record<ScoringField, StatisticEvidence>>;
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
export function certified(
  field: ScoringField,
  stats: CertifiedStats,
  evidence: FieldEvidence,
  allowEstimated = false,
): boolean {
  const value = stats[field];
  const item = evidence[field];
  return (
    item !== undefined &&
    item !== null &&
    typeof item === "object" &&
    typeof item.source === "string" &&
    typeof item.observedAt === "string" &&
    Array.isArray(item.references) &&
    ["verified", "derived", "estimated"].includes(item.state) &&
    (item.state !== "estimated" ||
      (allowEstimated &&
        (SIMPLE_FIELDS as readonly string[]).includes(field) &&
        item.source === "reviewed-best-available" &&
        typeof item.reason === "string" &&
        item.reason.trim().length >= 8 &&
        item.reason.trim().length <= 500)) &&
    item.source.trim().length > 0 &&
    Number.isFinite(Date.parse(item.observedAt)) &&
    item.references.length > 0 &&
    item.references.every(
      (reference) => typeof reference === "string" && reference.trim().length > 0,
    ) &&
    (field === "cleanSheet"
      ? typeof value === "boolean"
      : typeof value === "number" &&
        Number.isSafeInteger(value) &&
        value >= 0 &&
        value <= 130 &&
        (field !== "minutes" || value <= 90))
  );
}
export function readiness(
  stats: CertifiedStats,
  evidence: FieldEvidence,
  position: FantasyPosition,
) {
  const core = SIMPLE_FIELDS.every((field) => certified(field, stats, evidence, true));
  const details = DETAIL_FIELDS.filter(
    (field) => position === "GK" || !["saves", "penaltiesSaved"].includes(field),
  );
  return {
    simple: core,
    full:
      core &&
      SIMPLE_FIELDS.every((field) => evidence[field]?.state !== "estimated") &&
      SIMPLE_FIELDS.filter((field) => field !== "cleanSheet").every(
        (field) => evidence[field]?.state === "verified",
      ) &&
      details.every(
        (field) => certified(field, stats, evidence) && evidence[field]?.state === "verified",
      ),
  };
}
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

export interface ParticipationTimeline {
  complete: boolean;
  appeared: boolean;
  started: boolean;
  enteredAt: number | null;
  exitedAt: number | null;
  /** Regulation-minute offsets; added-time goals stay at 45 or 90. */
  concededAt: readonly number[];
  orderingVerified: boolean;
}
/** Clock offsets are regulation minutes; added time is represented separately
 * by the event importer before supplying regulation start/end values. */
export function deriveParticipation(input: ParticipationTimeline) {
  if (!input.complete || !input.orderingVerified) throw new Error("participation_unverified");
  if (!input.appeared) {
    if (input.started || input.enteredAt !== null || input.exitedAt !== null)
      throw new Error("participation_inconsistent");
    return { minutes: 0, goalsConceded: 0, cleanSheet: false };
  }
  const start = input.started ? 0 : input.enteredAt;
  const end = input.exitedAt ?? 90;
  if (
    start === null ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > 90
  )
    throw new Error("participation_inconsistent");
  // Same-minute goals and changes need a verified event ordering upstream;
  // timestamps alone cannot safely decide on-pitch conceded goals.
  if (
    input.concededAt.some(
      (at) =>
        !Number.isFinite(at) ||
        at < 0 ||
        at > 90 ||
        (at === start && !input.started) ||
        (at === end && input.exitedAt !== null),
    )
  )
    throw new Error("participation_event_order_ambiguous");
  const minutes = Math.max(1, end - start);
  const goalsConceded = input.concededAt.filter((at) => at >= start && at <= end).length;
  return { minutes, goalsConceded, cleanSheet: minutes >= 60 && goalsConceded === 0 };
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
