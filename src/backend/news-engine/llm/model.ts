// The language-model boundary.
//
// Every model call in the engine goes through `NewsLanguageModel`, which
// returns schema-validated JSON or throws. Two things depend on that:
// the pipeline never has to parse free text, and tests can inject a
// deterministic model so extraction, generation and the gates are all
// testable without a network call or an API key.

import type { z } from "zod";

import { NewsEngineError } from "../contracts";

export interface StructuredRequest<TSchema extends z.ZodType> {
  /** Stable across calls of the same kind, so it caches well. */
  readonly system: string;
  readonly user: string;
  readonly schema: TSchema;
  /** Short label for the schema; used in prompts and error messages. */
  readonly schemaName: string;
  readonly maxTokens?: number;
  readonly effort?: "low" | "medium" | "high";
}

export interface StructuredResult<T> {
  readonly value: T;
  readonly model: string;
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cachedInputTokens: number;
}

export interface NewsLanguageModel {
  readonly name: string;
  complete<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<StructuredResult<z.infer<TSchema>>>;
}

/** Default model for the engine; override with `NEWS_ENGINE_MODEL`. */
export const DEFAULT_NEWS_ENGINE_MODEL = "claude-opus-5";

export class ModelRefusalError extends NewsEngineError {
  constructor(readonly category: string | null) {
    super("news_engine_model_refusal", "The model declined to produce this output.", false);
    this.name = "ModelRefusalError";
  }
}

export class ModelOutputError extends NewsEngineError {
  constructor(message: string, cause?: unknown) {
    super("news_engine_model_output_invalid", message, true, cause);
    this.name = "ModelOutputError";
  }
}
