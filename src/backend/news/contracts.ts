import { z } from "zod";
import type { CursorPageRequest, RepositoryContext } from "@/backend/contracts/repository";

export const NEWS_LANGUAGES = ["fr", "ar"] as const;
export type NewsLanguage = (typeof NEWS_LANGUAGES)[number];

export const mediaSchema = z
  .object({
    id: z.string().uuid(),
    sourceUrl: z.string().url().nullable(),
    storagePath: z.string().nullable(),
    alt: z.string().nullable(),
    caption: z.string().nullable(),
    credit: z.string().nullable(),
    width: z.number().int().positive().nullable(),
    height: z.number().int().positive().nullable(),
    mimeType: z.enum(["image/avif", "image/jpeg", "image/png", "image/webp"]).nullable(),
  })
  .nullable();

const bylineSchema = z
  .object({ id: z.string().uuid(), slug: z.string().min(1), name: z.string().min(1) })
  .nullable();

export const taxonomySchema = z.object({
  id: z.string().uuid(),
  type: z.enum(["category", "topic", "tag"]).optional(),
  slug: z.string().min(1),
  name: z.string().min(1),
  description: z.string().nullable().optional(),
});

export const articleCardSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  language: z.enum(NEWS_LANGUAGES),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  summary: z.string().min(1),
  publishedAt: z.string().datetime({ offset: true }),
  updatedAt: z.string().datetime({ offset: true }),
  readingTimeMinutes: z.number().int().positive(),
  hero: mediaSchema,
  author: bylineSchema,
  publisher: bylineSchema,
  primaryCategory: taxonomySchema.omit({ type: true }).nullable(),
  tags: z.array(taxonomySchema.omit({ type: true })),
  teamIds: z.array(z.string().uuid()),
  competitionIds: z.array(z.string().uuid()),
  placement: z
    .enum(["home_lead", "news_lead", "editors_pick", "featured", "breaking", "trending"])
    .nullable(),
  isSaved: z.boolean(),
  searchRank: z.number().optional(),
  savedAt: z.string().datetime({ offset: true }).optional(),
});
export type ArticleCardDto = z.infer<typeof articleCardSchema>;

const entitySchema = z.object({ id: z.string().uuid(), slug: z.string(), name: z.string() });

export const articleDetailSchema = articleCardSchema.extend({
  bodyHtml: z.string().min(1),
  bodyFormat: z.enum(["markdown", "rich_text"]),
  seo: z.object({ title: z.string().nullable(), description: z.string().nullable() }),
  taxonomies: z.array(taxonomySchema),
  competitions: z.array(entitySchema),
  teams: z.array(entitySchema),
  players: z.array(entitySchema),
});
export type ArticleDetailDto = z.infer<typeof articleDetailSchema>;

export const articleCursorSchema = z.object({
  publishedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type ArticleCursor = z.infer<typeof articleCursorSchema>;

export const articlePageSchema = z.object({
  items: z.array(articleCardSchema),
  nextCursor: articleCursorSchema.nullable(),
});
export type ArticlePageDto = z.infer<typeof articlePageSchema>;

export const homeModulesSchema = z.object({
  lead: articleCardSchema.nullable(),
  featured: z.array(articleCardSchema),
  latest: z.array(articleCardSchema),
  generatedAt: z.string().datetime({ offset: true }),
});
export type NewsHomeModulesDto = z.infer<typeof homeModulesSchema>;

export const newsTeamFilterSchema = z.object({
  id: z.string().uuid(),
  slug: z.string(),
  name: z.string(),
  shortName: z.string(),
  city: z.string().nullable(),
  code: z.string().nullable(),
  primaryColor: z.string().nullable(),
  secondaryColor: z.string().nullable(),
});
export type NewsTeamFilterDto = z.infer<typeof newsTeamFilterSchema>;

export interface NewsFeedInput extends CursorPageRequest {
  readonly language: NewsLanguage;
  readonly categorySlug?: string | null;
  readonly topicSlug?: string | null;
  readonly competitionId?: string | null;
  readonly teamId?: string | null;
  readonly playerId?: string | null;
}

export interface NewsSearchInput extends CursorPageRequest {
  readonly language: NewsLanguage;
  readonly query: string;
}

export interface NewsRepository {
  getHomeModules(
    language: NewsLanguage,
    limit: number,
    context: RepositoryContext,
  ): Promise<NewsHomeModulesDto>;
  getFeed(input: NewsFeedInput, context: RepositoryContext): Promise<ArticlePageDto>;
  getTeamFilters(
    language: NewsLanguage,
    context: RepositoryContext,
  ): Promise<readonly NewsTeamFilterDto[]>;
  getArticle(
    identifier: string,
    language: NewsLanguage,
    context: RepositoryContext,
  ): Promise<ArticleDetailDto>;
  getRelated(
    articleId: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly ArticleCardDto[]>;
  search(input: NewsSearchInput, context: RepositoryContext): Promise<ArticlePageDto>;
  getSaved(limit: number, context: RepositoryContext): Promise<ArticlePageDto>;
  save(articleId: string, context: RepositoryContext): Promise<void>;
  unsave(articleId: string, context: RepositoryContext): Promise<void>;
}
