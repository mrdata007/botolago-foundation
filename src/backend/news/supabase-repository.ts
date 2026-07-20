import type { PostgrestError } from "@supabase/supabase-js";
import { z } from "zod";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { getNewsApi } from "@/integrations/supabase/v2-client";
import {
  articleCardSchema,
  articleDetailSchema,
  articlePageSchema,
  homeModulesSchema,
  newsTeamFilterSchema,
  type ArticlePageDto,
  type NewsFeedInput,
  type NewsLanguage,
  type NewsRepository,
  type NewsSearchInput,
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
}
