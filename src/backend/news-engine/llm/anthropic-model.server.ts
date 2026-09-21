// Anthropic-backed implementation of `NewsLanguageModel`.
//
// Server-only: it holds the API key, so the filename carries the `.server`
// suffix the lint config requires for modules that must never be bundled for
// the browser.
//
// Choices worth stating:
//   * Structured outputs (`output_config.format`) rather than prompting for
//     JSON. Fact extraction that occasionally returns prose would corrupt the
//     claim-status vocabulary the publication policy depends on.
//   * The system prompt is a stable prefix with a cache breakpoint. Extraction
//     runs once per article, so the instructions are re-sent constantly and
//     caching them is most of the cost.
//   * Streaming, because generated articles can be long and a non-streaming
//     request with a large `max_tokens` risks an HTTP timeout.

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { z } from "zod";

import { NewsEngineError } from "../contracts";
import {
  DEFAULT_NEWS_ENGINE_MODEL,
  ModelOutputError,
  ModelRefusalError,
  type NewsLanguageModel,
  type StructuredRequest,
  type StructuredResult,
} from "./model";

export interface AnthropicModelOptions {
  readonly apiKey?: string;
  readonly model?: string;
  readonly maxRetries?: number;
  readonly timeoutMs?: number;
  readonly client?: Anthropic;
}

export class AnthropicNewsModel implements NewsLanguageModel {
  readonly name: string;
  private readonly client: Anthropic;

  constructor(options: AnthropicModelOptions = {}) {
    const apiKey = options.apiKey ?? process.env.ANTHROPIC_API_KEY;
    if (!options.client && !apiKey) {
      throw new NewsEngineError(
        "news_engine_model_unconfigured",
        "ANTHROPIC_API_KEY is required for the news engine's model stages.",
      );
    }
    this.name = options.model ?? process.env.NEWS_ENGINE_MODEL ?? DEFAULT_NEWS_ENGINE_MODEL;
    this.client =
      options.client ??
      new Anthropic({
        apiKey,
        maxRetries: options.maxRetries ?? 3,
        // Milliseconds in the TypeScript SDK.
        timeout: options.timeoutMs ?? 180_000,
      });
  }

  async complete<TSchema extends z.ZodType>(
    request: StructuredRequest<TSchema>,
  ): Promise<StructuredResult<z.infer<TSchema>>> {
    let response;
    try {
      const stream = this.client.messages.stream({
        model: this.name,
        max_tokens: request.maxTokens ?? 8_000,
        system: [
          {
            type: "text",
            text: request.system,
            cache_control: { type: "ephemeral" },
          },
        ],
        thinking: { type: "adaptive" },
        output_config: {
          effort: request.effort ?? "high",
          format: zodOutputFormat(request.schema),
        },
        messages: [{ role: "user", content: request.user }],
      });
      response = await stream.finalMessage();
    } catch (error) {
      if (error instanceof Anthropic.RateLimitError) {
        throw new NewsEngineError(
          "news_engine_model_rate_limited",
          "Model rate limit reached.",
          true,
          error,
        );
      }
      if (error instanceof Anthropic.AuthenticationError) {
        throw new NewsEngineError(
          "news_engine_model_unauthorized",
          "Model credentials rejected.",
          false,
          error,
        );
      }
      if (error instanceof Anthropic.APIConnectionError) {
        throw new NewsEngineError(
          "news_engine_model_unreachable",
          "Model request failed.",
          true,
          error,
        );
      }
      if (error instanceof Anthropic.APIError) {
        throw new NewsEngineError(
          "news_engine_model_error",
          `Model returned status ${error.status ?? "unknown"}.`,
          (error.status ?? 500) >= 500,
          error,
        );
      }
      throw error;
    }

    if (response.stop_reason === "refusal") {
      throw new ModelRefusalError(response.stop_details?.category ?? null);
    }
    if (response.stop_reason === "max_tokens") {
      throw new ModelOutputError("Model output was truncated before the schema was complete.");
    }

    // `parsed_output` is populated by the structured-output format; fall back
    // to parsing the text block if the SDK did not surface it.
    const parsedOutput = (response as { parsed_output?: unknown }).parsed_output;
    let candidate: unknown = parsedOutput;
    if (candidate === undefined || candidate === null) {
      const textBlock = response.content.find(
        (block): block is Anthropic.TextBlock => block.type === "text",
      );
      if (!textBlock) {
        throw new ModelOutputError("Model returned no structured output and no text block.");
      }
      try {
        candidate = JSON.parse(textBlock.text) as unknown;
      } catch (error) {
        throw new ModelOutputError(
          `Model output for ${request.schemaName} was not valid JSON.`,
          error,
        );
      }
    }

    const validated = request.schema.safeParse(candidate);
    if (!validated.success) {
      throw new ModelOutputError(
        `Model output for ${request.schemaName} did not match its schema.`,
        validated.error,
      );
    }

    return {
      value: validated.data as z.infer<TSchema>,
      model: response.model,
      inputTokens: response.usage.input_tokens,
      outputTokens: response.usage.output_tokens,
      cachedInputTokens: response.usage.cache_read_input_tokens ?? 0,
    };
  }
}
