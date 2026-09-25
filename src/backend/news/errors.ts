import type { PostgrestError } from "@supabase/supabase-js";
import { reportMfaStepUp } from "@/backend/auth/step-up";

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
  "imported_story_requires_conversion",
  "schedule_must_be_future",
  "conversion_reason_required",
  "story_not_imported",
  "invalid_list_scope",
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
  ["news_imported_story_requires_conversion", "imported_story_requires_conversion"],
  ["news_schedule_must_be_future", "schedule_must_be_future"],
  ["news_conversion_reason_required", "conversion_reason_required"],
  ["news_story_not_imported", "story_not_imported"],
  ["news_invalid_list_scope", "invalid_list_scope"],
];

/**
 * Every News error, the CMS's included, as a `NewsError`. It does not report
 * a step-up refusal to the auth layer: the admin News screens map their
 * editorial errors through here, and staff MFA has its own server-enforced
 * flow that the reader's challenge must not reroute (see step-up.ts). The
 * reader's own list reports through `mapReaderListError`.
 */
export function mapNewsError(error: PostgrestError | Error): NewsError {
  // Already mapped (the repository maps every RPC error once, and the CMS
  // routes map again in their catch blocks). Re-mapping read only the generic
  // message, so every CMS error -- "forbidden", the save conflict, all of
  // them -- was shown as data_unavailable.
  if (error instanceof NewsError) return error;
  const raw = `${error.message} ${"details" in error ? (error.details ?? "") : ""}`.toLowerCase();
  const mapping = mappings.find(([needle]) => raw.includes(needle));
  if (mapping)
    return new NewsError(mapping[1], "The news operation could not be completed.", error);
  if ("code" in error && error.code === "42501")
    return new NewsError("unauthorized", "Authentication is required.", error);
  return new NewsError("data_unavailable", "News data is temporarily unavailable.", error);
}

/**
 * An error from the reader's own saved list (`news_saved_articles`,
 * `save_article`, `unsave_article`): the one part of News the step-up rule
 * guards (`app.saved_articles`, 20260925210100). Refused while the second
 * factor is owed, and reported so the auth layer can ask for it -- which
 * `mapNewsError` did for every News error until 2026-09-25, the CMS's
 * included, against step-up.ts's rule for staff screens.
 */
export function mapReaderListError(error: PostgrestError | Error): NewsError {
  reportMfaStepUp(error);
  return mapNewsError(error);
}
