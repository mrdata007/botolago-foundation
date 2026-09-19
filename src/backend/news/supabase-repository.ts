import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getNewsApi, supabaseV2 } from "@/integrations/supabase/v2-client";
import {
  articleCardSchema,
  articleDetailSchema,
  articleEditorialDetailSchema,
  articlePageSchema,
  editorialRevisionSchema,
  editorialStoryPageSchema,
  homeModulesSchema,
  newsTeamFilterSchema,
  type ArticlePageDto,
  type CreateDraftInput,
  type CreateDraftResult,
  type EditorialRevisionDto,
  type EditorialStoryPageDto,
  type ListStoriesInput,
  type NewsFeedInput,
  type NewsLanguage,
  type NewsRepository,
  type NewsSearchInput,
  type RegisterMediaInput,
  type RegisterMediaResult,
  type SetPlacementInput,
  type SetPlacementResult,
  type TransitionArticleInput,
  type TransitionArticleResult,
  type UpdateArticleInput,
  type UpdateArticleResult,
} from "./contracts";
import { mapNewsError, NewsError } from "./errors";

function throwIfError(error: PostgrestError | null): void {
  if (error) throw mapNewsError(error);
}

function parse<T>(schema: z.ZodType<T>, value: unknown): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success)
    throw new NewsError("data_unavailable", "The News API returned an invalid DTO.", parsed.error);
  return parsed.data;
}

// The generated RPC arg types mark every `text` column-backed parameter as a
// required non-null `string`, even when the underlying Postgres function
// happily accepts (and the CHECK constraints sometimes require) null. This
// narrow cast keeps call sites honest about the real nullable DTOs while
// still sending the actual null value over the wire.
function nullableText(value: string | null | undefined): string {
  return value as unknown as string;
}

// Both editorial write actions go through the news-editorial-write Edge
// Function rather than calling api.editorial_create_draft/editorial_update_article
// directly: that function is the only caller that can produce a body_html
// HMAC the RPC will accept (see app_private.verify_editorial_content_mac),
// because it is the only place body_html is actually sanitized server-side.
// Calling the RPC directly from the browser with a client-side-only
// "sanitized" string is no longer sufficient -- the RPC itself now rejects
// it. Authorization is unaffected: this still forwards the caller's own
// session, so has_editorial_role()/RLS/MFA-AAL2 run exactly as before.
async function invokeEditorialWrite(body: Record<string, unknown>): Promise<unknown> {
  const { data, error } = await supabaseV2.functions.invoke("news-editorial-write", { body });
  if (error) {
    let mapped: { message?: string; code?: string; details?: string } | null = null;
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const parsed = (await context.json().catch(() => null)) as {
        error?: { message?: string; code?: string };
      } | null;
      mapped = parsed?.error ?? null;
    }
    throwIfError({
      message: mapped?.message ?? error.message ?? "editorial_write_failed",
      code: mapped?.code,
      details: mapped?.details,
    } as PostgrestError);
  }
  return data;
}

function requireUuid(value: string): string {
  const parsed = z.string().uuid().safeParse(value);
  if (!parsed.success) throw new NewsError("data_unavailable", "Invalid article identifier.");
  return parsed.data;
}

