// The persistence boundary.
//
// Every stage writes through this interface and nothing else. That is what
// keeps the pipeline testable without a database, and it is also the security
// boundary: the only implementation talks to service-role-gated `api` RPCs,
// so no stage can reach a table directly even by mistake.

import type {
  ClaimStatus,
  DiscoveredItem,
  FailureCode,
  ItemStatus,
  NewsEngineLanguage,
  PendingItem,
  PipelineStage,
  QualityVerdict,
  RunCounters,
  RunStatus,
  SourceClaim,
} from "../contracts";

export interface EntityResolution {
  readonly mention: string;
  readonly normalized: string;
  readonly entityId: string | null;
  readonly confidence: number | null;
}

export interface ClusterCandidate {
  readonly clusterId: string;
  readonly clusterKey: string;
  readonly eventType: string;
  readonly eventDate: string | null;
  readonly storyId: string | null;
  readonly status: ItemStatus;
  readonly itemCount: number;
  readonly sharedTeams: number;
  readonly sharedPlayers: number;
  readonly score: number;
}

export interface ClusterBundleItem {
  readonly itemId: string;
  readonly sourceSlug: string;
  readonly sourceName: string;
  readonly sourceKind: string;
  readonly sourceUrl: string;
  readonly sourceTitle: string | null;
  readonly sourceLanguage: string;
  readonly sourcePublishedAt: string | null;
  readonly sourceText: string | null;
  readonly facts: {
    readonly eventType: string;
    readonly eventDate: string | null;
    readonly score: { readonly home: number; readonly away: number } | null;
    readonly claims: ReadonlyArray<{
      readonly text: string;
      readonly status: ClaimStatus;
      readonly confidence?: number;
    }>;
    readonly quotes: ReadonlyArray<{
      readonly speaker: string;
      readonly text: string;
      readonly attribution?: string | null;
    }>;
    readonly unresolved: ReadonlyArray<{ readonly kind: string; readonly mention: string }>;
    readonly bestClaimStatus: ClaimStatus;
    readonly confidence: number | null;
  } | null;
}

export interface ClusterBundle {
  readonly cluster: {
    readonly id: string;
    readonly clusterKey: string;
    readonly eventType: string;
    readonly eventDate: string | null;
    readonly status: ItemStatus;
    readonly storyId: string | null;
    readonly bestClaimStatus: ClaimStatus;
    readonly itemCount: number;
    readonly sourceCount: number;
    readonly hasConflict: boolean;
    readonly conflictSummary: string | null;
  };
  readonly competition: {
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly shortName: string | null;
    readonly translations: Readonly<Record<string, string>>;
  } | null;
  readonly teams: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly name: string;
    readonly shortName: string;
    readonly code: string | null;
    readonly aliases: readonly string[];
  }>;
  readonly players: ReadonlyArray<{
    readonly id: string;
    readonly slug: string;
    readonly fullName: string;
    readonly displayName: string;
    readonly position: string;
  }>;
  readonly items: readonly ClusterBundleItem[];
  readonly policy: {
    readonly eventType: string;
    readonly minimumClaimStatus: ClaimStatus;
    readonly minimumSourceCount: number;
    readonly autoPublish: boolean;
    readonly requireResolvedEntities: boolean;
  } | null;
  readonly attempts: ReadonlyArray<{
    readonly id: string;
    readonly language: NewsEngineLanguage;
    readonly attemptNumber: number;
    readonly verdict: QualityVerdict;
    readonly similarityScore: number | null;
    readonly articleEditionId: string | null;
  }>;
}

export interface PublishArticleInput {
  readonly clusterId: string;
  readonly language: NewsEngineLanguage;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly summary: string;
  readonly bodyHtml: string;
  readonly readingTimeMinutes: number;
  readonly sanitizerVersion: string;
  readonly seoTitle: string | null;
  readonly seoDescription: string | null;
  readonly categorySlug: string | null;
  readonly tagSlugs: readonly string[];
  readonly teamIds: readonly string[];
  readonly playerIds: readonly string[];
  readonly competitionIds: readonly string[];
  readonly heroAssetId: string | null;
  readonly publish: boolean;
  readonly generationAttemptId: string | null;
}

export interface PublishArticleResult {
  readonly outcome: "inserted" | "updated";
  readonly storyId: string;
  readonly articleId: string;
  readonly slug: string;
  readonly language: NewsEngineLanguage;
  readonly status: string;
  readonly published: boolean;
  /**
   * True when the call asked to publish and the event type's policy refused.
   * Launch mode ships with every policy off, so a `--publish` run reports this
   * rather than looking like it published when it filed for review instead.
   */
  readonly autoPublishWithheld?: boolean;
}

export interface RecordFailureInput {
  readonly stage: PipelineStage;
  readonly failureCode: FailureCode;
  readonly message: string;
  readonly runId?: string | null;
  readonly sourceSlug?: string | null;
  readonly itemId?: string | null;
  readonly clusterId?: string | null;
  readonly detail?: Readonly<Record<string, unknown>>;
  readonly retryAfterSeconds?: number | null;
}

