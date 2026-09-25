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
import {
  isAllowedEditorialLinkUrl,
  isExternalEditorialLink,
} from "@/backend/news/editorial-markdown";

export type NewsDataMode = "mock" | "supabase";
export type NewsLanguageSelection = NewsLanguage | "auto";

export interface NewsEdition {
  language: NewsLanguage;
  articles: Article[];
  lead: Article | null;
}

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
  // Every shipped category passes through. `for_you` used to fall to
  // `latest`, so a "Pour vous" story took the general-news picture and
  // repeated the lead story's photo on the same screen.
  if (
    value === "for_you" ||
    value === "transfers" ||
    value === "analysis" ||
    value === "interviews"
  )
    return value;
  return "latest";
}

function localized(value: string): { fr: string; ar: string } {
  return { fr: value, ar: value };
}

function fallbackGradient(id: string): string {
  const variant = Number.parseInt(id.slice(-2), 16) % 3;
  // `to bottom`, not `135deg`: a gradient angle is physical (rule 3) and does
  // not follow `dir`, so every article hero lit from the opposite corner in
  // Arabic. The colours stay literal on purpose — they are artwork standing in
  // for a missing photograph, not design tokens, and there is no editorial
  // palette in the system for them to draw from.
  return [
    "linear-gradient(to bottom, #082f49 0%, #0f766e 100%)",
    "linear-gradient(to bottom, #172554 0%, #7c2d12 100%)",
    "linear-gradient(to bottom, #3f1d2e 0%, #075985 100%)",
  ][Number.isNaN(variant) ? 0 : variant]!;
}

/**
 * BG-0091 — strip third-party attribution at the data layer.
 *
 * Standing product rule: BotolaGO does not display a third-party source
 * label, byline, attribution UI, off-site media or outbound "read the
 * original" link anywhere in the end-user product. The News DTOs carry all
 * four for ingested content, so they are removed here — once, at the seam
 * every News surface reads through — rather than in each component, which
 * would leave the next new surface to rediscover the rule.
 *
 * The rule is written generically and names no provider, because the fix is
 * "we do not republish other people's attribution", not "hide one name":
 *
 *   - `publisher` is dropped outright. It is the source label and BotolaGO
 *     never renders one; our own publisher identity is the literal
 *     "BotolaGO" applied downstream.
 *   - `author` is dropped when it is just the publisher wearing a byline
 *     (identical name), which is the signature of a machine-ingested stub.
 *     A genuine editorial author survives, so licensed content keeps its
 *     byline if News is switched back on.
 *   - a hero that exists only as an off-site `sourceUrl`, with no
 *     `storagePath` of our own, is dropped: we do not hotlink somebody
 *     else's image host, and the card/article falls back to the brand
 *     gradient. A hero we actually hold in storage is kept; its
 *     `credit`/`caption` text is cleared when the story came from a
 *     third-party source (it has a publisher) and kept for CMS stories.
 *   - a body image not served from our own `news-media` bucket is removed
 *     with its figure, for the same no-hotlinking reason.
 *   - for a third-party story, an anchor in `bodyHtml` pointing off-site is
 *     removed *with its text*,
 *     not merely unwrapped. Measuring the rendered DOM is what showed why:
 *     unwrapping left the words "read the original on <source>" behind, which
 *     is attribution in its own right. Anchors that are not absolute URLs
 *     (our own relative links) are unwrapped instead, so internal prose keeps
 *     its words.
 *
 * Nothing here fetches, rehosts or otherwise works around a third party's
 * access controls — it only removes our own display of their attribution.
 *
 * The one exception is licensed content: `source` is set by the API only for a
 * story whose publisher has licensed it to BotolaGO, and it is kept, because
 * that licence is the reason we may publish it and crediting it is the
 * condition. An unlicensed source never has one.
 */
/** BotolaGO's own publisher identities, as opposed to a third-party source. */
export function isOwnPublisher(slug: string | null | undefined): boolean {
  return slug === "botolago" || (typeof slug === "string" && slug.startsWith("botolago-"));
}

function sameName(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLocaleLowerCase() === b.trim().toLocaleLowerCase();
}

/**
 * Removes every off-site anchor and the text it wraps, and unwraps the rest.
 *
 * The body HTML is already sanitized server-side (`src/backend/news/
 * sanitizer.ts`), so this operates on a known-narrow tag set; it is an
 * editorial-policy pass, not a security boundary.
 */
