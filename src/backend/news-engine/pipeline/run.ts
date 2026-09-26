// The pipeline.
//
// One pass runs the stages in order, and each stage processes a bounded batch
// with per-item failure isolation. The rules that matter:
//
//   * one broken article never ends a batch — it is recorded in the failure
//     inbox and the batch continues;
//   * one broken source never ends the run — the other sources still run;
//   * every stage records its counts and duration, so diagnosis does not
//     require production logs;
//   * a dry run performs every read and every model call but no write that
//     would create public content.

import {
  emptyCounters,
  type ExtractedFacts,
  type ItemStatus,
  type NewsEngineLanguage,
  NewsEngineError,
  type PendingItem,
  type PipelineStage,
  type ResolvedEntities,
  type RunCounters,
  type RunStatus,
  safeFailureMessage,
  type SourceClaim,
} from "../contracts";
import { discoverSource } from "../discovery/discover";
import { resolveEntities } from "../entities/resolve";
import { EXTRACTOR_VERSION, extractFacts } from "../extraction/facts";
import { NewsHttpClient } from "../fetch/http";
import { isAllowed, type RobotsCache, RobotsCache as RobotsCacheClass } from "../fetch/robots";
import { composeArticle, PROMPT_VERSION } from "../generation/compose";
import type { ClusterBundle, NewsEngineGateway } from "../gateway/contracts";
import type { NewsLanguageModel } from "../llm/model";
import { contentHash } from "../normalization/hashing";
import { parseArticle } from "../parsing/article";
import { scoreRelevance } from "../relevance/filter";
import { assessFactualQuality, combineVerdicts } from "../validation/factual";
import { assessOriginality } from "../validation/similarity";
import { clusterClaimStatus, decideCluster, detectConflict } from "../clustering/cluster";
import {
  calculateReadingTime,
  NEWS_SANITIZER_VERSION,
  sanitizeEditorialHtml,
} from "@/backend/news/sanitizer";

export interface PipelineLogger {
  (event: string, context: Record<string, string | number | boolean | null>): void;
}

export interface PipelineOptions {
  readonly sourceSlug: string;
  readonly jobType: string;
  readonly triggerKind: "manual" | "schedule" | "reconciliation" | "backfill" | "retry";
  readonly limit: number;
  readonly languages: readonly NewsEngineLanguage[];
  readonly dryRun: boolean;
  /** Stop after generation and leave everything for review. */
  readonly reviewOnly: boolean;
  /** Allow auto-publish where the publication policy permits it. */
  readonly allowPublish: boolean;
  readonly since?: string | null;
  readonly until?: string | null;
  readonly force?: boolean;
  readonly maxRegenerationAttempts?: number;
  readonly log?: PipelineLogger;
}

export interface PipelineDependencies {
  readonly gateway: NewsEngineGateway;
  readonly model: NewsLanguageModel;
  readonly http?: NewsHttpClient;
  readonly robots?: RobotsCache;
  readonly now?: () => Date;
}

export interface PipelineReport {
  readonly runId: string | null;
  readonly status: RunStatus;
  readonly counters: RunCounters;
  readonly publishedArticles: ReadonlyArray<{
    readonly clusterId: string;
    readonly language: NewsEngineLanguage;
    readonly articleId: string;
    readonly slug: string;
    readonly published: boolean;
  }>;
  readonly failures: ReadonlyArray<{ readonly stage: PipelineStage; readonly code: string }>;
}

const noopLog: PipelineLogger = () => undefined;

/**
 * A dry run's work queue.
 *
 * A dry run writes nothing, so it cannot read its own queue back from the
 * database the way a real run does. Without somewhere to hold the work, every
 * stage after discovery would find an empty queue and a dry run would exercise
 * only the crawler — which is exactly the part that needs verifying least.
 * Holding the batch here lets a dry run run the whole pipeline, model calls
 * and quality gates included, and still touch nothing.
 */
type QueuedItem = PendingItem & { readonly status: ItemStatus };