export interface NewsEngineGateway {
  beginRun(input: {
    sourceSlug: string | null;
    jobType: string;
    triggerKind: string;
    targetScope?: string;
    dryRun?: boolean;
  }): Promise<string>;

  completeRun(input: {
    runId: string;
    status: RunStatus;
    counters: RunCounters;
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void>;

  recordStage(input: {
    runId: string;
    stage: PipelineStage;
    status: RunStatus | "running";
    inputCount?: number;
    outputCount?: number;
    failedCount?: number;
    durationMs?: number | null;
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void>;

  claimSource(slug: string, force?: boolean): Promise<SourceClaim>;

  recordDiscovery(input: {
    sourceSlug: string;
    items: readonly DiscoveredItem[];
    lastSeenItemKey: string | null;
    lastSeenPublishedAt: string | null;
    etag: string | null;
    lastModified: string | null;
  }): Promise<{ discovered: number; duplicates: number; invalid: number; itemIds: string[] }>;

  recordDiscoveryFailure(sourceSlug: string, errorCode: string): Promise<void>;

  pendingItems(input: {
    status: ItemStatus;
    limit: number;
    sourceSlug?: string | null;
    includeText?: boolean;
    since?: string | null;
    until?: string | null;
  }): Promise<PendingItem[]>;

  recordFetch(input: {
    itemId: string;
    contentHash: string;
    normalizedText: string;
    metadata: Readonly<Record<string, unknown>>;
    sourceTitle?: string | null;
    sourcePublishedAt?: string | null;
    sourceUpdatedAt?: string | null;
    etag?: string | null;
    lastModified?: string | null;
    parserVersion?: string | null;
  }): Promise<{ itemId: string; outcome: "fetched" | "skipped"; contentHash: string }>;

  recordRelevance(input: {
    itemId: string;
    relevant: boolean;
    score: number;
    reason: string;
  }): Promise<void>;

  resolveEntities(input: {
    kind: "team" | "player" | "competition" | "coach";
    mentions: readonly string[];
    language?: string | null;
  }): Promise<EntityResolution[]>;

  recordFacts(input: {
    itemId: string;
    eventType: string;
    eventDate: string | null;
    competitionId: string | null;
    fixtureId: string | null;
    teamIds: readonly string[];
    playerIds: readonly string[];
    unresolved: ReadonlyArray<{ kind: string; mention: string; language?: string | null }>;
    score: { home: number; away: number } | null;
    claims: ReadonlyArray<{ text: string; status: ClaimStatus; confidence?: number }>;
    quotes: ReadonlyArray<{ speaker: string; text: string; attribution?: string | null }>;
    bestClaimStatus: ClaimStatus;
    extractorVersion: string;
    model?: string | null;
    confidence?: number | null;
  }): Promise<string>;

  matchClusters(input: {
    eventType: string;
    eventDate: string | null;
    teamIds: readonly string[];
    playerIds: readonly string[];
    windowDays?: number;
    limit?: number;
  }): Promise<ClusterCandidate[]>;

  assignCluster(input: {
    itemId: string;
    clusterKey: string;
    eventType: string;
    eventDate: string | null;
    competitionId: string | null;
    teamIds: readonly string[];
    playerIds: readonly string[];
    claimStatus: ClaimStatus;
    similarity?: number;
    matchSignal?: string;
  }): Promise<{ clusterId: string; clusterKey: string; created: boolean; storyId: string | null }>;

  flagClusterConflict(clusterId: string, summary: string): Promise<void>;

  clusterBundle(clusterId: string): Promise<ClusterBundle>;

  recordGeneration(input: {
    clusterId: string;
    language: NewsEngineLanguage;
    model: string | null;
    promptVersion: string;
    draft: Readonly<Record<string, unknown>>;
    similarityScore: number | null;
    similarityDetail: Readonly<Record<string, unknown>>;
    factualVerdict: QualityVerdict;
    originalityVerdict: QualityVerdict;
    verdict: QualityVerdict;
    verdictReason?: string | null;
  }): Promise<{ attemptId: string; attemptNumber: number; verdict: QualityVerdict }>;

  /**
   * Chooses a hero from BotolaGO-owned catalog media only. Returns a null
   * asset id when nothing suitable exists, which is a valid outcome — the
   * public article then renders BotolaGO's own editorial graphic rather than
   * anyone else's photograph.
   */
  resolveHeroAsset(input: {
    teamIds: readonly string[];
    playerIds: readonly string[];
    competitionId: string | null;
  }): Promise<{ assetId: string | null; origin: string }>;

  publishArticle(input: PublishArticleInput): Promise<PublishArticleResult>;

  recordFailure(input: RecordFailureInput): Promise<string>;

  status(windowHours?: number): Promise<Record<string, unknown>>;
}
