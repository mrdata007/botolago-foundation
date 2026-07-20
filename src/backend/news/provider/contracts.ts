import type { z } from "zod";
import type { normalizedNewsArticleSchema } from "./schemas";

export interface NewsProviderPageRequest {
  readonly cursor?: string | null;
  readonly limit: number;
  readonly since?: string | null;
}

export interface NewsProviderQuota {
  readonly limit: number | null;
  readonly remaining: number | null;
  readonly resetsAt: string | null;
}

export interface NewsProviderPage<T> {
  readonly items: readonly T[];
  readonly nextCursor: string | null;
  readonly quota: NewsProviderQuota;
  readonly fetchedAt: string;
}

export type NormalizedNewsArticle = z.infer<typeof normalizedNewsArticleSchema>;

export interface NewsProvider<TRaw = unknown> {
  readonly name: string;
  fetchArticles(
    request: NewsProviderPageRequest,
    signal: AbortSignal,
  ): Promise<NewsProviderPage<TRaw>>;
  normalize(payload: TRaw): NormalizedNewsArticle;
}

export type NewsProviderErrorCode =
  | "provider_unavailable"
  | "provider_rate_limited"
  | "provider_timeout"
  | "invalid_provider_payload";

export class NewsProviderError extends Error {
  constructor(
    readonly code: NewsProviderErrorCode,
    message: string,
    readonly retryable: boolean,
    readonly retryAfterMs: number | null = null,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NewsProviderError";
  }
}