interface DryRunState {
  items: QueuedItem[];
  facts: Map<string, { facts: ExtractedFacts; entities: ResolvedEntities }>;
  clusters: Map<string, string[]>;
}

interface StageContext {
  readonly gateway: NewsEngineGateway;
  readonly model: NewsLanguageModel;
  readonly http: NewsHttpClient;
  readonly robots: RobotsCache;
  readonly options: PipelineOptions;
  readonly runId: string | null;
  readonly counters: RunCounters;
  readonly log: PipelineLogger;
  readonly failures: Array<{ stage: PipelineStage; code: string }>;
  readonly now: () => Date;
  readonly dry: DryRunState;
}

/** Reads the queue for a stage: from the database, or from memory in a dry run. */
async function loadItems(
  context: StageContext,
  status: ItemStatus,
  claim: SourceClaim,
  includeText = false,
): Promise<PendingItem[]> {
  if (context.options.dryRun) {
    return context.dry.items
      .filter((item) => item.status === status)
      .slice(0, context.options.limit);
  }
  return context.gateway.pendingItems({
    status,
    limit: context.options.limit,
    sourceSlug: claim.source.slug,
    includeText,
    since: context.options.since ?? null,
    until: context.options.until ?? null,
  });
}

function setDryStatus(context: StageContext, itemId: string, patch: Partial<QueuedItem>): void {
  const index = context.dry.items.findIndex((item) => item.id === itemId);
  if (index === -1) return;
  context.dry.items[index] = { ...(context.dry.items[index] as QueuedItem), ...patch };
}

async function recordFailure(
  context: StageContext,
  stage: PipelineStage,
  code: Parameters<NewsEngineGateway["recordFailure"]>[0]["failureCode"],
  error: unknown,
  target: { itemId?: string | null; clusterId?: string | null } = {},
): Promise<void> {
  context.counters.failed += 1;
  context.failures.push({ stage, code });
  const message = safeFailureMessage(error, `${stage} failed.`);
  context.log("news_engine_stage_failure", {
    stage,
    code,
    itemId: target.itemId ?? null,
    clusterId: target.clusterId ?? null,
    message,
  });
  if (context.options.dryRun) return;
  try {
    await context.gateway.recordFailure({
      stage,
      failureCode: code,
      message,
      runId: context.runId,
      sourceSlug: context.options.sourceSlug,
      itemId: target.itemId ?? null,
      clusterId: target.clusterId ?? null,
      detail: {
        errorCode: error instanceof NewsEngineError ? error.code : "unknown",
        retryable: error instanceof NewsEngineError ? error.retryable : false,
      },
    });
  } catch (failureError) {
    // The inbox itself failing must not take the run down.
    context.log("news_engine_failure_record_failed", {
      stage,
      message: safeFailureMessage(failureError),
    });
  }
}

async function withStage<T>(
  context: StageContext,
  stage: PipelineStage,
  inputCount: number,
  body: () => Promise<{ output: number; failed: number; value: T }>,
): Promise<T | null> {
  const startedAt = Date.now();
  try {
    const result = await body();
    if (context.runId && !context.options.dryRun) {
      await context.gateway.recordStage({
        runId: context.runId,
        stage,
        status: result.failed > 0 ? "partially_succeeded" : "succeeded",
        inputCount,
        outputCount: result.output,
        failedCount: result.failed,
        durationMs: Date.now() - startedAt,
      });
    }
    context.log("news_engine_stage_complete", {
      stage,
      input: inputCount,
      output: result.output,
      failed: result.failed,
      durationMs: Date.now() - startedAt,
    });
    return result.value;
  } catch (error) {
    if (context.runId && !context.options.dryRun) {
      await context.gateway.recordStage({
        runId: context.runId,
        stage,
        status: "failed",
        inputCount,
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof NewsEngineError ? error.code : "unknown",
        errorSummary: safeFailureMessage(error),
      });
    }
    throw error;
  }
}

