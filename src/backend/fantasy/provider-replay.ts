/**
 * Replay of one finished match from payloads already in hand, to say exactly what
 * still stands between the evidence and reliable Fantasy ingestion.
 *
 * Pure: no database, no network, no clock. The caller loads the payloads
 * (committed Phase 0 fixtures, or a stored response) and the reviewed-identity
 * snapshot, and passes `observedAt`. A replay of historical payloads validates
 * those payloads only; it is not a fresh provider check.
 *
 * Three questions, kept apart because one answer does not imply the next:
 * - IDENTITY_RESOLVED: every player who appeared is a reviewed identity on the
 *   provider ids that supply him (a reviewed mapping, not a shirt-number guess).
 * - EVENTS_RECONCILED: the two providers' goals, cards and substitutions agree
 *   well enough for the reconciler not to send the match to review.
 * - SCORING_READY: the reconciler scores the match and holds nobody back.
 * Ingestion is reliable only when all three hold.
 */
import {
  reconcileMatch,
  type ProviderMatchData,
  type ReconcileResult,
} from "./provider-reconciler";
import type { ReviewedIdentitySnapshot } from "./reviewed-identities";
import type { MatchSide } from "../football/provider/performance-contracts";

/** Discrepancies that are about WHO a player is, not about what happened. */
const IDENTITY_CONFLICT_CODES: ReadonlySet<string> = new Set([
  "identity_mapping_conflict",
  "identity_side_conflict",
  "duplicate_canonical_identity",
]);

export interface ReplayInput {
  readonly observedAt: string;
  readonly sofascore: ProviderMatchData;
  readonly flashscore: ProviderMatchData;
  readonly snapshot: ReviewedIdentitySnapshot;
}

export interface LineupCounts {
  readonly provider: "sofascore" | "flashscore";
  readonly side: MatchSide;
  readonly entries: number;
  readonly starters: number;
}

export interface ProviderIdentityCoverage {
  /** Lineup entries (starters and substitutes listed). */
  readonly entries: number;
  /** Entries who appeared: a starter, or brought on by a substitution incident. */
  readonly appeared: number;
  /** Entries whose id is a reviewed mapping in the snapshot. */
  readonly reviewed: number;
  /** Appeared entries whose id is a reviewed mapping. */
  readonly appearedReviewed: number;
  /** Provider ids of entries who appeared and are NOT reviewed. */
  readonly appearedUnresolvedIds: readonly string[];
  readonly appearedUnresolvedStarters: number;
  /** Unresolved players who came on from the bench: their minutes depend on an unresolved identity. */
  readonly appearedUnresolvedSubstitutes: number;
  /** Unresolved players named in a goal, assist, card or missed penalty: points depend on them. */
  readonly unresolvedWithScoringIncidents: number;
}

export interface StageVerdict {
  /** IDENTITIES_RESOLVED: every player who appeared is a reviewed identity on both providers. */
  readonly identityResolved: boolean;
  /** EVENTS_RECONCILED: the providers' goals, cards and substitutions agree enough not to send the match to review. */
  readonly eventsReconciled: boolean;
  /**
   * PARTICIPATION_ESTABLISHED: minutes, goals conceded and clean sheet are verified for every
   * player, nobody who appeared is unpaired, and no substitution or timeline disagrees.
   */
  readonly participationEstablished: boolean;
  /** SCORING_FIELDS_READY: the reconciler scores the match (full or simple) and holds nobody back. */
  readonly scoringFieldsReady: boolean;
  /** Same as `scoringFieldsReady`; kept for the earlier three-stage report. */
  readonly scoringReady: boolean;
  /** All four. A legacy full or simple result alone is never ingestion-ready. */
  readonly ingestionReady: boolean;
}

/** Discrepancies that mean a player's time on the pitch is not established. */
const PARTICIPATION_CODES: ReadonlySet<string> = new Set([
  "timeline_disagrees",
  "substitution_mismatch",
  "participation_ambiguous",
  "minutes_mismatch",
]);

export interface ResultSummary {
  readonly mode: ReconcileResult["mode"];
  readonly scorableMode: ReconcileResult["scorableMode"];
  readonly heldBack: number;
  readonly pairedRecords: number;
  readonly singleSourceRecords: number;
  readonly unmatchedRecords: number;
  readonly unmatchedAppeared: number;
  readonly discrepancyCounts: Readonly<Record<string, number>>;
  readonly fixtureBlockers: readonly string[];
  /** Fields that stay unknown, per field name, over players the reconciler produced. */
  readonly unknownFields: Readonly<Record<string, number>>;
  readonly statusCounts: Readonly<Record<string, number>>;
  readonly duplicateCanonicalIdentities: number;
}