function decodeCursor(
  value: string | null | undefined,
): { publishedAt: string; id: string } | null {
  if (!value) return null;
  try {
    return z
      .object({ publishedAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
      .parse(JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    throw new NewsError("invalid_cursor", "Invalid News pagination cursor.", error);
  }
}

export function encodeNewsCursor(cursor: ArticlePageDto["nextCursor"]): string | null {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

function decodeEditorialCursor(
  value: string | null | undefined,
): { updatedAt: string; id: string } | null {
  if (!value) return null;
  try {
    return z
      .object({ updatedAt: z.string().datetime({ offset: true }), id: z.string().uuid() })
      .parse(JSON.parse(decodeURIComponent(value)));
  } catch (error) {
    throw new NewsError("invalid_cursor", "Invalid CMS pagination cursor.", error);
  }
}

export function encodeEditorialCursor(cursor: EditorialStoryPageDto["nextCursor"]): string | null {
  return cursor ? encodeURIComponent(JSON.stringify(cursor)) : null;
}

export class SupabaseNewsRepository implements NewsRepository {
  async getHomeModules(language: NewsLanguage, limit: number, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_home_modules", {
      p_language: language,
      p_limit: limit,
    });
    throwIfError(error);
    return parse(homeModulesSchema, data);
  }

  async getFeed(input: NewsFeedInput, _context: RepositoryContext) {
    const cursor = decodeCursor(input.cursor);
    const { data, error } = await getNewsApi().rpc("news_feed", {
      p_language: input.language,
      p_limit: input.limit ?? 20,
      p_after_published_at: cursor?.publishedAt,
      p_after_id: cursor?.id,
      p_category_slug: input.categorySlug ?? undefined,
      p_topic_slug: input.topicSlug ?? undefined,
      p_competition_id: input.competitionId ?? undefined,
      p_team_id: input.teamId ?? undefined,
      p_player_id: input.playerId ?? undefined,
    });
    throwIfError(error);
    return parse(articlePageSchema, data);
  }

  async getTeamFilters(language: NewsLanguage, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_team_filters", { p_language: language });
    throwIfError(error);
    return parse(z.array(newsTeamFilterSchema), data);
  }

  async getArticle(identifier: string, language: NewsLanguage, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_article_detail", {
      p_identifier: identifier,
      p_language: language,
    });
    throwIfError(error);
    return parse(articleDetailSchema, data);
  }

  async getRelated(articleId: string, limit: number, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_related_articles", {
      p_article_edition_id: requireUuid(articleId),
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(articleCardSchema), data);
  }

  async search(input: NewsSearchInput, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_search", {
      p_language: input.language,
      p_query: input.query,
      p_limit: input.limit ?? 20,
    });
    throwIfError(error);
    return parse(articlePageSchema, data);
  }

  async getSaved(limit: number, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("news_saved_articles", {
      p_limit: limit,
    });
    throwIfError(error);
    return parse(articlePageSchema, data);
  }

  async save(articleId: string, _context: RepositoryContext): Promise<void> {
    const { error } = await getNewsApi().rpc("save_article", {
      p_article_edition_id: requireUuid(articleId),
    });
    throwIfError(error);
  }

  async unsave(articleId: string, _context: RepositoryContext): Promise<void> {
    const { error } = await getNewsApi().rpc("unsave_article", {
      p_article_edition_id: requireUuid(articleId),
    });
    throwIfError(error);
  }

  // --- Editorial (CMS) surface ---------------------------------------

  async createDraft(
    input: CreateDraftInput,
    _context: RepositoryContext,
  ): Promise<CreateDraftResult> {
    const data = await invokeEditorialWrite({
      action: "create_draft",
      language: input.language,
      slug: input.slug,
      title: input.title,
      summary: input.summary,
      bodyFormat: input.bodyFormat,
      bodySource: nullableText(input.bodySource),
      bodyHtml: input.bodyHtml,
      storyId: input.storyId ?? undefined,
      authorId: input.authorId ?? undefined,
      publisherId: input.publisherId ?? undefined,
    });
    return parse(
      z.object({
        storyId: z.string().uuid(),
        articleId: z.string().uuid(),
        status: z.string(),
      }),
      data,
    ) as CreateDraftResult;
  }

  async updateArticle(
    input: UpdateArticleInput,
    _context: RepositoryContext,
  ): Promise<UpdateArticleResult> {
    const data = await invokeEditorialWrite({
      action: "update_article",
      articleEditionId: requireUuid(input.articleEditionId),
      expectedUpdatedAt: input.expectedUpdatedAt,
      slug: input.slug,
      title: input.title,
      subtitle: nullableText(input.subtitle),
      summary: input.summary,
      bodyFormat: input.bodyFormat,
      bodySource: nullableText(input.bodySource),
      bodyHtml: input.bodyHtml,
      heroAssetId: input.heroAssetId ?? undefined,
      seoTitle: input.seoTitle ?? undefined,
      seoDescription: input.seoDescription ?? undefined,
    });
    return parse(
      z.object({
        articleId: z.string().uuid(),
        status: z.string(),
        updatedAt: z.string(),
      }),
      data,
    ) as UpdateArticleResult;
  }

  async transitionArticle(
    input: TransitionArticleInput,
    _context: RepositoryContext,
  ): Promise<TransitionArticleResult> {
    const { data, error } = await getNewsApi().rpc("editorial_transition_article", {
      p_article_edition_id: requireUuid(input.articleEditionId),
      p_target_status: input.targetStatus,
      p_scheduled_at: input.scheduledAt ?? undefined,
      p_visibility: input.visibility ?? undefined,
    });
    throwIfError(error);
    return parse(
      z.object({
        articleId: z.string().uuid(),
        status: z.string(),
        visibility: z.string(),
      }),
      data,
    ) as TransitionArticleResult;
  }

  async setPlacement(
    input: SetPlacementInput,
    _context: RepositoryContext,
  ): Promise<SetPlacementResult> {
    const { data, error } = await getNewsApi().rpc("editorial_set_placement", {
      p_article_edition_id: requireUuid(input.articleEditionId),
      p_placement_type: input.placementType,
      p_scope_type: input.scopeType ?? undefined,
      p_scope_id: input.scopeId ?? undefined,
      p_priority: input.priority ?? undefined,
      p_starts_at: input.startsAt ?? undefined,
      p_ends_at: input.endsAt ?? undefined,
    });
    throwIfError(error);
    return parse(
      z.object({ placementId: z.string().uuid(), articleId: z.string().uuid() }),
      data,
    ) as SetPlacementResult;
  }

  async softDeleteStory(storyId: string, _context: RepositoryContext): Promise<void> {
    const { error } = await getNewsApi().rpc("editorial_soft_delete_story", {
      p_story_id: requireUuid(storyId),
    });
    throwIfError(error);
  }

  async listStories(
    input: ListStoriesInput,
    _context: RepositoryContext,
  ): Promise<EditorialStoryPageDto> {
    const cursor = decodeEditorialCursor(input.cursor);
    const { data, error } = await getNewsApi().rpc("editorial_list_stories", {
      p_language: input.language ?? undefined,
      p_status: input.status ?? undefined,
      p_query: input.query ?? undefined,
      p_limit: input.limit ?? 20,
      p_after_updated_at: cursor?.updatedAt,
      p_after_id: cursor?.id,
    });
    throwIfError(error);
    return parse(editorialStoryPageSchema, data);
  }

  async listRevisions(
    articleEditionId: string,
    limit: number,
    _context: RepositoryContext,
  ): Promise<readonly EditorialRevisionDto[]> {
    const { data, error } = await getNewsApi().rpc("editorial_list_revisions", {
      p_article_edition_id: requireUuid(articleEditionId),
      p_limit: limit,
    });
    throwIfError(error);
    return parse(z.array(editorialRevisionSchema), data);
  }

  async getEditorialArticle(articleEditionId: string, _context: RepositoryContext) {
    const { data, error } = await getNewsApi().rpc("editorial_get_article", {
      p_article_edition_id: requireUuid(articleEditionId),
    });
    throwIfError(error);
    return parse(articleEditorialDetailSchema, data);
  }

  async registerMedia(
    input: RegisterMediaInput,
    _context: RepositoryContext,
  ): Promise<RegisterMediaResult> {
    const { data, error } = await getNewsApi().rpc("editorial_register_media", {
      p_storage_path: input.storagePath,
      p_mime_type: input.mimeType,
      p_width: input.width,
      p_height: input.height,
      p_alt_text: input.altText,
      p_caption: input.caption ?? undefined,
      p_credit: input.credit ?? undefined,
      p_copyright_owner: input.copyrightOwner ?? undefined,
      p_license_url: input.licenseUrl ?? undefined,
      p_attribution_url: input.attributionUrl ?? undefined,
      p_kind: input.kind ?? undefined,
    });
    throwIfError(error);
    return parse(z.object({ mediaAssetId: z.string().uuid() }), data);
  }
}