async function runDiscovery(context: StageContext, claim: SourceClaim): Promise<void> {
  await withStage(context, "discovery", 1, async () => {
    try {
      const result = await discoverSource(
        claim.source,
        claim.discovery,
        { http: context.http, robots: context.robots },
        {
          maxItems: context.options.limit * 3,
          since: context.options.since ?? null,
          until: context.options.until ?? null,
          now: context.now,
        },
      );

      if (context.options.dryRun) {
        // Queue the batch in memory so the rest of the pipeline still runs.
        context.dry.items = result.items.slice(0, context.options.limit).map((item) => ({
          id: `dry:${item.urlHash.slice(0, 16)}`,
          sourceId: claim.source.id,
          sourceSlug: claim.source.slug,
          sourceName: claim.source.name,
          sourceArticleId: item.sourceArticleId,
          sourceUrl: item.sourceUrl,
          sourceLanguage: item.sourceLanguage,
          sourceTitle: item.sourceTitle,
          sourcePublishedAt: item.sourcePublishedAt,
          sourceUpdatedAt: item.sourceUpdatedAt,
          contentHash: null,
          etag: null,
          lastModified: null,
          metadata: item.metadata,
          attemptCount: 0,
          clusterId: null,
          articleFetchApproved: claim.source.articleFetchApproved,
          parserVersion: claim.source.parserVersion,
          requestTimeoutMs: claim.source.requestTimeoutMs,
          maxRetries: claim.source.maxRetries,
          rateLimitPerMinute: claim.source.rateLimitPerMinute,
          allowedMediaHosts: claim.source.allowedMediaHosts,
          text: null,
          status: "discovered",
        }));
        context.counters.discovered += result.items.length;
        return { output: result.items.length, failed: 0, value: undefined };
      }

      const recorded = await context.gateway.recordDiscovery({
        sourceSlug: claim.source.slug,
        items: result.items,
        lastSeenItemKey: result.lastSeenItemKey,
        lastSeenPublishedAt: result.lastSeenPublishedAt,
        etag: result.etag,
        lastModified: result.lastModified,
      });
      context.counters.discovered += recorded.discovered;
      context.counters.duplicates += recorded.duplicates;
      return { output: recorded.discovered, failed: 0, value: undefined };
    } catch (error) {
      if (!context.options.dryRun) {
        await context.gateway.recordDiscoveryFailure(
          claim.source.slug,
          error instanceof NewsEngineError ? error.code.slice(0, 80) : "discovery_failed",
        );
      }
      await recordFailure(context, "discovery", "DISCOVERY_FAILED", error);
      return { output: 0, failed: 1, value: undefined };
    }
  });
}

