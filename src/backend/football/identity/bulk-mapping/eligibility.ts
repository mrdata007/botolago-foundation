import type { BulkTier } from "./contract";

/**
 * The frozen eligibility contract of the bulk batch, over STRUCTURED FACTS only.
 * There is no name field anywhere in this file's inputs: a provider's display
 * name and an app player's display name cannot enter a fact, a score, a tie-break
 * or a manifest. (Names are shown to the owner elsewhere, display-only.)
 */
export type Agreement = "match" | "conflict" | "no_signal";

/** One active member of the observed club, as the database signal function reports the pairing. */
export interface OptionFacts {
  readonly appPlayerId: string;
  /** Exact birth-date agreement. A missing or January-1 date on either side is `no_signal`, never `match`. */
  readonly dob: Agreement;
  readonly shirt: Agreement;
  readonly position: Agreement;
  readonly club: "match" | "mismatch" | "no_signal";
  readonly flags: readonly string[];
  /** Another Sofascore mapping already holds this app player. */
  readonly ownedBySofascore: boolean;
  /** An active SportsMonks mapping already resolves this same canonical app player. */
  readonly sportsMonksActive: boolean;
}

export interface CandidateFacts {
  readonly candidateId: string;
  readonly provider: "sofascore" | "flashscore";
  readonly externalId: string;
  readonly status: "unmapped" | "proposed" | "mapped" | "ignored";
  readonly hasExistingMapping: boolean;
  /** A mapping row already holds this provider id. */
  readonly providerIdMapped: boolean;
  readonly openProposal: boolean;
  readonly evidenceRevision: number;
  readonly observationCount: number;
  readonly appTeamId: string | null;
  readonly squadComplete: boolean;
  readonly registeredTeamDisagreement: boolean;
  readonly providerDobState: "valid" | "missing" | "invalid" | string;
  readonly providerDobJanuary1: boolean;
  /** An independent, non-name bridge to a canonical player (reviewed Sofascore identity, incident evidence). */
  readonly independentBridge: boolean;
  /** Active members of the observed club. Nobody outside the club is a candidate target. */
  readonly options: readonly OptionFacts[];
}

export const BULK_BUCKETS = [
  "AUTO_BATCH_ELIGIBLE",
  "AMBIGUOUS",
  "CONFLICT",
  "INSUFFICIENT_EVIDENCE",
  "INCOMPLETE_PROVIDER_DATA",
  "ALREADY_MAPPED",
  "HELD",
] as const;
export type BulkBucket = (typeof BULK_BUCKETS)[number];

export interface Classification {
  readonly candidateId: string;
  readonly bucket: BulkBucket;
  /** A stable, non-sensitive reason code. */
  readonly reason: string;
  readonly targetAppPlayerId: string | null;
  readonly tier: BulkTier | null;
}

const done = (
  f: CandidateFacts,
  bucket: BulkBucket,
  reason: string,
  target: string | null = null,
  tier: BulkTier | null = null,
): Classification => ({
  candidateId: f.candidateId,
  bucket,
  reason,
  targetAppPlayerId: target,
  tier,
});

