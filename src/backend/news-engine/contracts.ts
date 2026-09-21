// Shared types for the BotolaGO News Engine.
//
// The engine is a sequence of stages joined by a persistence gateway. Each
// stage takes a typed input, produces a typed output, and records its result
// through the gateway. Nothing in here imports Fantasy, and nothing in Fantasy
// imports this: the engine can be offline without affecting it.

export const NEWS_ENGINE_LANGUAGES = ["ar", "fr"] as const;
export type NewsEngineLanguage = (typeof NEWS_ENGINE_LANGUAGES)[number];

export const NEWS_SOURCE_LANGUAGES = ["ar", "fr", "en", "es"] as const;
export type NewsSourceLanguage = (typeof NEWS_SOURCE_LANGUAGES)[number];

export const PIPELINE_STAGES = [
  "discovery",
  "fetch",
  "parse",
  "relevance",
  "extraction",
  "entities",
  "clustering",
  "generation",
  "validation",
  "publication",
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const FAILURE_CODES = [
  "DISCOVERY_FAILED",
  "FETCH_FAILED",
  "PARSE_FAILED",
  "IRRELEVANT",
  "ENTITY_UNRESOLVED",
  "FACT_CONFLICT",
  "GENERATION_FAILED",
  "SIMILARITY_TOO_HIGH",
  "MEDIA_FAILED",
  "PUBLICATION_FAILED",
  "VALIDATION_FAILED",
] as const;
export type FailureCode = (typeof FAILURE_CODES)[number];

export const CLAIM_STATUSES = ["official", "confirmed", "reported", "rumour", "disputed"] as const;
export type ClaimStatus = (typeof CLAIM_STATUSES)[number];

/** Ranked weakest to strongest; cluster claim strength only ratchets up. */
export const CLAIM_STATUS_RANK: Readonly<Record<ClaimStatus, number>> = {
  rumour: 0,
  disputed: 1,
  reported: 2,
  confirmed: 3,
  official: 4,
};

export const ITEM_STATUSES = [
  "discovered",
  "fetched",
  "parsed",
  "irrelevant",
  "extracted",
  "clustered",
  "generated",
  "validated",
  "ready",
  "published",
  "rejected",
  "failed",
] as const;
export type ItemStatus = (typeof ITEM_STATUSES)[number];

export type QualityVerdict = "passed" | "needs_review" | "needs_regeneration" | "rejected";

export type RunStatus = "succeeded" | "partially_succeeded" | "failed" | "cancelled";

export type DiscoveryMethod = "news_sitemap" | "sitemap" | "rss" | "api" | "html_listing";

export interface SourceConfiguration {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly hostname: string;
  readonly publisherId: string | null;
  readonly sourceKind: string;
  readonly languages: readonly NewsSourceLanguage[];
  readonly discoveryMethod: DiscoveryMethod;
  readonly discoveryUrl: string;
  readonly articleUrlPattern: string;
  readonly allowedMediaHosts: readonly string[];
  readonly priority: number;
  readonly pollIntervalSeconds: number;
  readonly rateLimitPerMinute: number;
  readonly maxConcurrency: number;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly parserVersion: string;
  /** Database half of the two-key gate on reading article pages. */
  readonly articleFetchApproved: boolean;
  readonly respectRobots: boolean;
  readonly config: Readonly<Record<string, unknown>>;
}

export interface DiscoveryState {
  readonly lastSeenItemKey: string | null;
  readonly lastSeenPublishedAt: string | null;
  readonly lastSuccessfulDiscoveryAt: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly consecutiveFailures: number;
}

export interface SourceClaim {
  readonly source: SourceConfiguration;
  readonly discovery: DiscoveryState;
}

/** One article found in a listing, before anything has been fetched. */
export interface DiscoveredItem {
  readonly sourceArticleId: string;
  readonly sourceUrl: string;
  readonly urlHash: string;
  readonly sourceLanguage: NewsSourceLanguage;
  readonly sourceTitle: string | null;
  readonly sourcePublishedAt: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
}

export interface DiscoveryResult {
  readonly items: readonly DiscoveredItem[];
  readonly lastSeenItemKey: string | null;
  readonly lastSeenPublishedAt: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  /** True when the listing answered 304 and nothing needed re-reading. */
  readonly notModified: boolean;
}

/** A queued item as the gateway hands it to a worker stage. */
export interface PendingItem {
  readonly id: string;
  readonly sourceId: string;
  readonly sourceSlug: string;
  readonly sourceName: string;
  readonly sourceArticleId: string;
  readonly sourceUrl: string;
  readonly sourceLanguage: NewsSourceLanguage;
  readonly sourceTitle: string | null;
  readonly sourcePublishedAt: string | null;
  readonly sourceUpdatedAt: string | null;
  readonly contentHash: string | null;
  readonly etag: string | null;
  readonly lastModified: string | null;
  readonly metadata: Readonly<Record<string, unknown>>;
  readonly attemptCount: number;
  readonly clusterId: string | null;
  readonly articleFetchApproved: boolean;
  readonly parserVersion: string;
  readonly requestTimeoutMs: number;
  readonly maxRetries: number;
  readonly rateLimitPerMinute: number;
  readonly allowedMediaHosts: readonly string[];
  readonly text: string | null;
}

export interface ParsedArticle {
  readonly title: string | null;
  readonly text: string;
  readonly publishedAt: string | null;
  readonly updatedAt: string | null;
  readonly authorName: string | null;
  readonly section: string | null;
  readonly declaredHeroUrl: string | null;
  readonly language: NewsSourceLanguage | null;
  /** Which parsing route produced this, for parser-quality triage. */
  readonly parseSource: "json_ld" | "open_graph" | "html";
}

export interface RelevanceDecision {
  readonly relevant: boolean;
  readonly score: number;
  readonly reason: string;
  readonly matchedSignals: readonly string[];
}

export interface ExtractedClaim {
  readonly text: string;
  readonly status: ClaimStatus;
  readonly confidence?: number;
}

export interface ExtractedQuote {
  readonly speaker: string;
  readonly text: string;
  readonly attribution?: string | null;
}

export interface EntityMention {
  readonly kind: "team" | "player" | "competition" | "coach";
  readonly mention: string;
  readonly language?: NewsSourceLanguage | null;
}

export interface ExtractedFacts {
  readonly eventType: string;
  readonly eventDate: string | null;
  readonly competitionMention: string | null;
  readonly teamMentions: readonly string[];
  readonly playerMentions: readonly string[];
  readonly score: { readonly home: number; readonly away: number } | null;
  readonly claims: readonly ExtractedClaim[];
  readonly quotes: readonly ExtractedQuote[];
  readonly bestClaimStatus: ClaimStatus;
  readonly confidence: number;
}

export interface ResolvedEntities {
  readonly teamIds: readonly string[];
  readonly playerIds: readonly string[];
  readonly competitionId: string | null;
  readonly unresolved: readonly EntityMention[];
}

export interface GeneratedArticle {
  readonly language: NewsEngineLanguage;
  readonly headline: string;
  readonly slug: string;
  readonly excerpt: string;
  readonly bodyHtml: string;
  readonly category: string;
  readonly tags: readonly string[];
  readonly seoTitle: string;
  readonly metaDescription: string;
  readonly openGraphTitle: string;
  readonly openGraphDescription: string;
}

export interface SimilarityReport {
  readonly maxScore: number;
  readonly perSource: ReadonlyArray<{
    readonly itemId: string;
    readonly trigramOverlap: number;
    readonly fiveGramOverlap: number;
    readonly longestSharedRun: number;
    readonly sentenceMatches: number;
  }>;
  readonly verdict: QualityVerdict;
  readonly reason: string;
}

export interface FactualReport {
  readonly verdict: QualityVerdict;
  readonly reason: string;
  readonly violations: readonly string[];
}

export interface RunCounters {
  discovered: number;
  fetched: number;
  relevant: number;
  duplicates: number;
  extracted: number;
  clustered: number;
  generated: number;
  published: number;
  review: number;
  rejected: number;
  failed: number;
}

export function emptyCounters(): RunCounters {
  return {
    discovered: 0,
    fetched: 0,
    relevant: 0,
    duplicates: 0,
    extracted: 0,
    clustered: 0,
    generated: 0,
    published: 0,
    review: 0,
    rejected: 0,
    failed: 0,
  };
}

/** Errors the engine raises. `code` is stable and safe to log. */
export class NewsEngineError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly retryable = false,
    readonly cause?: unknown,
  ) {
    super(message, { cause });
    this.name = "NewsEngineError";
  }
}

export function isNewsEngineError(error: unknown): error is NewsEngineError {
  return error instanceof NewsEngineError;
}

/**
 * Sanitises a message before it reaches the failure inbox. The inbox is an
 * operator surface, not a secret store, and the database rejects anything
 * credential-shaped — so strip it here rather than losing the whole record.
 */
export function safeFailureMessage(error: unknown, fallback = "Stage failed."): string {
  const raw = error instanceof Error ? error.message : typeof error === "string" ? error : "";
  const trimmed = raw.trim();
  if (!trimmed) return fallback;
  const redacted = trimmed
    .replace(/sb_secret_[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/sb_publishable_[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/sbp_[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/sk-ant-[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/gu, "[redacted]")
    .replace(/authorization:\s*\S+/giu, "authorization: [redacted]")
    .replace(/bearer\s+\S+/giu, "bearer [redacted]");
  return redacted.slice(0, 1_000);
}