async function runFetchAndParse(context: StageContext, claim: SourceClaim): Promise<void> {
  const items = await loadItems(context, "discovered", claim);
  if (items.length === 0) return;

  // Reading an article page needs both the stored approval and the runtime
  // approval. Either one being off stops the stage; neither can be inferred.
  if (!claim.source.articleFetchApproved) {
    throw new NewsEngineError(
      "news_engine_article_fetch_not_approved",
      "Article-page reading is not approved for this source.",
    );
  }

  const robotsPolicy = claim.source.respectRobots
    ? await context.robots.policyFor(claim.source.hostname, claim.source.requestTimeoutMs)
    : null;
  const limiter = context.http.limiterFor(claim.source.hostname, claim.source.rateLimitPerMinute);

  await withStage(context, "fetch", items.length, async () => {
    let output = 0;
    let failed = 0;

    for (const item of items) {
      try {
        if (robotsPolicy && !isAllowed(robotsPolicy, item.sourceUrl)) {
          throw new NewsEngineError(
            "news_engine_article_disallowed",
            "robots.txt disallows this article path.",
          );
        }

        await limiter.acquire();
        const response = await context.http.request({
          url: item.sourceUrl,
          expectedHostname: claim.source.hostname,
          timeoutMs: item.requestTimeoutMs,
          maxRetries: item.maxRetries,
          etag: item.etag,
          lastModified: item.lastModified,
          userAgent: (claim.source.config.userAgent as string | undefined) ?? undefined,
        });

        if (response.notModified) {
          context.counters.duplicates += 1;
          continue;
        }

        const parsed = parseArticle(response.body, item.sourceUrl, {
          fallbackLanguage: item.sourceLanguage,
        });
        const hash = contentHash({ title: parsed.title, text: parsed.text });

        if (context.options.dryRun) {
          setDryStatus(context, item.id, {
            status: "fetched",
            text: parsed.text,
            contentHash: hash,
            sourceTitle: parsed.title ?? item.sourceTitle,
            sourcePublishedAt: parsed.publishedAt ?? item.sourcePublishedAt,
          });
          output += 1;
          context.counters.fetched += 1;
          continue;
        }

        const recorded = await context.gateway.recordFetch({
          itemId: item.id,
          contentHash: hash,
          normalizedText: parsed.text,
          metadata: {
            parseSource: parsed.parseSource,
            authorName: parsed.authorName,
            section: parsed.section,
            // Recorded for provenance only. The engine never attaches a
            // publisher's photograph to a BotolaGO article.
            declaredHeroUrl: parsed.declaredHeroUrl,
            declaredLanguage: parsed.language,
          },
          sourceTitle: parsed.title,
          sourcePublishedAt: parsed.publishedAt ?? item.sourcePublishedAt,
          sourceUpdatedAt: parsed.updatedAt ?? item.sourceUpdatedAt,
          etag: response.etag,
          lastModified: response.lastModified,
          parserVersion: item.parserVersion,
        });

        if (recorded.outcome === "skipped") {
          context.counters.duplicates += 1;
        } else {
          context.counters.fetched += 1;
          output += 1;
        }
      } catch (error) {
        failed += 1;
        const code =
          error instanceof NewsEngineError && error.code === "news_engine_parse_empty"
            ? "PARSE_FAILED"
            : "FETCH_FAILED";
        await recordFailure(context, code === "PARSE_FAILED" ? "parse" : "fetch", code, error, {
          itemId: item.id,
        });
      }
    }

    return { output, failed, value: undefined };
  });
}

async function runRelevance(context: StageContext, claim: SourceClaim): Promise<void> {
  const items = await loadItems(context, "fetched", claim, true);
  if (items.length === 0) return;

  await withStage(context, "relevance", items.length, async () => {
    let output = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const decision = scoreRelevance({
          title: item.sourceTitle,
          text: item.text ?? "",
          section: (item.metadata.section as string | undefined) ?? null,
          language: item.sourceLanguage,
        });
        if (context.options.dryRun) {
          setDryStatus(context, item.id, {
            status: decision.relevant ? "parsed" : "irrelevant",
          });
        } else {
          await context.gateway.recordRelevance({
            itemId: item.id,
            relevant: decision.relevant,
            score: decision.score,
            reason: decision.reason,
          });
        }
        if (decision.relevant) {
          context.counters.relevant += 1;
          output += 1;
        } else {
          context.counters.rejected += 1;
        }
      } catch (error) {
        failed += 1;
        await recordFailure(context, "relevance", "IRRELEVANT", error, { itemId: item.id });
      }
    }
    return { output, failed, value: undefined };
  });
}

async function runExtractionAndClustering(
  context: StageContext,
  claim: SourceClaim,
): Promise<Set<string>> {
  const clusterIds = new Set<string>();
  const items = await loadItems(context, "parsed", claim, true);
  if (items.length === 0) return clusterIds;

  await withStage(context, "extraction", items.length, async () => {
    let output = 0;
    let failed = 0;
    for (const item of items) {
      try {
        const clusterId = await extractAndCluster(context, claim, item);
        if (clusterId) {
          clusterIds.add(clusterId);
          output += 1;
        }
      } catch (error) {
        failed += 1;
        const code =
          error instanceof NewsEngineError && error.code.startsWith("news_engine_model")
            ? "GENERATION_FAILED"
            : "FACT_CONFLICT";
        await recordFailure(context, "extraction", code, error, { itemId: item.id });
      }
    }
    return { output, failed, value: undefined };
  });

  return clusterIds;
}

