import type { RepositoryContext } from "@/backend/contracts/repository";
import type {
  ArticleCardDto,
  ArticleDetailDto,
  NewsLanguage,
  NewsRepository,
  NewsTeamFilterDto,
} from "@/backend/news/contracts";
import { NewsError } from "@/backend/news/errors";
import { MockNewsRepository } from "@/backend/news/mock-repository";
import { SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import { authService } from "@/services/auth";
import type { Article, ArticleCategory, Club } from "@/types/domain";
import { resolveMediaUrl } from "@/lib/media";

export type NewsDataMode = "mock" | "supabase";

export function selectNewsDataMode(
  configuredMode: string | undefined,
  production: boolean,
): NewsDataMode {
  if (production && configuredMode !== "supabase")
    throw new NewsError(
      "data_unavailable",
      "Production News requires VITE_NEWS_DATA_MODE=supabase.",
    );
  if (configuredMode === "mock" || configuredMode === "supabase") return configuredMode;
  return "mock";
}

const mockRepository = new MockNewsRepository();
const supabaseRepository = new SupabaseNewsRepository();

export function getNewsDataMode(): NewsDataMode {
  return selectNewsDataMode(import.meta.env.VITE_NEWS_DATA_MODE, import.meta.env.PROD);
}

export function getNewsRepository(): NewsRepository {
  return getNewsDataMode() === "supabase" ? supabaseRepository : mockRepository;
}

function context(): RepositoryContext {
  return {
    actorId: authService.getSession().user?.id ?? null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `news-${Date.now().toString(36)}`,
  };
}

function category(value: string | undefined): ArticleCategory {
  if (value === "transfers" || value === "analysis" || value === "interviews") return value;
  return "latest";
}

function localized(value: string): { fr: string; ar: string } {
  return { fr: value, ar: value };
}

function fallbackGradient(id: string): string {
  const variant = Number.parseInt(id.slice(-2), 16) % 3;
  return [
    "linear-gradient(135deg, #082f49 0%, #0f766e 100%)",
    "linear-gradient(135deg, #172554 0%, #7c2d12 100%)",
    "linear-gradient(135deg, #3f1d2e 0%, #075985 100%)",
  ][Number.isNaN(variant) ? 0 : variant]!;
}

export function presentArticle(
  dto: ArticleCardDto | ArticleDetailDto,
  supabaseUrl?: string | null,
): Article {
  return {
    id: dto.id,
    title: localized(dto.title),
    excerpt: localized(dto.subtitle ?? dto.summary),
    category: category(dto.primaryCategory?.slug),
    clubIds: [...dto.teamIds],
    authorName: localized(dto.author?.name ?? dto.publisher?.name ?? "BotolaGO"),
    publishedAt: dto.publishedAt,
    readMinutes: dto.readingTimeMinutes,
    heroGradient: fallbackGradient(dto.id),
    heroUrl: resolveMediaUrl(dto.hero, supabaseUrl),
    heroAlt: dto.hero?.alt ?? undefined,
    isLead: dto.placement === "home_lead" || dto.placement === "news_lead",
    tag: dto.tags[0] ? localized(dto.tags[0].name) : undefined,
    bodyHtml: "bodyHtml" in dto ? dto.bodyHtml : undefined,
  };
}

function presentTeam(team: NewsTeamFilterDto): Club {
  return {
    id: team.id,
    name: localized(team.name),
    shortName: localized(team.shortName),
    city: localized(team.city ?? ""),
    primaryColor: team.primaryColor ?? "#0a2540",
    secondaryColor: team.secondaryColor ?? undefined,
    crestPlaceholder: team.code ?? team.shortName.slice(0, 3).toUpperCase(),
  };
}

export const newsService = {
  async getHome(language: NewsLanguage) {
    const modules = await getNewsRepository().getHomeModules(language, 8, context());
    return {
      lead: modules.lead ? presentArticle(modules.lead) : null,
      featured: modules.featured.map((article) => presentArticle(article)),
      latest: modules.latest.map((article) => presentArticle(article)),
    };
  },

  async getArticles(
    language: NewsLanguage,
    options?: { category?: ArticleCategory; teamId?: string | null },
  ): Promise<Article[]> {
    const page = await getNewsRepository().getFeed(
      {
        language,
        limit: 50,
        categorySlug:
          options?.category && !["for_you", "latest"].includes(options.category)
            ? options.category
            : null,
        teamId: options?.teamId,
      },
      context(),
    );
    return page.items.map((article) => presentArticle(article));
  },

  async getTeamFilters(language: NewsLanguage): Promise<Club[]> {
    return (await getNewsRepository().getTeamFilters(language, context())).map(presentTeam);
  },

  async getArticle(identifier: string, language: NewsLanguage): Promise<Article> {
    return presentArticle(await getNewsRepository().getArticle(identifier, language, context()));
  },

  async getRelated(articleId: string, language: NewsLanguage): Promise<Article[]> {
    return (await getNewsRepository().getRelated(articleId, 6, context())).map((article) =>
      presentArticle({ ...article, language }),
    );
  },

  async search(language: NewsLanguage, query: string): Promise<Article[]> {
    const page = await getNewsRepository().search({ language, query, limit: 30 }, context());
    return page.items.map((article) => presentArticle(article));
  },

  async getSavedIds(): Promise<string[]> {
    const page = await getNewsRepository().getSaved(100, context());
    return page.items.map((article) => article.id);
  },

  async save(articleId: string): Promise<void> {
    await getNewsRepository().save(articleId, context());
  },

  async unsave(articleId: string): Promise<void> {
    await getNewsRepository().unsave(articleId, context());
  },
};
