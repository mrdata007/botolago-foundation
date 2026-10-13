// The part of adaptive Fantasy scoring that building an observation needs:
// which fields exist, what makes a field certified, what a player's minutes,
// goals conceded and clean sheet are given his times on the pitch.
//
// It lives here, not in src/backend/fantasy/adaptive-scoring.ts, so the SofaScore
// Fantasy builder (sofascore-fantasy.ts) runs unchanged in the Edge Function and
// in src. adaptive-scoring.ts re-exports all of this; the scoring itself
// (scoreCertifiedPlayerFixture, chooseFixtureMode) stays there.
//
// Dependency free, so it runs under Bun (tests) and Deno (the Edge Function).

export type FantasyPosition = "GK" | "DEF" | "MID" | "FWD";
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
export type ScoringField = (typeof SIMPLE_FIELDS)[number] | (typeof DETAIL_FIELDS)[number];

/** The value of each scoring field (the numbers of PlayerFixtureStats the evidence covers). */
export interface CertifiedFieldValues {
  /** Official regulation minutes only; stoppage time must not inflate thresholds. */
  readonly minutes: number;
  readonly goals: number;
  readonly assists: number;
  readonly cleanSheet: boolean;
  readonly goalsConceded: number;
  readonly saves: number;
  readonly penaltiesSaved: number;
  readonly penaltiesMissed: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly secondYellowDismissals: number;
  readonly ownGoals: number;
}
export type CertifiedStats = Partial<Pick<CertifiedFieldValues, ScoringField>>;
export type FieldEvidence = Partial<Record<ScoringField, StatisticEvidence>>;

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

/**
 * A point on the match clock: the minute and the added minutes (`45+3` is
 * minute 45, added 3). `added` is null when the provider gives none.
 */
export interface ClockMoment {
  readonly minute: number;
  readonly added: number | null;
}

/**
 * Which of two moments came first: -1 (a before b), 1 (a after b), or 0 when the
 * clock cannot say. Events are ordered by (minute, added ?? 0). Two moments are
 * undecidable when both numbers are equal, and, to stay on the safe side, also
 * when the minute is equal and one has no added time while the other has some
 * (a half-time change recorded as minute 45 against a goal at 45+3 is not
 * ordered by guessing).
 */
export function compareMoments(a: ClockMoment, b: ClockMoment): -1 | 0 | 1 {
  if (a.minute !== b.minute) return a.minute < b.minute ? -1 : 1;
  const addedA = a.added ?? 0;
  const addedB = b.added ?? 0;
  if (addedA === addedB) return 0;
  if ((a.added === null && addedB > 0) || (b.added === null && addedA > 0)) return 0;
  return addedA < addedB ? -1 : 1;
}

export interface OrderedParticipationTimeline {
  readonly started: boolean;
  readonly enteredAt: ClockMoment | null;
  readonly exitedAt: ClockMoment | null;
  /** The goals his side conceded, with their clock moments. */
  readonly concededAt: readonly ClockMoment[];
}

export interface OrderedParticipation {
  /** Whole minutes between coming on and going off (at least 1), as deriveParticipation. */
  readonly minutes: number;
  /** Goals conceded while he was on the pitch, not counting the ambiguous ones. */
  readonly goalsConceded: number;
  /**
   * Goals whose order against his coming on or going off the clock cannot give.
   * When there are any, `goalsConceded` is a lower bound and the clean sheet is not known.
   */
  readonly ambiguousGoals: number;
}

/**
 * Participation with added time taken into account (the owner decision of
 * 2026-10-13, contract C1). Unlike `deriveParticipation`, a goal on the same
 * minute as a substitution or sending-off is not an error: it is counted when
 * the clock puts it inside his time on the pitch, left out when it puts it
 * outside, and reported as ambiguous when it cannot say. It still throws
 * `participation_inconsistent` for times that cannot be true.
 */
export function deriveOrderedParticipation(
  input: OrderedParticipationTimeline,
): OrderedParticipation {
  const start = input.started ? 0 : (input.enteredAt?.minute ?? null);
  const end = input.exitedAt?.minute ?? 90;
  if (
    start === null ||
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < start ||
    end > 90
  )
    throw new Error("participation_inconsistent");
  if (
    input.enteredAt !== null &&
    input.exitedAt !== null &&
    compareMoments(input.exitedAt, input.enteredAt) < 0
  )
    throw new Error("participation_inconsistent");
  let goalsConceded = 0;
  let ambiguousGoals = 0;
  for (const goal of input.concededAt) {
    if (!Number.isFinite(goal.minute) || goal.minute < 0 || goal.minute > 90)
      throw new Error("participation_inconsistent");
    // After coming on (a starter is on from the start)?
    let afterEntry: -1 | 0 | 1 = 1;
    if (!input.started && input.enteredAt) afterEntry = compareMoments(goal, input.enteredAt);
    if (afterEntry < 0) continue; // before he came on
    // Before going off (he may never go off)?
    let beforeExit: -1 | 0 | 1 = -1;
    if (input.exitedAt) beforeExit = compareMoments(goal, input.exitedAt);
    if (beforeExit > 0) continue; // after he went off
    if (afterEntry === 0 || beforeExit === 0) ambiguousGoals += 1;
    else goalsConceded += 1;
  }
  return { minutes: Math.max(1, end - start), goalsConceded, ambiguousGoals };
}