export interface FixtureReplay {
  readonly sofascoreId: string;
  readonly flashscoreId: string;
  readonly score: { readonly home: number | null; readonly away: number | null };
  readonly lineups: readonly LineupCounts[];
  readonly coverage: {
    readonly sofascore: ProviderIdentityCoverage;
    readonly flashscore: ProviderIdentityCoverage;
  };
  /** (A) the reconciler as it was: no reviewed-identity input. */
  readonly before: ResultSummary;
  /** (B) the mapping-aware reconciler with the snapshot. */
  readonly after: ResultSummary;
  readonly stages: StageVerdict;
  /** Plain statements of what stops ingestion, identity gaps first, then evidence gaps. */
  readonly blockers: readonly string[];
  readonly snapshotDigest: string;
}

const count = <T>(items: readonly T[], key: (item: T) => string): Record<string, number> => {
  const out: Record<string, number> = {};
  for (const item of items) out[key(item)] = (out[key(item)] ?? 0) + 1;
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => (a < b ? -1 : 1)));
};

function summarize(result: ReconcileResult, appearedIds: ReadonlySet<string>): ResultSummary {
  const unknownFields: Record<string, number> = {};
  for (const p of result.players) {
    for (const [field, proof] of Object.entries(p.evidence)) {
      if (proof?.state === "unknown") unknownFields[field] = (unknownFields[field] ?? 0) + 1;
    }
  }
  const duplicates = result.discrepancies.filter((d) => d.code === "duplicate_canonical_identity");
  return {
    mode: result.mode,
    scorableMode: result.scorableMode,
    heldBack: result.heldBack,
    pairedRecords: result.players.filter((p) => p.sofascoreId !== null && p.flashscoreId !== null)
      .length,
    singleSourceRecords: result.players.filter(
      (p) => p.sofascoreId === null || p.flashscoreId === null,
    ).length,
    unmatchedRecords: result.unmatched.length,
    unmatchedAppeared: result.unmatched.filter(
      (u) => u.starter || appearedIds.has(`${u.provider}:${u.providerId}`),
    ).length,
    discrepancyCounts: count(result.discrepancies, (d) => `${d.level}:${d.code}`),
    fixtureBlockers: result.discrepancies
      .filter((d) => d.level === "fixture")
      .map((d) => d.message),
    unknownFields: Object.fromEntries(
      Object.entries(unknownFields).sort(([a], [b]) => (a < b ? -1 : 1)),
    ),
    statusCounts: count(result.players, (p) => p.identityStatus),
    duplicateCanonicalIdentities: duplicates.length,
  };
}

function coverageOf(
  data: ProviderMatchData,
  provider: "sofascore" | "flashscore",
  snapshot: ReviewedIdentitySnapshot,
  cameOn: ReadonlySet<string>,
): ProviderIdentityCoverage {
  const reviewedIds = new Set(
    snapshot.entries.filter((e) => e.provider === provider).map((e) => e.externalId),
  );
  const players = data.lineups.players;
  const appeared = players.filter((p) => p.starter || cameOn.has(`${provider}:${p.externalId}`));
  const unresolved = appeared.filter((p) => !reviewedIds.has(p.externalId));
  const scoring = new Set<string>();
  for (const i of data.incidents) {
    if (i.kind === "substitution") continue;
    for (const ref of [i.player, i.assist]) if (ref?.externalId) scoring.add(ref.externalId);
  }
  return {
    entries: players.length,
    appeared: appeared.length,
    reviewed: players.filter((p) => reviewedIds.has(p.externalId)).length,
    appearedReviewed: appeared.filter((p) => reviewedIds.has(p.externalId)).length,
    appearedUnresolvedIds: unresolved.map((p) => p.externalId).sort(),
    appearedUnresolvedStarters: unresolved.filter((p) => p.starter).length,
    appearedUnresolvedSubstitutes: unresolved.filter((p) => !p.starter).length,
    unresolvedWithScoringIncidents: unresolved.filter((p) => scoring.has(p.externalId)).length,
  };
}

const cameOnSet = (data: ProviderMatchData, provider: "sofascore" | "flashscore") =>
  new Set(
    data.incidents
      .filter((i) => i.kind === "substitution" && i.playerIn?.externalId)
      .map((i) => `${provider}:${i.playerIn?.externalId}`),
  );

