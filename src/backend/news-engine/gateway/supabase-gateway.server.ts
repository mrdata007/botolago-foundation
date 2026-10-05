// Supabase implementation of the news engine gateway.
//
// Server-only. It holds a service-role key, which bypasses RLS, so two guards
// apply before a client is built:
//   * the key and URL must both be present, and
//   * `assertServerProjectMatchesApplication` must agree that the URL names
//     the same project the application itself runs against.
//
// The second guard exists because a mispointed privileged worker does not
// fail — it writes real articles into a database nobody is reading.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import { assertServerProjectMatchesApplication } from "@/backend/config/supabase-project";
import { NewsEngineError } from "../contracts";
import type {
  ClusterBundle,
  ClusterCandidate,
  EntityResolution,
  NewsEngineGateway,
  PublishArticleInput,
  PublishArticleResult,
  RecordFailureInput,
} from "./contracts";
import type {
  DiscoveredItem,
  ItemStatus,
  PendingItem,
  PipelineStage,
  QualityVerdict,
  RunCounters,
  RunStatus,
  SourceClaim,
} from "../contracts";

type RpcArgs = Record<string, unknown>;

interface RpcClient {
  schema(name: "api"): {
    rpc(name: string, args: RpcArgs): PromiseLike<{ data: unknown; error: unknown }>;
  };
}

function serverClient(): SupabaseClient {
  const url = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new NewsEngineError(
      "news_engine_gateway_unconfigured",
      "SUPABASE_URL and a service-role key are required for the news engine gateway.",
    );
  }
  assertServerProjectMatchesApplication(url);
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}

function errorMessage(error: unknown): string {
  if (error && typeof error === "object") {
    const record = error as { message?: unknown; code?: unknown };
    if (typeof record.message === "string") return record.message;
    if (typeof record.code === "string") return record.code;
  }
  return "unknown_rpc_error";
}

/** Failures the caller can usefully retry rather than quarantine. */
const RETRYABLE_RPC_CODES = new Set([
  "news_engine_source_locked",
  "news_stale_update",
  "40001",
  "55P03",
]);

export class SupabaseNewsEngineGateway implements NewsEngineGateway {
  private readonly client: RpcClient;

  constructor(client?: RpcClient) {
    this.client = client ?? (serverClient() as unknown as RpcClient);
  }

  private async call<T>(name: string, args: RpcArgs): Promise<T> {
    const { data, error } = await this.client.schema("api").rpc(name, args);
    if (error) {
      const message = errorMessage(error);
      throw new NewsEngineError(
        message,
        `News engine RPC ${name} failed.`,
        RETRYABLE_RPC_CODES.has(message),
        error,
      );
    }
    return data as T;
  }

  async beginRun(input: {
    sourceSlug: string | null;
    jobType: string;
    triggerKind: string;
    targetScope?: string;
    dryRun?: boolean;
  }): Promise<string> {
    return this.call<string>("news_engine_begin_run", {
      p_source_slug: input.sourceSlug,
      p_job_type: input.jobType,
      p_trigger_kind: input.triggerKind,
      p_target_scope: input.targetScope ?? "all",
      p_dry_run: input.dryRun ?? false,
    });
  }

