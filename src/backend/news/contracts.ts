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

// --- Editorial (CMS) DTOs -------------------------------------------------
// The public articleCardSchema/articleDetailSchema intentionally omit
// editorial-only fields (status, visibility, editable body source, SEO
// fields), so the CMS uses its own DTOs backed by the editorial_* RPCs.

export const EDITORIAL_STATUSES = [
  "draft",
  "in_review",
  "scheduled",
  "published",
  "unpublished",
  "archived",
  "rejected",
] as const;
export type EditorialStatus = (typeof EDITORIAL_STATUSES)[number];

export const ARTICLE_VISIBILITIES = ["public", "unlisted", "private"] as const;
export type ArticleVisibility = (typeof ARTICLE_VISIBILITIES)[number];

export const PLACEMENT_TYPES = [
  "home_lead",
  "news_lead",
  "editors_pick",
  "featured",
  "breaking",
  "trending",
] as const;
export type PlacementType = (typeof PLACEMENT_TYPES)[number];

export const editorialStorySummarySchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  language: z.enum(NEWS_LANGUAGES),
  slug: z.string().min(1),
  title: z.string().min(1),
  status: z.enum(EDITORIAL_STATUSES),
  visibility: z.enum(ARTICLE_VISIBILITIES),
  updatedAt: z.string().datetime({ offset: true }),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  authorName: z.string().nullable(),
  publisherName: z.string().nullable(),
  primaryCategory: taxonomySchema.omit({ type: true }).nullable(),
});
export type EditorialStorySummaryDto = z.infer<typeof editorialStorySummarySchema>;

export const editorialStoryCursorSchema = z.object({
  updatedAt: z.string().datetime({ offset: true }),
  id: z.string().uuid(),
});
export type EditorialStoryCursor = z.infer<typeof editorialStoryCursorSchema>;

export const editorialStoryPageSchema = z.object({
  items: z.array(editorialStorySummarySchema),
  nextCursor: editorialStoryCursorSchema.nullable(),
});
export type EditorialStoryPageDto = z.infer<typeof editorialStoryPageSchema>;

export const articleEditorialDetailSchema = z.object({
  id: z.string().uuid(),
  storyId: z.string().uuid(),
  language: z.enum(NEWS_LANGUAGES),
  slug: z.string().min(1),
  title: z.string().min(1),
  subtitle: z.string().nullable(),
  summary: z.string().min(1),
  bodyFormat: z.enum(["markdown", "rich_text"]),
  bodySource: z.string().nullable(),
  bodyHtml: z.string().min(1),
  heroAssetId: z.string().uuid().nullable(),
  hero: mediaSchema,
  status: z.enum(EDITORIAL_STATUSES),
  visibility: z.enum(ARTICLE_VISIBILITIES),
  scheduledAt: z.string().datetime({ offset: true }).nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  readingTimeMinutes: z.number().int().positive(),
  seoTitle: z.string().nullable(),
  seoDescription: z.string().nullable(),
  sanitizerVersion: z.string().min(1),
  updatedAt: z.string().datetime({ offset: true }),
});
export type ArticleEditorialDetailDto = z.infer<typeof articleEditorialDetailSchema>;

export const editorialRevisionSchema = z.object({
  id: z.string().uuid(),
  revisionNumber: z.number().int().positive(),
  title: z.string(),
  subtitle: z.string().nullable(),
  summary: z.string(),
  bodyHtml: z.string(),
  status: z.enum(EDITORIAL_STATUSES),
  visibility: z.enum(ARTICLE_VISIBILITIES),
  changedBy: z.string().uuid().nullable(),
  createdAt: z.string().datetime({ offset: true }),
});
export type EditorialRevisionDto = z.infer<typeof editorialRevisionSchema>;