async function extractAndCluster(
  context: StageContext,
  claim: SourceClaim,
  item: PendingItem,
): Promise<string | null> {
  const { facts, model } = await extractFacts(context.model, {
    title: item.sourceTitle,
    text: item.text ?? "",
    language: item.sourceLanguage,
    publishedAt: item.sourcePublishedAt,
    sourceName: item.sourceName,
    sourceKind: claim.source.sourceKind,
  });
  context.counters.extracted += 1;

  const entities = await resolveEntities(context.gateway, {
    teamMentions: facts.teamMentions,
    playerMentions: facts.playerMentions,
    competitionMention: facts.competitionMention,
    language: item.sourceLanguage,
  });

  if (context.options.dryRun) {
    const decision = await decideCluster(context.gateway, facts, entities, [
      ...facts.teamMentions,
      ...facts.playerMentions,
    ]);
    context.dry.facts.set(item.id, { facts, entities });
    const members = context.dry.clusters.get(decision.clusterKey) ?? [];
    members.push(item.id);
    context.dry.clusters.set(decision.clusterKey, members);
    context.counters.clustered += 1;
    context.log("news_engine_dry_run_extract", {
      itemId: item.id,
      eventType: facts.eventType,
      clusterKey: decision.clusterKey,
      teams: entities.teamIds.length,
      players: entities.playerIds.length,
      unresolved: entities.unresolved.length,
      claims: facts.claims.length,
      bestClaimStatus: facts.bestClaimStatus,
    });
    return decision.clusterKey;
  }

  await context.gateway.recordFacts({
    itemId: item.id,
    eventType: facts.eventType,
    eventDate: facts.eventDate,
    competitionId: entities.competitionId,
    fixtureId: null,
    teamIds: entities.teamIds,
    playerIds: entities.playerIds,
    unresolved: entities.unresolved.map((mention) => ({
      kind: mention.kind,
      mention: mention.mention,
      language: mention.language ?? null,
    })),
    score: facts.score,
    claims: facts.claims,
    quotes: facts.quotes,
    bestClaimStatus: facts.bestClaimStatus,
    extractorVersion: EXTRACTOR_VERSION,
    model,
    confidence: facts.confidence,
  });

  const decision = await decideCluster(context.gateway, facts, entities, [
    ...facts.teamMentions,
    ...facts.playerMentions,
  ]);

  const assigned = await context.gateway.assignCluster({
    itemId: item.id,
    clusterKey: decision.clusterKey,
    eventType: decision.eventType,
    eventDate: decision.eventDate,
    competitionId: entities.competitionId,
    teamIds: entities.teamIds,
    playerIds: entities.playerIds,
    claimStatus: facts.bestClaimStatus,
    similarity: decision.similarity,
    matchSignal: decision.matchSignal,
  });
  context.counters.clustered += 1;

  return assigned.clusterId;
}

interface PublishedRecord {
  readonly clusterId: string;
  readonly language: NewsEngineLanguage;
  readonly articleId: string;
  readonly slug: string;
  readonly published: boolean;
}

async function runGenerationAndPublication(
  context: StageContext,
  clusterIds: ReadonlySet<string>,
): Promise<PublishedRecord[]> {
  const published: PublishedRecord[] = [];
  if (clusterIds.size === 0) return published;

  await withStage(context, "generation", clusterIds.size, async () => {
    let output = 0;
    let failed = 0;
    for (const clusterId of clusterIds) {
      try {
        const results = await generateCluster(context, clusterId);
        published.push(...results);
        output += results.length;
      } catch (error) {
        failed += 1;
        await recordFailure(context, "generation", "GENERATION_FAILED", error, { clusterId });
      }
    }
    return { output, failed, value: undefined };
  });

  return published;
}

