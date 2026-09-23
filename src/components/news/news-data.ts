import type { ArticleCardDto } from "@/backend/news/contracts";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { presentArticle } from "@/services/news";
import type { Article } from "@/types/domain";
import type { TranslationKey } from "@/i18n/dictionaries";

/**
 * Pure, dependency-free helpers backing the /news landing page and article
 * page. Kept out of route components so they can be unit-tested without a
 * DOM/router harness (this codebase has no React component-test setup — see
 * the BG-0012 builder report for the rationale).
 */

/** A stable, non-authenticated context for reading public News RPCs directly
 * through the shared `NewsRepository` contract (its Supabase implementation
 * ignores this value entirely; it exists to satisfy the shared interface). */
export function publicNewsContext(): RepositoryContext {
  return {
    actorId: null,
    requestId: globalThis.crypto?.randomUUID?.() ?? `news-ui-${Date.now().toString(36)}`,
  };
}

export interface CategoryOption {
  slug: string;
  name: string;
}

/**
 * A category's label in the reader's language. The taxonomy's own `name` can
 * be the raw slug ("for_you", "latest"), which then showed on the chips and
 * the article eyebrow as-is, in English, in both languages. The five shipped
 * slugs take the dictionary's label; anything else keeps the name it came
 * with. Each key is a literal call so the i18n gate can see it (W4).
 */
export function categoryLabel(
  category: CategoryOption,
  t: (key: TranslationKey) => string,
): string {
  switch (category.slug) {
    case "for_you":
      return t("news.tab.for_you");
    case "latest":
      return t("news.tab.latest");
    case "transfers":
      return t("news.tab.transfers");
    case "analysis":
      return t("news.tab.analysis");
    case "interviews":
      return t("news.tab.interviews");
    default:
      return category.name;
  }
}

/**
 * Derives the real, currently-populated category list from whatever article
 * cards are on hand (home modules + a feed sample), instead of a hardcoded
 * tab list or a fabricated taxonomy. `NewsRepository` does not currently
 * expose a dedicated taxonomies method, so this is the closest in-boundary
 * approximation of `api.news_taxonomies(language, 'category')`: any category
 * with zero currently-visible articles will not appear until that RPC is
 * wired into the shared repository contract (owned by the backend builder).
 */
export function deriveCategoryOptions(
  sources: readonly (readonly ArticleCardDto[])[],
): CategoryOption[] {
  const bySlug = new Map<string, string>();
  for (const list of sources) {
    for (const article of list) {
      const category = article.primaryCategory;
      if (category && !bySlug.has(category.slug)) bySlug.set(category.slug, category.name);
    }
  }
  return [...bySlug.entries()]
    .map(([slug, name]) => ({ slug, name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

const GRADIENT_TOKENS = [
  "--news-gradient-hero",
  "--news-gradient-ocean",
  "--news-gradient-matchday",
  "--news-gradient-aqua",
  "--news-gradient-dark",
  "--news-gradient-promo",
] as const;

/** Deterministically cycles through the brand gradient tokens for image-less
 * cards, so the same article always renders the same placeholder. */
export function gradientTokenForId(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  return `var(${GRADIENT_TOKENS[hash % GRADIENT_TOKENS.length]})`;
}

/** `presentArticle` picks its own two-tone gradient fallback; News landing
 * surfaces use the BotolaGO brand gradient tokens instead for a no-image
 * card, so this overrides that field after presentation. */
export function presentArticleForDisplay(dto: ArticleCardDto): Article {
  return { ...presentArticle(dto), heroGradient: gradientTokenForId(dto.id) };
}

export type FeaturedTreatment = "hero" | "row" | "compact";

/** Editorial rhythm for the "Top stories" rail: first item large with image,
 * next couple as compact text-led rows, the rest as smaller image cards. */
export function featuredTreatmentForIndex(index: number): FeaturedTreatment {
  if (index === 0) return "hero";
  if (index <= 2) return "compact";
  return "row";
}

export type PlacementKind = ArticleCardDto["placement"];

/** Only `breaking` gets a distinct visual badge today; other placement kinds
 * (editors_pick, trending, featured, home_lead, news_lead) already drive
 * section membership and are not further badged to avoid label noise. */
export function isBreaking(placement: PlacementKind): boolean {
  return placement === "breaking";
}

export interface ArticleCursor {
  publishedAt: string;
  id: string;
}

/** Appends a new feed page's items to an accumulated list, de-duplicating by
 * id (defensive against an overlapping cursor boundary or a refetch). */
export function appendFeedPage(
  accumulated: readonly ArticleCardDto[],
  page: readonly ArticleCardDto[],
): ArticleCardDto[] {
  const seen = new Set(accumulated.map((article) => article.id));
  const merged = [...accumulated];
  for (const article of page) {
    if (seen.has(article.id)) continue;
    seen.add(article.id);
    merged.push(article);
  }
  return merged;
}

/** Normalizes a language selection into the router's expected dir attribute. */
export function dirFor(language: "fr" | "ar"): "ltr" | "rtl" {
  return language === "ar" ? "rtl" : "ltr";
}