export interface CreateDraftInput {
  readonly language: NewsLanguage;
  readonly slug: string;
  readonly title: string;
  readonly summary: string;
  readonly bodyFormat: "markdown" | "rich_text";
  readonly bodySource: string | null;
  readonly bodyHtml: string;
  readonly readingTimeMinutes: number;
  readonly sanitizerVersion: string;
  readonly storyId?: string | null;
  readonly authorId?: string | null;
  readonly publisherId?: string | null;
}
export interface CreateDraftResult {
  readonly storyId: string;
  readonly articleId: string;
  readonly status: EditorialStatus;
}

export interface UpdateArticleInput {
  readonly articleEditionId: string;
  readonly expectedUpdatedAt: string;
  readonly slug: string;
  readonly title: string;
  readonly subtitle: string | null;
  readonly summary: string;
  readonly bodyFormat: "markdown" | "rich_text";
  readonly bodySource: string | null;
  readonly bodyHtml: string;
  readonly readingTimeMinutes: number;
  readonly sanitizerVersion: string;
  readonly heroAssetId?: string | null;
  readonly seoTitle?: string | null;
  readonly seoDescription?: string | null;
}
export interface UpdateArticleResult {
  readonly articleId: string;
  readonly status: EditorialStatus;
  readonly updatedAt: string;
}

export interface TransitionArticleInput {
  readonly articleEditionId: string;
  readonly targetStatus: EditorialStatus;
  readonly scheduledAt?: string | null;
  readonly visibility?: ArticleVisibility | null;
}
export interface TransitionArticleResult {
  readonly articleId: string;
  readonly status: EditorialStatus;
  readonly visibility: ArticleVisibility;
}

export interface SetPlacementInput {
  readonly articleEditionId: string;
  readonly placementType: PlacementType;
  readonly scopeType?: "global" | "competition" | "team" | "country";
  readonly scopeId?: string | null;
  readonly priority?: number;
  readonly startsAt?: string;
  readonly endsAt?: string | null;
}
export interface SetPlacementResult {
  readonly placementId: string;
  readonly articleId: string;
}

export interface ListStoriesInput extends CursorPageRequest {
  readonly language?: NewsLanguage | null;
  readonly status?: EditorialStatus | null;
  readonly query?: string | null;
}

export interface RegisterMediaInput {
  readonly storagePath: string;
  readonly mimeType: "image/avif" | "image/jpeg" | "image/png" | "image/webp";
  readonly width: number;
  readonly height: number;
  readonly altText: string;
  readonly caption?: string | null;
  readonly credit?: string | null;
  readonly copyrightOwner?: string | null;
  readonly licenseUrl?: string | null;
  readonly attributionUrl?: string | null;
  readonly kind?: "article_hero" | "article_inline" | "author_avatar" | "publisher_logo";
}
export interface RegisterMediaResult {
  readonly mediaAssetId: string;
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

  // --- Editorial (CMS) surface, gated server-side by has_editorial_role ---
  createDraft(input: CreateDraftInput, context: RepositoryContext): Promise<CreateDraftResult>;
  updateArticle(
    input: UpdateArticleInput,
    context: RepositoryContext,
  ): Promise<UpdateArticleResult>;
  transitionArticle(
    input: TransitionArticleInput,
    context: RepositoryContext,
  ): Promise<TransitionArticleResult>;
  setPlacement(input: SetPlacementInput, context: RepositoryContext): Promise<SetPlacementResult>;
  softDeleteStory(storyId: string, context: RepositoryContext): Promise<void>;
  listStories(input: ListStoriesInput, context: RepositoryContext): Promise<EditorialStoryPageDto>;
  listRevisions(
    articleEditionId: string,
    limit: number,
    context: RepositoryContext,
  ): Promise<readonly EditorialRevisionDto[]>;
  getEditorialArticle(
    articleEditionId: string,
    context: RepositoryContext,
  ): Promise<ArticleEditorialDetailDto>;
  registerMedia(
    input: RegisterMediaInput,
    context: RepositoryContext,
  ): Promise<RegisterMediaResult>;
}
