// Story clustering.
//
// One real-world event, however many outlets report it. The cluster is what a
// BotolaGO story is written from, so getting this wrong either splits one
// signing into three articles or merges two different transfers into one.
//
// Two mechanisms, in order:
//   1. A deterministic cluster key from (event type, resolved entities, date).
//      Identical events produce an identical key, which makes re-imports
//      idempotent without any similarity maths.
//   2. Candidate matching against existing clusters for the cases the key
//      cannot catch — a later article that resolves one more player, or an
//      event date that only the second source states.

import {
  CLAIM_STATUS_RANK,
  type ClaimStatus,
  type ExtractedFacts,
  type ResolvedEntities,
} from "../contracts";
import { clusterKey } from "../normalization/hashing";
import type { ClusterCandidate, NewsEngineGateway } from "../gateway/contracts";

/** Event types that describe the same underlying story as it firms up. */
const EQUIVALENT_EVENT_TYPES: ReadonlyArray<readonly string[]> = [
  ["transfer_rumour", "official_signing", "contract_renewal"],
  ["injury", "suspension"],
  ["fixture_announcement", "preview"],
];

/**
 * The key's event type. A signing that was a rumour this morning and is
 * official this evening must share a cluster, so the whole equivalence group
 * collapses to its first member.
 */
export function canonicalEventType(eventType: string): string {
  for (const group of EQUIVALENT_EVENT_TYPES) {
    if (group.includes(eventType)) return group[0] as string;
  }
  return eventType;
}

export interface ClusterDecision {
  readonly clusterKey: string;
  readonly eventType: string;
  readonly eventDate: string | null;
  readonly similarity: number;
  readonly matchSignal: string;
  readonly matchedCandidate: ClusterCandidate | null;
}

/** How much entity overlap makes two reports the same event. */
export const CANDIDATE_MATCH_THRESHOLD = 2;

export function scoreCandidate(
  candidate: ClusterCandidate,
  entities: Pick<ResolvedEntities, "teamIds" | "playerIds">,
): number {
  const totalEntities = entities.teamIds.length + entities.playerIds.length;
  if (totalEntities === 0) return 0;
  // Players identify an event far more precisely than clubs: two clubs in
  // common is a fixture, one player in common is usually one story.
  const weighted = candidate.sharedPlayers * 2 + candidate.sharedTeams;
  const maximum = entities.playerIds.length * 2 + entities.teamIds.length;
  return maximum === 0 ? 0 : Math.min(1, weighted / maximum);
}

/**
 * Decides which cluster an item belongs to.
 *
 * The deterministic key is computed first and always returned; a candidate
 * match only overrides it when the overlap is strong enough, so the default
 * behaviour is "start a new cluster" rather than "merge on a hunch".
 */
export async function decideCluster(
  gateway: NewsEngineGateway,
  facts: ExtractedFacts,
  entities: ResolvedEntities,
  fallbackMentions: readonly string[] = [],
): Promise<ClusterDecision> {
  const eventType = canonicalEventType(facts.eventType);
  const deterministicKey = clusterKey({
    eventType,
    teamIds: entities.teamIds,
    playerIds: entities.playerIds,
    eventDate: facts.eventDate,
    fallbackMentions,
  });

  // With no resolved entity there is nothing to match against; the key's
  // mention fallback is the only grouping available.
  if (entities.teamIds.length + entities.playerIds.length === 0) {
    return {
      clusterKey: deterministicKey,
      eventType,
      eventDate: facts.eventDate,
      similarity: 1,
      matchSignal: "deterministic_key",
      matchedCandidate: null,
    };
  }

  const candidates = await gateway.matchClusters({
    eventType,
    eventDate: facts.eventDate,
    teamIds: entities.teamIds,
    playerIds: entities.playerIds,
    windowDays: 5,
    limit: 5,
  });

  let best: ClusterCandidate | null = null;
  let bestScore = 0;
  for (const candidate of candidates) {
    if (candidate.clusterKey === deterministicKey) {
      // Exact key match: no scoring needed, this is the same event.
      return {
        clusterKey: deterministicKey,
        eventType,
        eventDate: facts.eventDate,
        similarity: 1,
        matchSignal: "deterministic_key",
        matchedCandidate: candidate,
      };
    }
    const weighted = candidate.sharedPlayers * 2 + candidate.sharedTeams;
    if (weighted < CANDIDATE_MATCH_THRESHOLD) continue;
    const score = scoreCandidate(candidate, entities);
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  // Only join an existing cluster when the overlap is substantial. A single
  // shared club between two unrelated club stories must not merge them.
  if (best && bestScore >= 0.5) {
    return {
      clusterKey: best.clusterKey,
      eventType,
      eventDate: facts.eventDate ?? best.eventDate,
      similarity: bestScore,
      matchSignal: best.sharedPlayers > 0 ? "shared_player_event" : "shared_team_event",
      matchedCandidate: best,
    };
  }

  return {
    clusterKey: deterministicKey,
    eventType,
    eventDate: facts.eventDate,
    similarity: 1,
    matchSignal: "deterministic_key",
    matchedCandidate: null,
  };
}

/**
 * Detects a factual conflict inside a cluster: two sources stating different
 * final scores for the same match, or one source disputing what another
 * reports as official.
 *
 * Returns a human-readable summary, or null when the cluster is consistent.
 * It never picks a winner — a conflict is flagged for a person, not resolved
 * by the pipeline.
 */
export function detectConflict(
  items: ReadonlyArray<{
    readonly sourceName: string;
    readonly facts: {
      readonly score: { readonly home: number; readonly away: number } | null;
      readonly bestClaimStatus: ClaimStatus;
      readonly eventDate: string | null;
    } | null;
  }>,
): string | null {
  const scored = items.filter(
    (item): item is typeof item & { facts: { score: { home: number; away: number } } } =>
      Boolean(item.facts?.score),
  );
  const distinctScores = new Set(
    scored.map((item) => `${item.facts.score.home}-${item.facts.score.away}`),
  );
  if (distinctScores.size > 1) {
    const rendered = scored
      .map((item) => `${item.sourceName}: ${item.facts.score.home}-${item.facts.score.away}`)
      .join("; ");
    return `Sources disagree on the final score (${rendered}).`;
  }

  const dated = items
    .map((item) => item.facts?.eventDate)
    .filter((date): date is string => Boolean(date));
  const distinctDates = new Set(dated);
  if (distinctDates.size > 1) {
    return `Sources disagree on the event date (${[...distinctDates].join("; ")}).`;
  }

  const disputed = items.some((item) => item.facts?.bestClaimStatus === "disputed");
  const official = items.some((item) => item.facts?.bestClaimStatus === "official");
  if (disputed && official) {
    return "One source reports this as official while another records a denial or dispute.";
  }

  return null;
}

/** Strongest claim status across a cluster's items. */
export function clusterClaimStatus(
  items: ReadonlyArray<{ readonly facts: { readonly bestClaimStatus: ClaimStatus } | null }>,
): ClaimStatus {
  let best: ClaimStatus = "rumour";
  for (const item of items) {
    const status = item.facts?.bestClaimStatus;
    if (status && CLAIM_STATUS_RANK[status] > CLAIM_STATUS_RANK[best]) best = status;
  }
  return best;
}
