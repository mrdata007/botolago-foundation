import type { PostgrestError } from "@supabase/supabase-js";

export const NEWS_ERROR_CODES = [
  "article_not_found",
  "unsupported_language",
  "invalid_cursor",
  "invalid_search_query",
  "unauthorized",
  "editorial_forbidden",
  "slug_or_translation_conflict",
  "invalid_status_transition",
  "article_not_editable",
  "placement_requires_published_article",
  "editorial_conflict",
  "story_not_found",
  "invalid_media_payload",
  "mapping_collision",
  "stale_update",
  "provider_unavailable",
  "provider_rate_limited",
  "invalid_provider_payload",
  "unsafe_content",
  "data_unavailable",
] as const;
export type NewsErrorCode = (typeof NEWS_ERROR_CODES)[number];

export class NewsError extends Error {
  constructor(
    readonly code: NewsErrorCode,
    message: string,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "NewsError";
  }
}

const mappings: ReadonlyArray<readonly [string, NewsErrorCode]> = [
  ["news_article_not_found", "article_not_found"],
  ["news_unsupported_language", "unsupported_language"],
  ["news_invalid_cursor", "invalid_cursor"],
  ["news_invalid_search_query", "invalid_search_query"],
  ["auth_unauthorized", "unauthorized"],
  ["news_editorial_forbidden", "editorial_forbidden"],
  ["news_slug_or_translation_conflict", "slug_or_translation_conflict"],
  ["news_invalid_status_transition", "invalid_status_transition"],
  ["news_article_not_editable", "article_not_editable"],
  ["news_placement_requires_published_article", "placement_requires_published_article"],
  ["news_editorial_conflict", "editorial_conflict"],
  ["news_story_not_found", "story_not_found"],
  ["news_invalid_media_storage_path", "invalid_media_payload"],
  ["news_invalid_media_mime_type", "invalid_media_payload"],
  ["news_invalid_media_dimensions", "invalid_media_payload"],
  ["news_invalid_media_alt_text", "invalid_media_payload"],
  ["news_invalid_media_license_url", "invalid_media_payload"],
  ["news_invalid_media_attribution_url", "invalid_media_payload"],
  ["news_mapping_collision", "mapping_collision"],
  ["news_stale_update", "stale_update"],
];

export function mapNewsError(error: PostgrestError | Error): NewsError {
  const raw = `${error.message} ${"details" in error ? (error.details ?? "") : ""}`.toLowerCase();
  const mapping = mappings.find(([needle]) => raw.includes(needle));
  if (mapping)
    return new NewsError(mapping[1], "The news operation could not be completed.", error);
  if ("code" in error && error.code === "42501")
    return new NewsError("unauthorized", "Authentication is required.", error);
  return new NewsError("data_unavailable", "News data is temporarily unavailable.", error);
}