/**
 * Assembles the generation input for a dry run from what the stages held in
 * memory, so composition and both gates run without the cluster ever existing
 * in the database.
 *
 * Entity names fall back to the source's own mentions: a dry run resolves ids
 * but does not read the catalog's display names, and the generator only needs
 * a name to write.
 */
function buildDryBundle(context: StageContext, clusterKey: string): ClusterBundle {
  const memberIds = context.dry.clusters.get(clusterKey) ?? [];
  const members = memberIds
    .map((id) => ({ id, entry: context.dry.facts.get(id) }))
    .filter((member): member is { id: string; entry: NonNullable<typeof member.entry> } =>
      Boolean(member.entry),
    );
  const first = members[0]?.entry;
  const teams = new Map<string, string>();
  const players = new Map<string, string>();
  for (const member of members) {
    member.entry.facts.teamMentions.forEach((mention, index) => {
      const id = member.entry.entities.teamIds[index];
      if (id) teams.set(id, mention);
    });
    member.entry.facts.playerMentions.forEach((mention, index) => {
      const id = member.entry.entities.playerIds[index];
      if (id) players.set(id, mention);
    });
  }

  return {
    cluster: {
      id: clusterKey,
      clusterKey,
      eventType: first?.facts.eventType ?? "other",
      eventDate: first?.facts.eventDate ?? null,
      status: "clustered",
      storyId: null,
      bestClaimStatus: clusterClaimStatus(
        members.map((member) => ({
          facts: { bestClaimStatus: member.entry.facts.bestClaimStatus },
        })),
      ),
      itemCount: members.length,
      sourceCount: 1,
      hasConflict: false,
      conflictSummary: null,
    },
    competition: null,
    teams: [...teams.entries()].map(([id, name]) => ({
      id,
      slug: id,
      name,
      shortName: name,
      code: null,
      aliases: [],
    })),
    players: [...players.entries()].map(([id, name]) => ({
      id,
      slug: id,
      fullName: name,
      displayName: name,
      position: "unknown",
    })),
    items: members.map((member) => {
      const item = context.dry.items.find((candidate) => candidate.id === member.id);
      return {
        itemId: member.id,
        sourceSlug: item?.sourceSlug ?? context.options.sourceSlug,
        sourceName: item?.sourceName ?? context.options.sourceSlug,
        sourceKind: "publisher",
        sourceUrl: item?.sourceUrl ?? "",
        sourceTitle: item?.sourceTitle ?? null,
        sourceLanguage: item?.sourceLanguage ?? "ar",
        sourcePublishedAt: item?.sourcePublishedAt ?? null,
        sourceText: item?.text ?? null,
        facts: {
          eventType: member.entry.facts.eventType,
          eventDate: member.entry.facts.eventDate,
          score: member.entry.facts.score,
          claims: member.entry.facts.claims,
          quotes: member.entry.facts.quotes,
          unresolved: member.entry.entities.unresolved.map((mention) => ({
            kind: mention.kind,
            mention: mention.mention,
          })),
          bestClaimStatus: member.entry.facts.bestClaimStatus,
          confidence: member.entry.facts.confidence,
        },
      };
    }),
    policy: null,
    attempts: [],
  };
}