export function replayFixture(input: ReplayInput): FixtureReplay {
  const { sofascore, flashscore, snapshot, observedAt } = input;
  const base = { observedAt, sofascore, flashscore };
  const sofaCame = cameOnSet(sofascore, "sofascore");
  const flashCame = cameOnSet(flashscore, "flashscore");
  const appearedIds = new Set([...sofaCame, ...flashCame]);
  const before = reconcileMatch(base);
  const after = reconcileMatch({ ...base, reviewedIdentities: snapshot });

  const lineups: LineupCounts[] = [];
  for (const [provider, data] of [
    ["sofascore", sofascore],
    ["flashscore", flashscore],
  ] as const) {
    for (const side of ["home", "away"] as const) {
      const entries = data.lineups.players.filter((p) => p.side === side);
      lineups.push({
        provider,
        side,
        entries: entries.length,
        starters: entries.filter((p) => p.starter).length,
      });
    }
  }
  const coverage = {
    sofascore: coverageOf(sofascore, "sofascore", snapshot, sofaCame),
    flashscore: coverageOf(flashscore, "flashscore", snapshot, flashCame),
  };

  const afterSummary = summarize(after, appearedIds);
  // Identity is resolved only when every player who appeared, on either provider,
  // is a reviewed identity. A shirt-number pairing is a suggestion, never this.
  const identityConflicts = after.discrepancies.filter((d) => IDENTITY_CONFLICT_CODES.has(d.code));
  const identityResolved =
    coverage.sofascore.appearedUnresolvedIds.length === 0 &&
    coverage.flashscore.appearedUnresolvedIds.length === 0 &&
    identityConflicts.length === 0 &&
    // Every id may be mapped and still be unpaired (mapped to different people).
    afterSummary.unmatchedAppeared === 0;
  const eventsReconciled = after.mode !== "review";
  const scoringReady = (after.mode === "full" || after.mode === "simple") && after.heldBack === 0;
  const participationEstablished =
    eventsReconciled &&
    afterSummary.unmatchedAppeared === 0 &&
    !after.discrepancies.some((d) => PARTICIPATION_CODES.has(d.code)) &&
    after.players.every(
      (p) =>
        p.evidence.minutes?.state === "verified" &&
        p.evidence.goalsConceded?.state === "verified" &&
        p.evidence.cleanSheet?.state === "verified",
    );
  const stages: StageVerdict = {
    identityResolved,
    eventsReconciled,
    participationEstablished,
    scoringFieldsReady: scoringReady,
    scoringReady,
    ingestionReady:
      identityResolved && eventsReconciled && participationEstablished && scoringReady,
  };

  const blockers: string[] = [];
  const sofaGap = coverage.sofascore.appearedUnresolvedIds.length;
  const flashGap = coverage.flashscore.appearedUnresolvedIds.length;
  if (sofaGap > 0) {
    blockers.push(
      `IDENTITY: ${sofaGap} Sofascore player(s) who appeared have no reviewed mapping.`,
    );
  }
  if (flashGap > 0) {
    blockers.push(
      `IDENTITY: ${flashGap} Flashscore player(s) who appeared have no reviewed mapping (no Flashscore mapping exists yet).`,
    );
  }
  for (const d of identityConflicts) blockers.push(`IDENTITY: ${d.message}`);
  if (afterSummary.unmatchedAppeared > 0) {
    blockers.push(
      `IDENTITY: ${afterSummary.unmatchedAppeared} player(s) who appeared could not be paired across the providers.`,
    );
  }
  for (const d of after.discrepancies) {
    if (d.level === "fixture" && !IDENTITY_CONFLICT_CODES.has(d.code)) {
      blockers.push(`EVENTS: ${d.message}`);
    }
  }
  if (eventsReconciled && after.heldBack > 0) {
    blockers.push(
      `EVIDENCE: ${after.heldBack} player(s) held back (${
        Object.entries(afterSummary.unknownFields)
          .map(([f, n]) => `${f} unknown for ${n}`)
          .join(", ") || "unpaired players"
      }).`,
    );
  }

  return {
    sofascoreId: sofascore.summary.externalId,
    flashscoreId: flashscore.summary.externalId,
    score: { home: sofascore.summary.homeScore, away: sofascore.summary.awayScore },
    lineups,
    coverage,
    before: summarize(before, appearedIds),
    after: afterSummary,
    stages,
    blockers,
    snapshotDigest: snapshot.digest,
  };
}