  async completeRun(input: {
    runId: string;
    status: RunStatus;
    counters: RunCounters;
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void> {
    await this.call<null>("news_engine_complete_run", {
      p_run_id: input.runId,
      p_status: input.status,
      p_counts: input.counters,
      p_error_code: input.errorCode ?? null,
      p_error_summary: input.errorSummary ?? null,
    });
  }

  async recordStage(input: {
    runId: string;
    stage: PipelineStage;
    status: RunStatus | "running";
    inputCount?: number;
    outputCount?: number;
    failedCount?: number;
    durationMs?: number | null;
    errorCode?: string | null;
    errorSummary?: string | null;
  }): Promise<void> {
    await this.call<null>("news_engine_record_stage", {
      p_run_id: input.runId,
      p_stage: input.stage,
      p_status: input.status,
      p_input_count: input.inputCount ?? 0,
      p_output_count: input.outputCount ?? 0,
      p_failed_count: input.failedCount ?? 0,
      p_duration_ms: input.durationMs ?? null,
      p_error_code: input.errorCode ?? null,
      p_error_summary: input.errorSummary ?? null,
    });
  }

  async claimSource(slug: string, force = false): Promise<SourceClaim> {
    const payload = await this.call<{
      source: Record<string, unknown>;
      discovery: Record<string, unknown>;
    }>("news_engine_claim_source", { p_source_slug: slug, p_force: force });

    const source = payload.source;
    return {
      source: {
        id: String(source.id),
        slug: String(source.slug),
        name: String(source.name),
        hostname: String(source.hostname),
        publisherId: (source.publisherId as string | null) ?? null,
        sourceKind: String(source.sourceKind),
        languages: source.languages as SourceClaim["source"]["languages"],
        discoveryMethod: source.discoveryMethod as SourceClaim["source"]["discoveryMethod"],
        discoveryUrl: String(source.discoveryUrl),
        articleUrlPattern: String(source.articleUrlPattern),
        allowedMediaHosts: (source.allowedMediaHosts as string[] | null) ?? [],
        priority: Number(source.priority),
        pollIntervalSeconds: Number(source.pollIntervalSeconds),
        rateLimitPerMinute: Number(source.rateLimitPerMinute),
        maxConcurrency: Number(source.maxConcurrency),
        requestTimeoutMs: Number(source.requestTimeoutMs),
        maxRetries: Number(source.maxRetries),
        parserVersion: String(source.parserVersion),
        articleFetchApproved: Boolean(source.articleFetchApproved),
        respectRobots: Boolean(source.respectRobots),
        config: (source.config as Record<string, unknown> | null) ?? {},
      },
      discovery: {
        lastSeenItemKey: (payload.discovery.lastSeenItemKey as string | null) ?? null,
        lastSeenPublishedAt: (payload.discovery.lastSeenPublishedAt as string | null) ?? null,
        lastSuccessfulDiscoveryAt:
          (payload.discovery.lastSuccessfulDiscoveryAt as string | null) ?? null,
        etag: (payload.discovery.etag as string | null) ?? null,
        lastModified: (payload.discovery.lastModified as string | null) ?? null,
        consecutiveFailures: Number(payload.discovery.consecutiveFailures ?? 0),
      },
    };
  }

  async recordDiscovery(input: {
    sourceSlug: string;
    items: readonly DiscoveredItem[];
    lastSeenItemKey: string | null;
    lastSeenPublishedAt: string | null;
    etag: string | null;
    lastModified: string | null;
  }): Promise<{ discovered: number; duplicates: number; invalid: number; itemIds: string[] }> {
    const payload = await this.call<{
      discovered: number;
      duplicates: number;
      invalid: number;
      itemIds: string[] | null;
    }>("news_engine_record_discovery", {
      p_source_slug: input.sourceSlug,
      p_items: input.items,
      p_last_seen_item_key: input.lastSeenItemKey,
      p_last_seen_published_at: input.lastSeenPublishedAt,
      p_etag: input.etag,
      p_last_modified: input.lastModified,
    });
    return { ...payload, itemIds: payload.itemIds ?? [] };
  }

  async recordDiscoveryFailure(sourceSlug: string, errorCode: string): Promise<void> {
    await this.call<null>("news_engine_record_discovery_failure", {
      p_source_slug: sourceSlug,
      p_error_code: errorCode,
    });
  }

  async pendingItems(input: {
    status: ItemStatus;
    limit: number;
    sourceSlug?: string | null;
    includeText?: boolean;
    since?: string | null;
    until?: string | null;
  }): Promise<PendingItem[]> {
    const rows = await this.call<PendingItem[] | null>("news_engine_pending_items", {
      p_status: input.status,
      p_limit: input.limit,
      p_source_slug: input.sourceSlug ?? null,
      p_include_text: input.includeText ?? false,
      p_since: input.since ?? null,
      p_until: input.until ?? null,
    });
    return rows ?? [];
  }

  async recordFetch(input: {
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
  }): Promise<{ itemId: string; outcome: "fetched" | "skipped"; contentHash: string }> {
    return this.call("news_engine_record_fetch", {
      p_item_id: input.itemId,
      p_content_hash: input.contentHash,
      p_normalized_text: input.normalizedText,
      p_metadata: input.metadata,
      p_source_title: input.sourceTitle ?? null,
      p_source_published_at: input.sourcePublishedAt ?? null,
      p_source_updated_at: input.sourceUpdatedAt ?? null,
      p_etag: input.etag ?? null,
      p_last_modified: input.lastModified ?? null,
      p_parser_version: input.parserVersion ?? null,
    });
  }

  async recordRelevance(input: {
    itemId: string;
    relevant: boolean;
    score: number;
    reason: string;
  }): Promise<void> {
    await this.call<null>("news_engine_record_relevance", {
      p_item_id: input.itemId,
      p_relevant: input.relevant,
      p_score: input.score,
      p_reason: input.reason,
    });
  }

  async resolveEntities(input: {
    kind: "team" | "player" | "competition" | "coach";
    mentions: readonly string[];
    language?: string | null;
  }): Promise<EntityResolution[]> {
    if (input.mentions.length === 0) return [];
    const rows = await this.call<EntityResolution[] | null>("news_engine_resolve_entities", {
      p_entity_kind: input.kind,
      p_mentions: input.mentions,
      p_language: input.language ?? null,
    });
    return rows ?? [];
  }

  async recordFacts(input: Parameters<NewsEngineGateway["recordFacts"]>[0]): Promise<string> {
    return this.call<string>("news_engine_record_facts", {
      p_item_id: input.itemId,
      p_event_type: input.eventType,
      p_event_date: input.eventDate,
      p_competition_id: input.competitionId,
      p_fixture_id: input.fixtureId,
      p_team_ids: input.teamIds,
      p_player_ids: input.playerIds,
      p_unresolved: input.unresolved,
      p_score: input.score,
      p_claims: input.claims,
      p_quotes: input.quotes,
      p_best_claim_status: input.bestClaimStatus,
      p_extractor_version: input.extractorVersion,
      p_model: input.model ?? null,
      p_confidence: input.confidence ?? null,
    });
  }

  async matchClusters(input: {
    eventType: string;
    eventDate: string | null;
    teamIds: readonly string[];
    playerIds: readonly string[];
    windowDays?: number;
    limit?: number;
  }): Promise<ClusterCandidate[]> {
    const rows = await this.call<ClusterCandidate[] | null>("news_engine_match_clusters", {
      p_event_type: input.eventType,
      p_event_date: input.eventDate,
      p_team_ids: input.teamIds,
      p_player_ids: input.playerIds,
      p_window_days: input.windowDays ?? 5,
      p_limit: input.limit ?? 5,
    });
    return rows ?? [];
  }

  async assignCluster(
    input: Parameters<NewsEngineGateway["assignCluster"]>[0],
  ): Promise<{ clusterId: string; clusterKey: string; created: boolean; storyId: string | null }> {
    return this.call("news_engine_assign_cluster", {
      p_item_id: input.itemId,
      p_cluster_key: input.clusterKey,
      p_event_type: input.eventType,
      p_event_date: input.eventDate,
      p_competition_id: input.competitionId,
      p_team_ids: input.teamIds,
      p_player_ids: input.playerIds,
      p_claim_status: input.claimStatus,
      p_similarity: input.similarity ?? 1,
      p_match_signal: input.matchSignal ?? "entity_event",
    });
  }

  async flagClusterConflict(clusterId: string, summary: string): Promise<void> {
    await this.call<null>("news_engine_flag_cluster_conflict", {
      p_cluster_id: clusterId,
      p_summary: summary,
    });
  }

  async clusterBundle(clusterId: string): Promise<ClusterBundle> {
    return this.call<ClusterBundle>("news_engine_cluster_bundle", { p_cluster_id: clusterId });
  }

  async recordGeneration(
    input: Parameters<NewsEngineGateway["recordGeneration"]>[0],
  ): Promise<{ attemptId: string; attemptNumber: number; verdict: QualityVerdict }> {
    return this.call("news_engine_record_generation", {
      p_cluster_id: input.clusterId,
      p_language: input.language,
      p_model: input.model,
      p_prompt_version: input.promptVersion,
      p_draft: input.draft,
      p_similarity_score: input.similarityScore,
      p_similarity_detail: input.similarityDetail,
      p_factual_verdict: input.factualVerdict,
      p_originality_verdict: input.originalityVerdict,
      p_verdict: input.verdict,
      p_verdict_reason: input.verdictReason ?? null,
    });
  }

  async resolveHeroAsset(input: {
    teamIds: readonly string[];
    playerIds: readonly string[];
    competitionId: string | null;
  }): Promise<{ assetId: string | null; origin: string }> {
    return this.call("news_engine_resolve_hero_asset", {
      p_team_ids: input.teamIds,
      p_player_ids: input.playerIds,
      p_competition_id: input.competitionId,
    });
  }

  async publishArticle(input: PublishArticleInput): Promise<PublishArticleResult> {
    return this.call<PublishArticleResult>("news_engine_publish_article", {
      p_cluster_id: input.clusterId,
      p_language: input.language,
      p_slug: input.slug,
      p_title: input.title,
      p_subtitle: input.subtitle,
      p_summary: input.summary,
      p_body_html: input.bodyHtml,
      p_reading_time_minutes: input.readingTimeMinutes,
      p_sanitizer_version: input.sanitizerVersion,
      p_seo_title: input.seoTitle,
      p_seo_description: input.seoDescription,
      p_category_slug: input.categorySlug,
      p_tag_slugs: input.tagSlugs,
      p_team_ids: input.teamIds,
      p_player_ids: input.playerIds,
      p_competition_ids: input.competitionIds,
      p_hero_asset_id: input.heroAssetId,
      p_publish: input.publish,
      p_generation_attempt_id: input.generationAttemptId,
    });
  }

  async recordFailure(input: RecordFailureInput): Promise<string> {
    return this.call<string>("news_engine_record_failure", {
      p_stage: input.stage,
      p_failure_code: input.failureCode,
      p_message: input.message,
      p_run_id: input.runId ?? null,
      p_source_slug: input.sourceSlug ?? null,
      p_item_id: input.itemId ?? null,
      p_cluster_id: input.clusterId ?? null,
      p_detail: input.detail ?? {},
      p_retry_after_seconds: input.retryAfterSeconds ?? null,
    });
  }

  async status(windowHours = 24): Promise<Record<string, unknown>> {
    return this.call<Record<string, unknown>>("news_engine_status", {
      p_window_hours: windowHours,
    });
  }
}