async function generateCluster(
  context: StageContext,
  clusterId: string,
): Promise<PublishedRecord[]> {
  const bundle = context.options.dryRun
    ? buildDryBundle(context, clusterId)
    : await context.gateway.clusterBundle(clusterId);
  const results: PublishedRecord[] = [];

  const conflict = detectConflict(
    bundle.items.map((item) => ({ sourceName: item.sourceName, facts: item.facts })),
  );
  if (conflict && !bundle.cluster.hasConflict && !context.options.dryRun) {
    await context.gateway.flagClusterConflict(clusterId, conflict);
  }
  const effectiveBundle: ClusterBundle = conflict
    ? { ...bundle, cluster: { ...bundle.cluster, hasConflict: true, conflictSummary: conflict } }
    : bundle;

  const claimStatus = clusterClaimStatus(bundle.items.map((item) => ({ facts: item.facts })));
  const unresolvedCount = bundle.items.reduce(
    (total, item) => total + (item.facts?.unresolved.length ?? 0),
    0,
  );
  const sources = bundle.items
    .filter((item): item is typeof item & { sourceText: string } => Boolean(item.sourceText))
    .map((item) => ({ itemId: item.itemId, text: item.sourceText }));
  const allowedQuotes = bundle.items.flatMap((item) =>
    (item.facts?.quotes ?? []).map((quote) => quote.text),
  );

  const hero = context.options.dryRun
    ? { assetId: null, origin: "dry_run" }
    : await context.gateway.resolveHeroAsset({
        teamIds: bundle.teams.map((team) => team.id),
        playerIds: bundle.players.map((player) => player.id),
        competitionId: bundle.competition?.id ?? null,
      });

  const maxAttempts = context.options.maxRegenerationAttempts ?? 2;

  for (const language of context.options.languages) {
    let guidance: string | null = null;
    let succeeded = false;

    for (let attempt = 1; attempt <= maxAttempts && !succeeded; attempt += 1) {
      const { article, raw, model } = await composeArticle(context.model, {
        bundle: effectiveBundle,
        language,
        retryGuidance: guidance,
      });
      context.counters.generated += 1;

      // The body is sanitised with the same policy manual editorial content
      // uses, so generated and hand-written articles are identical from the
      // renderer's point of view.
      const sanitizedBody = sanitizeEditorialHtml(article.bodyHtml);
      const originality = assessOriginality(sanitizedBody, sources, { allowedQuotes });
      const factual = assessFactualQuality({
        article: { ...article, bodyHtml: sanitizedBody },
        bestClaimStatus: claimStatus,
        score: bundle.items.find((item) => item.facts?.score)?.facts?.score ?? null,
        eventType: bundle.cluster.eventType,
        knownTeamNames: bundle.teams.map((team) => team.name),
        knownPlayerNames: bundle.players.map((player) => player.displayName),
        hasConflict: Boolean(conflict) || bundle.cluster.hasConflict,
        conflictSummary: conflict ?? bundle.cluster.conflictSummary,
        unresolvedCount,
      });
      const verdict = combineVerdicts(originality.verdict, factual.verdict);

      if (context.options.dryRun) {
        context.log("news_engine_dry_run_generate", {
          clusterId,
          language,
          attempt,
          verdict,
          similarity: Number(originality.maxScore.toFixed(4)),
          originality: originality.verdict,
          factual: factual.verdict,
          headline: article.headline.slice(0, 120),
        });
        succeeded = true;
        continue;
      }

      const recorded = await context.gateway.recordGeneration({
        clusterId,
        language,
        model,
        promptVersion: PROMPT_VERSION,
        draft: { ...raw, sanitized_body_html: sanitizedBody },
        similarityScore: originality.maxScore,
        similarityDetail: {
          perSource: originality.perSource,
          originalityVerdict: originality.verdict,
          factualVerdict: factual.verdict,
          violations: factual.violations,
        },
        factualVerdict: factual.verdict,
        originalityVerdict: originality.verdict,
        verdict,
        verdictReason:
          verdict === "passed" ? originality.reason : `${originality.reason} ${factual.reason}`,
      });

      if (verdict === "needs_regeneration" && attempt < maxAttempts) {
        guidance = `${originality.reason} ${factual.reason} Rewrite the article from the facts in your own structure and wording.`;
        continue;
      }

      if (verdict === "rejected" || verdict === "needs_regeneration") {
        context.counters.rejected += 1;
        await recordFailure(
          context,
          "validation",
          originality.verdict === "needs_regeneration"
            ? "SIMILARITY_TOO_HIGH"
            : "VALIDATION_FAILED",
          new NewsEngineError(
            "news_engine_quality_gate_failed",
            `${originality.reason} ${factual.reason}`,
          ),
          { clusterId },
        );
        succeeded = true;
        continue;
      }

      // Publication policy: auto-publish only where the policy allows it, the
      // claim status is strong enough, and enough independent sources agree.
      const policy = bundle.policy;
      const autoPublishAllowed =
        context.options.allowPublish &&
        !context.options.reviewOnly &&
        verdict === "passed" &&
        Boolean(policy?.autoPublish) &&
        bundle.cluster.sourceCount >= (policy?.minimumSourceCount ?? 1) &&
        claimStatus === "official" &&
        !conflict &&
        unresolvedCount === 0;

      const publishResult = await context.gateway.publishArticle({
        clusterId,
        language,
        slug: article.slug,
        title: article.headline,
        subtitle: null,
        summary: article.excerpt,
        bodyHtml: sanitizedBody,
        readingTimeMinutes: calculateReadingTime(sanitizedBody),
        sanitizerVersion: NEWS_SANITIZER_VERSION,
        seoTitle: article.seoTitle,
        seoDescription: article.metaDescription,
        categorySlug: article.category,
        tagSlugs: article.tags,
        teamIds: bundle.teams.map((team) => team.id),
        playerIds: bundle.players.map((player) => player.id),
        competitionIds: bundle.competition ? [bundle.competition.id] : [],
        heroAssetId: hero.assetId,
        publish: autoPublishAllowed,
        generationAttemptId: recorded.attemptId,
      });

      if (publishResult.published) context.counters.published += 1;
      else context.counters.review += 1;

      results.push({
        clusterId,
        language,
        articleId: publishResult.articleId,
        slug: publishResult.slug,
        published: publishResult.published,
      });
      succeeded = true;
    }
  }

  return results;
}

