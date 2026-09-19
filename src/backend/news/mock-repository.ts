import * as db from "@/mocks/data";
import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  ArticleCardDto,
  ArticleDetailDto,
  ArticleEditorialDetailDto,
  ArticlePageDto,
  CreateDraftInput,
  CreateDraftResult,
  EditorialRevisionDto,
  EditorialStoryPageDto,
  ListStoriesInput,
  NewsFeedInput,
  NewsLanguage,
  NewsRepository,
  NewsSearchInput,
  NewsTeamFilterDto,
  RegisterMediaInput,
  RegisterMediaResult,
  SetPlacementInput,
  SetPlacementResult,
  TransitionArticleInput,
  TransitionArticleResult,
  UpdateArticleInput,
  UpdateArticleResult,
} from "./contracts";
import { NewsError } from "./errors";

const articleUuid = (index: number) =>
  `a0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const storyUuid = (index: number) =>
  `b0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const teamUuid = (index: number) =>
  `c0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;
const taxonomyUuid = (index: number) =>
  `d0000000-0000-4000-8000-${String(index + 1).padStart(12, "0")}`;

function teamId(sourceId: string): string {
  const index = db.clubs.findIndex((club) => club.id === sourceId);
  return teamUuid(Math.max(index, 0));
}

function card(index: number, language: NewsLanguage): ArticleCardDto {
  const article = db.articles[index];
  const categoryIndex = ["for_you", "latest", "transfers", "analysis", "interviews"].indexOf(
    article.category,
  );
  return {
    id: articleUuid(index),
    storyId: storyUuid(index),
    language,
    slug: `preview-${article.id}`,
    title: article.title[language],
    subtitle: null,
    summary: article.excerpt[language],
    publishedAt: article.publishedAt,
    updatedAt: article.publishedAt,
    readingTimeMinutes: article.readMinutes,
    hero: null,
    author: {
      id: "e0000000-0000-4000-8000-000000000001",
      slug: "preview-author",
      name: article.authorName[language],
    },
    publisher: {
      id: "f0000000-0000-4000-8000-000000000001",
      slug: "botolago-preview",
      name: "BotolaGO",
    },
    primaryCategory: {
      id: taxonomyUuid(Math.max(categoryIndex, 0)),
      slug: article.category,
      name: article.category,
    },
    tags: article.tag
      ? [
          {
            id: taxonomyUuid(index + 10),
            slug: `preview-tag-${index + 1}`,
            name: article.tag[language],
          },
        ]
      : [],
    teamIds: article.clubIds.map(teamId),
    competitionIds: [],
    placement: article.isLead ? "news_lead" : null,
    isSaved: false,
  };
}

function detail(index: number, language: NewsLanguage): ArticleDetailDto {
  const base = card(index, language);
  const excerpt = db.articles[index].excerpt[language];
  return {
    ...base,
    bodyHtml: `<p>${excerpt}</p><p>${language === "ar" ? "هذا محتوى معاينة حتمي فقط. تستخدم بيئة الإنتاج النسخة التحريرية المنقحة من الخادم." : "Ce contenu déterministe est réservé à la prévisualisation. La production utilise la version éditoriale assainie par le serveur."}</p>`,
    bodyFormat: "rich_text",
    seo: { title: null, description: null },
    taxonomies: base.primaryCategory ? [{ ...base.primaryCategory, type: "category" }] : [],
    competitions: [],
    teams: [],
    players: [],
  };
}

export class MockNewsRepository implements NewsRepository {
  private readonly saved = new Set<string>();

  async getHomeModules(language: NewsLanguage, limit: number) {
    const cards = db.articles.map((_article, index) => card(index, language));
    return {
      lead: cards.find((item) => item.placement === "news_lead") ?? null,
      featured: cards.filter((item) => item.placement !== "news_lead").slice(0, limit),
      latest: [...cards].sort((a, b) => b.publishedAt.localeCompare(a.publishedAt)).slice(0, limit),
      generatedAt: new Date(0).toISOString(),
    };
  }

  async getFeed(input: NewsFeedInput): Promise<ArticlePageDto> {
    let items = db.articles.map((_article, index) => card(index, input.language));
    if (input.categorySlug && !["for_you", "latest"].includes(input.categorySlug))
      items = items.filter((item) => item.primaryCategory?.slug === input.categorySlug);
    if (input.teamId) items = items.filter((item) => item.teamIds.includes(input.teamId!));
    return { items: items.slice(0, input.limit ?? 20), nextCursor: null };
  }

  async getTeamFilters(language: NewsLanguage): Promise<readonly NewsTeamFilterDto[]> {
    return db.clubs.map((club, index) => ({
      id: teamUuid(index),
      slug: `preview-${club.id}`,
      name: club.name[language],
      shortName: club.shortName[language],
      city: club.city[language],
      code: club.crestPlaceholder,
      primaryColor: club.primaryColor,
      secondaryColor: club.secondaryColor ?? null,
    }));
  }

  async getArticle(identifier: string, language: NewsLanguage): Promise<ArticleDetailDto> {
    const index = db.articles.findIndex(
      (article, articleIndex) =>
        articleUuid(articleIndex) === identifier || `preview-${article.id}` === identifier,
    );
    if (index < 0) throw new NewsError("article_not_found", "Preview article not found.");
    return detail(index, language);
  }

  async getRelated(articleId: string, limit: number): Promise<readonly ArticleCardDto[]> {
    const sourceIndex = db.articles.findIndex(
      (_article, index) => articleUuid(index) === articleId,
    );
    if (sourceIndex < 0) throw new NewsError("article_not_found", "Preview article not found.");
    const source = card(sourceIndex, "fr");
    return db.articles
      .map((_article, index) => card(index, "fr"))
      .filter(
        (candidate) =>
          candidate.id !== articleId &&
          (candidate.primaryCategory?.slug === source.primaryCategory?.slug ||
            candidate.teamIds.some((id) => source.teamIds.includes(id))),
      )
      .slice(0, limit);
  }

  async search(input: NewsSearchInput): Promise<ArticlePageDto> {
    const query = input.query.toLocaleLowerCase(input.language);
    const items = db.articles
      .map((_article, index) => card(index, input.language))
      .filter((item) =>
        `${item.title} ${item.summary}`.toLocaleLowerCase(input.language).includes(query),
      );
    return { items: items.slice(0, input.limit ?? 20), nextCursor: null };
  }

  async getSaved(limit: number): Promise<ArticlePageDto> {
    const items = [...this.saved]
      .map((id) => db.articles.findIndex((_article, index) => articleUuid(index) === id))
      .filter((index) => index >= 0)
      .map((index) => ({ ...card(index, "fr"), isSaved: true }))
      .slice(0, limit);
    return { items, nextCursor: null };
  }

  async save(articleId: string, _context: RepositoryContext): Promise<void> {
    this.saved.add(articleId);
  }

  async unsave(articleId: string, _context: RepositoryContext): Promise<void> {
    this.saved.delete(articleId);
  }

  // The preview mock backs only the public reading surface; the CMS always
  // talks to SupabaseNewsRepository, so these are intentionally unimplemented.
  private unsupported(): never {
    throw new NewsError("data_unavailable", "Editorial operations are not available in preview.");
  }

  async createDraft(
    _input: CreateDraftInput,
    _context: RepositoryContext,
  ): Promise<CreateDraftResult> {
    this.unsupported();
  }

  async updateArticle(
    _input: UpdateArticleInput,
    _context: RepositoryContext,
  ): Promise<UpdateArticleResult> {
    this.unsupported();
  }

  async transitionArticle(
    _input: TransitionArticleInput,
    _context: RepositoryContext,
  ): Promise<TransitionArticleResult> {
    this.unsupported();
  }

  async setPlacement(
    _input: SetPlacementInput,
    _context: RepositoryContext,
  ): Promise<SetPlacementResult> {
    this.unsupported();
  }

  async softDeleteStory(_storyId: string, _context: RepositoryContext): Promise<void> {
    this.unsupported();
  }

  async listStories(
    _input: ListStoriesInput,
    _context: RepositoryContext,
  ): Promise<EditorialStoryPageDto> {
    this.unsupported();
  }

  async listRevisions(
    _articleEditionId: string,
    _limit: number,
    _context: RepositoryContext,
  ): Promise<readonly EditorialRevisionDto[]> {
    this.unsupported();
  }

  async getEditorialArticle(
    _articleEditionId: string,
    _context: RepositoryContext,
  ): Promise<ArticleEditorialDetailDto> {
    this.unsupported();
  }

  async registerMedia(
    _input: RegisterMediaInput,
    _context: RepositoryContext,
  ): Promise<RegisterMediaResult> {
    this.unsupported();
  }
}