function removeOutboundLinks(html: string): string {
  return html
    .replace(/<a\b[^>]*\bhref\s*=\s*["']https?:\/\/[^>]*>[\s\S]*?<\/a\s*>/gi, "")
    .replace(/<a\b[^>]*>/gi, "")
    .replace(/<\/a\s*>/gi, "")
    .replace(/<p>\s*<\/p>/gi, "");
}

/**
 * Links in an original BotolaGO story (no third-party publisher): each anchor
 * is rebuilt from its href alone. An https link to another site gets
 * target="_blank" and rel="nofollow noopener noreferrer"; a path or a
 * botolago.com URL is a plain internal link; anything else (no href,
 * javascript:, data:, http:, //host) is unwrapped to its text. The server-side
 * sanitizer already enforces this; this pass is the read-side second line.
 */
function keepSafeLinks(html: string): string {
  return html.replace(
    /<a\b([^>]*)>([\s\S]*?)<\/a\s*>/gi,
    (_anchor, attributes: string, text: string) => {
      const match = /\shref\s*=\s*"([^"]*)"|\shref\s*=\s*'([^']*)'/i.exec(attributes);
      const raw = match?.[1] ?? match?.[2] ?? "";
      const href = raw.replace(/&amp;/g, "&");
      if (!raw || !isAllowedEditorialLinkUrl(href)) return text;
      const external = isExternalEditorialLink(href);
      return external
        ? `<a href="${raw}" target="_blank" rel="nofollow noopener noreferrer">${text}</a>`
        : `<a href="${raw}">${text}</a>`;
    },
  );
}

/**
 * Removes every body image that is not served from our own `news-media`
 * bucket, with its `<figure>` and caption.
 *
 * The sanitizer allows any https image, and an editor can type
 * `![alt](https://somebody-elses-site/photo.jpg)` into the body; that would be
 * published as a hotlinked photo nobody licensed. Same rule as the hero above:
 * we show images we hold, nothing else. With no configured Supabase URL there
 * is no "ours" to compare against, so every image is removed (fail closed).
 */
function removeOffsiteImages(html: string, supabaseUrl?: string | null): string {
  const probe = resolveMediaUrl({ storagePath: "news/probe" }, supabaseUrl);
  const ownPrefix = probe ? probe.slice(0, -"probe".length) : null;
  const isOwn = (tag: string) => {
    const src = /\ssrc\s*=\s*"([^"]*)"|\ssrc\s*=\s*'([^']*)'/i.exec(tag);
    const value = (src?.[1] ?? src?.[2] ?? "").replace(/&amp;/g, "&");
    return ownPrefix !== null && value.startsWith(ownPrefix) && !value.includes("..");
  };
  return html
    .replace(/<figure\b[^>]*>[\s\S]*?<\/figure\s*>/gi, (figure) => {
      const img = /<img\b[^>]*>/i.exec(figure);
      return img && isOwn(img[0]) ? figure : "";
    })
    .replace(/<img\b[^>]*>/gi, (img) => (isOwn(img) ? img : ""));
}

export function sanitizeArticleAttribution<T extends ArticleCardDto | ArticleDetailDto>(
  dto: T,
  supabaseUrl?: string | null,
): T {
  const publisherName = dto.publisher?.name;
  const hero = dto.hero;
  // A story with a third-party publisher came from an outside source; a story
  // written in the CMS has none (`editorial_create_draft` is never given one by
  // the editor). Only the former's caption/credit is somebody else's attribution.
  // Clearing it unconditionally also erased BotolaGO's own photo credits, so
  // the article page's figcaption could never render for original work.
  // BotolaGO's own publisher records ("botolago", "botolago-newsroom" for the
  // News engine) are not a third party.
  const thirdPartySource =
    dto.publisher !== null && dto.publisher !== undefined && !isOwnPublisher(dto.publisher.slug);
  const ownHero =
    hero && hero.storagePath
      ? thirdPartySource
        ? { ...hero, credit: null, caption: null }
        : hero
      : null;

  const sanitized: T = {
    ...dto,
    publisher: null,
    author: sameName(dto.author?.name, publisherName) ? null : dto.author,
    hero: ownHero,
  };

  if ("bodyHtml" in sanitized && typeof sanitized.bodyHtml === "string") {
    // Third-party stories lose every link (their "read the original"
    // attribution); original BotolaGO stories keep their safe links.
    (sanitized as ArticleDetailDto).bodyHtml = removeOffsiteImages(
      thirdPartySource
        ? removeOutboundLinks(sanitized.bodyHtml)
        : keepSafeLinks(sanitized.bodyHtml),
      supabaseUrl,
    );
  }

  return sanitized;
}