/**
 * Runs one complete pass for one source.
 *
 * Throws only when the run itself cannot proceed (source missing, disabled,
 * already locked). Everything narrower is isolated and recorded.
 */
export async function runPipeline(
  dependencies: PipelineDependencies,
  options: PipelineOptions,
): Promise<PipelineReport> {
  const log = options.log ?? noopLog;
  const http = dependencies.http ?? new NewsHttpClient();
  const robots = dependencies.robots ?? new RobotsCacheClass(http, "BotolaGO-NewsEngine/1.0");
  const counters = emptyCounters();
  const failures: Array<{ stage: PipelineStage; code: string }> = [];

  const claim = await dependencies.gateway.claimSource(options.sourceSlug, options.force ?? false);

  const runId = options.dryRun
    ? null
    : await dependencies.gateway.beginRun({
        sourceSlug: options.sourceSlug,
        jobType: options.jobType,
        triggerKind: options.triggerKind,
        targetScope: options.languages.join(","),
        dryRun: options.dryRun,
      });

  const context: StageContext = {
    gateway: dependencies.gateway,
    model: dependencies.model,
    http,
    robots,
    options,
    runId,
    counters,
    log,
    failures,
    now: dependencies.now ?? (() => new Date()),
    dry: { items: [], facts: new Map(), clusters: new Map() },
  };

  let status: RunStatus = "succeeded";
  let errorCode: string | null = null;
  let errorSummary: string | null = null;
  let published: PublishedRecord[] = [];

  try {
    await runDiscovery(context, claim);
    await runFetchAndParse(context, claim);
    await runRelevance(context, claim);
    const clusterIds = await runExtractionAndClustering(context, claim);
    published = await runGenerationAndPublication(context, clusterIds);
    if (counters.failed > 0) status = "partially_succeeded";
  } catch (error) {
    status = "failed";
    errorCode = error instanceof NewsEngineError ? error.code.slice(0, 80) : "pipeline_failed";
    errorSummary = safeFailureMessage(error, "Pipeline run failed.");
    log("news_engine_run_failed", { errorCode, errorSummary });
  }

  if (runId) {
    await dependencies.gateway.completeRun({
      runId,
      status,
      counters,
      errorCode,
      errorSummary,
    });
  }

  return { runId, status, counters, publishedArticles: published, failures };
}