/** One candidate, before the global collision gate. */
export function classifyCandidate(f: CandidateFacts): Classification {
  if (f.providerIdMapped || f.status === "mapped" || f.hasExistingMapping)
    return done(f, "ALREADY_MAPPED", "PROVIDER_ID_ALREADY_MAPPED");
  if (f.status !== "unmapped" || f.openProposal) return done(f, "HELD", "STATUS_OR_OPEN_PROPOSAL");
  if (f.provider === "flashscore")
    return f.independentBridge
      ? done(f, "INSUFFICIENT_EVIDENCE", "FLASHSCORE_BRIDGE_NOT_IN_THIS_BATCH")
      : done(f, "INSUFFICIENT_EVIDENCE", "FLASHSCORE_NO_INDEPENDENT_BRIDGE");
  if (f.observationCount !== 1) return done(f, "AMBIGUOUS", "MULTI_SQUAD_OBSERVATION");
  if (f.appTeamId === null) return done(f, "INCOMPLETE_PROVIDER_DATA", "NO_CLUB_CONTEXT");
  if (!f.squadComplete) return done(f, "INCOMPLETE_PROVIDER_DATA", "INCOMPLETE_PROVIDER_SQUAD");
  if (f.providerDobState !== "valid")
    return done(f, "INCOMPLETE_PROVIDER_DATA", "PROVIDER_DOB_NOT_VALID");
  if (f.providerDobJanuary1) return done(f, "INCOMPLETE_PROVIDER_DATA", "PROVIDER_DOB_PLACEHOLDER");
  if (f.registeredTeamDisagreement) return done(f, "CONFLICT", "REGISTERED_TEAM_DISAGREEMENT");
  if (f.options.length === 0) return done(f, "INSUFFICIENT_EVIDENCE", "NO_APP_PLAYERS_IN_CLUB");

  const exact = f.options.filter((o) => o.dob === "match");
  if (exact.length === 0) return done(f, "INSUFFICIENT_EVIDENCE", "NO_EXACT_DOB_MATCH_IN_CLUB");
  if (exact.length > 1) return done(f, "AMBIGUOUS", "MULTIPLE_EXACT_DOB_TARGETS");
  const target = exact[0]!;
  const id = target.appPlayerId;
  if (target.position === "conflict") return done(f, "CONFLICT", "POSITION_DISAGREEMENT", id);
  if (target.flags.length > 0) return done(f, "CONFLICT", "SIGNAL_FLAGS", id);
  if (target.club !== "match") return done(f, "CONFLICT", "CLUB_CONTEXT_MISMATCH", id);
  if (target.ownedBySofascore) return done(f, "CONFLICT", "TARGET_ALREADY_MAPPED_SOFASCORE", id);
  // Tier B says "absolutely no shirt conflict"; a conflict is no evidence for either tier.
  if (target.shirt === "conflict") return done(f, "CONFLICT", "SHIRT_CONFLICT", id);
  if (target.position !== "match")
    return done(f, "INSUFFICIENT_EVIDENCE", "POSITION_NOT_CONFIRMED", id);
  // Both tiers need the SportsMonks identity on the same canonical player.
  if (!target.sportsMonksActive)
    return done(f, "INSUFFICIENT_EVIDENCE", "NO_SPORTSMONKS_CORROBORATION", id);
  return done(f, "AUTO_BATCH_ELIGIBLE", "OK", id, target.shirt === "match" ? "A" : "B");
}

export interface BulkSelection {
  readonly classifications: readonly Classification[];
  readonly eligible: readonly (Classification & {
    externalId: string;
    appTeamId: string;
    evidenceRevision: number;
  })[];
  readonly counts: Readonly<Record<BulkBucket, number>>;
  readonly collisions: {
    readonly duplicateTargets: number;
    readonly duplicateProviderIds: number;
    readonly duplicateCandidates: number;
    readonly rowsRemoved: number;
  };
}

/**
 * Classifies a whole population, then applies the COLLISION GATE: if two eligible
 * rows share a target app player, a provider id or a candidate id, EVERY row involved
 * leaves the batch as CONFLICT. No winner is ever chosen.
 */
export function selectBulkBatch(population: readonly CandidateFacts[]): BulkSelection {
  const first = population.map(classifyCandidate);
  const facts = new Map(population.map((f) => [f.candidateId, f]));
  const eligible = first.filter((c) => c.bucket === "AUTO_BATCH_ELIGIBLE");

  const groups = (key: (c: Classification) => string) => {
    const m = new Map<string, Classification[]>();
    for (const c of eligible) m.set(key(c), [...(m.get(key(c)) ?? []), c]);
    return [...m.values()].filter((g) => g.length > 1);
  };
  const dupTargets = groups((c) => c.targetAppPlayerId ?? "");
  const dupProviderIds = groups(
    (c) => `${facts.get(c.candidateId)!.provider}:${facts.get(c.candidateId)!.externalId}`,
  );
  const dupCandidates = groups((c) => c.candidateId);
  const removed = new Set<string>(
    [...dupTargets, ...dupProviderIds, ...dupCandidates].flat().map((c) => c.candidateId),
  );

  const classifications = first.map((c) =>
    removed.has(c.candidateId)
      ? { ...c, bucket: "CONFLICT" as const, reason: "COLLISION_REMOVED", tier: null }
      : c,
  );
  const counts = Object.fromEntries(BULK_BUCKETS.map((b) => [b, 0])) as Record<BulkBucket, number>;
  for (const c of classifications) counts[c.bucket] += 1;
  return {
    classifications,
    eligible: classifications
      .filter((c) => c.bucket === "AUTO_BATCH_ELIGIBLE")
      .map((c) => {
        const f = facts.get(c.candidateId)!;
        return {
          ...c,
          externalId: f.externalId,
          appTeamId: f.appTeamId!,
          evidenceRevision: f.evidenceRevision,
        };
      }),
    counts,
    collisions: {
      duplicateTargets: dupTargets.length,
      duplicateProviderIds: dupProviderIds.length,
      duplicateCandidates: dupCandidates.length,
      rowsRemoved: removed.size,
    },
  };
}