export function presentArticle(
  dto: ArticleCardDto | ArticleDetailDto,
  supabaseUrl?: string | null,
): Article {
  const safe = sanitizeArticleAttribution(dto, supabaseUrl);
  return {
    id: safe.id,
    language: safe.language,
    title: localized(safe.title),
    excerpt: localized(safe.subtitle ?? safe.summary),
    category: category(safe.primaryCategory?.slug),
    clubIds: [...safe.teamIds],
    // No source label: either our own editorial byline or the product itself.
    authorName: localized(safe.author?.name ?? "BotolaGO"),
    publishedAt: safe.publishedAt,
    readMinutes: safe.readingTimeMinutes,
    heroGradient: fallbackGradient(safe.id),
    heroUrl: resolveMediaUrl(safe.hero, supabaseUrl),
    heroAlt: safe.hero?.alt ?? undefined,
    isLead: safe.placement === "home_lead" || safe.placement === "news_lead",
    tag: safe.tags[0] ? localized(safe.tags[0].name) : undefined,
    bodyHtml: "bodyHtml" in safe ? safe.bodyHtml : undefined,
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

export function newsArticlesForCategory(
  articles: readonly Article[],
  selectedCategory: ArticleCategory,
): Article[] {
  return articles
    .filter(
      (article) =>
        selectedCategory === "latest" ||
        selectedCategory === "for_you" ||
        article.category === selectedCategory,
    )
    .sort(
      (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
    );
}

export function selectNewsLead(
  editorialLead: ArticleCardDto | null,
  articles: readonly ArticleCardDto[],
  now = Date.now(),
): ArticleCardDto | null {
  const newest = [...articles].sort(
    (a, b) => Date.parse(b.publishedAt) - Date.parse(a.publishedAt) || a.id.localeCompare(b.id),
  )[0];
  if (!editorialLead) return newest ?? null;
  if (
    newest &&
    Date.parse(editorialLead.publishedAt) < now - 48 * 60 * 60 * 1000 &&
    Date.parse(newest.publishedAt) > Date.parse(editorialLead.publishedAt)
  ) {
    return newest;
  }
  return editorialLead;
}

/**
 * Select an edition for the reader, without hiding request failures.
 *
 * "auto" reads the requested locale and the other language so the rail is never
 * empty while the other edition has stories, but the reader's own locale always
 * wins when it has articles of its own: French readers get French headlines and
 * Arabic readers Arabic ones, by the same rule in both directions. Freshness
 * alone never overrides the locale — a fresher Arabic feed must not replace a
 * populated French one, nor the reverse. An explicit selection reads only that
 * language and is never substituted, including when it comes back empty.
 */
export async function getNewsEdition(
  repository: Pick<NewsRepository, "getFeed" | "getHomeModules">,
  preferredLanguage: NewsLanguage,
  selection: NewsLanguageSelection,
  requestContext: RepositoryContext,
  now = Date.now(),
  limit = 50,
): Promise<NewsEdition> {
  const languages: NewsLanguage[] =
    selection === "auto"
      ? [preferredLanguage, preferredLanguage === "fr" ? "ar" : "fr"]
      : [selection];
  const feeds = await Promise.all(
    languages.map(async (language) => ({
      language,
      page: await repository.getFeed({ language, limit }, requestContext),
    })),
  );
  // `languages[0]` is the requested locale; later entries are fallbacks in order.
  // With every feed empty the requested locale still owns the empty state, so it
  // keeps the reader's own language and direction.
  const selected = feeds.find((feed) => feed.page.items.length > 0) ?? feeds[0];
  const modules = await repository.getHomeModules(selected.language, 8, requestContext);
  const lead = selectNewsLead(modules.lead, selected.page.items, now);
  return {
    language: selected.language,
    articles: newsArticlesForCategory(
      selected.page.items.map((article) => presentArticle(article)),
      "latest",
    ),
    lead: lead ? presentArticle(lead) : null,
  };
}

export async function getArticleWithLanguageFallback(
  repository: Pick<NewsRepository, "getArticle">,
  identifier: string,
  language: NewsLanguage,
  requestContext: RepositoryContext,
): Promise<ArticleDetailDto> {
  // Every article-detail read in the product goes through here -- the route
  // loader (which feeds `buildArticleHead`, and with it the JSON-LD block),
  // the client query and `newsService.getArticle`. Sanitizing at this single
  // seam is what keeps third-party attribution out of the rendered byline,
  // the hero, the body and the structured data alike.
  try {
    return sanitizeArticleAttribution(
      await repository.getArticle(identifier, language, requestContext),
    );
  } catch (error) {
    // Edition UUID links remain readable when shared with a viewer in the other locale.
    // Slugs are language-specific; operational and authorization failures must surface.
    if (
      !(error instanceof NewsError) ||
      error.code !== "article_not_found" ||
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(identifier)
    ) {
      throw error;
    }
    return sanitizeArticleAttribution(
      await repository.getArticle(identifier, language === "fr" ? "ar" : "fr", requestContext),
    );
  }
}

export const newsService = {
  async getEdition(language: NewsLanguage, selection: NewsLanguageSelection = "auto") {
    // The home preview renders three stories, not two full 50-story feeds.
    return getNewsEdition(getNewsRepository(), language, selection, context(), Date.now(), 3);
  },

  async getHome(language: NewsLanguage) {
    const modules = await getNewsRepository().getHomeModules(language, 8, context());
    const lead = selectNewsLead(modules.lead, modules.latest);
    return {
      lead: lead ? presentArticle(lead) : null,
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
    return presentArticle(
      await getArticleWithLanguageFallback(getNewsRepository(), identifier, language, context()),
    );
  },

  async getRelated(articleId: string, _language: NewsLanguage): Promise<Article[]> {
    return (await getNewsRepository().getRelated(articleId, 6, context())).map((article) =>
      presentArticle(article),
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
