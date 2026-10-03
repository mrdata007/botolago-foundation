/**
 * Rank finished matches by the work left before a SAFE staging canary, and say
 * what that work is. Pure. It reads replay results; it changes nothing.
 *
 * Order, most important first:
 * 1. the match-evidence stages already cleared (events reconciled, participation
 *    established, scoring fields ready): a canary exercises ingestion end to end,
 *    so a match the providers still disagree about, or hold players back in, is
 *    not the soonest one, however few identities it lacks;
 * 2. fewer unresolved identities on the players who scored, assisted or were carded;
 * 3. fewer unresolved appearances overall;
 * 4. fewer players held back.
 * The components are returned with the rank so the order can be checked, not trusted.
 */
import type { FixtureReplay } from "./provider-replay";

export interface RemainingWork {
  readonly key: string;
  readonly eventsReconciled: boolean;
  readonly unresolvedAppearances: number;
  readonly unresolvedWithScoringIncidents: number;
  readonly heldBack: number;
  readonly participationEstablished: boolean;
  readonly scoringFieldsReady: boolean;
  /** Plain statements of what still stands between this match and a safe canary. */
  readonly blockers: readonly string[];
}

export function remainingWork(key: string, replay: FixtureReplay): RemainingWork {
  const sofa = replay.coverage.sofascore;
  const flash = replay.coverage.flashscore;
  return {
    key,
    eventsReconciled: replay.stages.eventsReconciled,
    unresolvedAppearances: sofa.appearedUnresolvedIds.length + flash.appearedUnresolvedIds.length,
    unresolvedWithScoringIncidents:
      sofa.unresolvedWithScoringIncidents + flash.unresolvedWithScoringIncidents,
    heldBack: replay.after.heldBack,
    participationEstablished: replay.stages.participationEstablished,
    scoringFieldsReady: replay.stages.scoringFieldsReady,
    blockers: replay.blockers,
  };
}

/** Best first. */
const evidenceStagesCleared = (w: RemainingWork) =>
  Number(w.eventsReconciled) + Number(w.participationEstablished) + Number(w.scoringFieldsReady);

export function rankMatches(items: readonly RemainingWork[]): RemainingWork[] {
  return [...items].sort(
    (a, b) =>
      evidenceStagesCleared(b) - evidenceStagesCleared(a) ||
      a.unresolvedWithScoringIncidents - b.unresolvedWithScoringIncidents ||
      a.unresolvedAppearances - b.unresolvedAppearances ||
      a.heldBack - b.heldBack ||
      (a.key < b.key ? -1 : 1),
  );
}
