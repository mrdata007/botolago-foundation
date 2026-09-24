import type { ArticleCardDto, NewsTeamFilterDto } from "@/backend/news/contracts";
import type { RepositoryContext } from "@/backend/contracts/repository";
import { presentArticle } from "@/services/news";
import type { Article, ArticleCategory, Club } from "@/types/domain";
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

/**
 * A News team filter as the `Club` the News screens colour their cards,
 * chips and crests from.
 *
 * The News service presents the same rows for its team filter, but its
 * `presentTeam` (`src/services/news.ts`) replaces a missing `primary_color` —
 * every production club, BG-0112 — with a literal navy. `clubPalette` takes a real hex as the club's own colour
 * ahead of the kit table (`src/lib/club-palette.ts`), so on News every club
 * painted that one navy. Here a missing colour stays missing (an empty
 * string, which is not a hex), and the palette falls through to the kit
 * table, as it already does for the football clubs, whose presenter leaves
 * `var(--ui-ink)` there. A real colour in the data is kept and wins, as the
 * palette's source order says it should.
 */
export function presentNewsTeam(team: NewsTeamFilterDto): Club {
  return {
    id: team.id,
    slug: team.slug,
    name: { fr: team.name, ar: team.name },
    shortName: { fr: team.shortName, ar: team.shortName },
    city: { fr: team.city ?? "", ar: team.city ?? "" },
    primaryColor: team.primaryColor ?? "",
    secondaryColor: team.secondaryColor ?? undefined,
    crestPlaceholder: team.code ?? team.shortName.slice(0, 3).toUpperCase(),
  };
}

/**
 * The category's plate colour (`--news-plate-*`, the ground of the branded
 * hero plate) as the 4px inline-start edge of an Option A news row, for an
 * article that names no club — a club's row takes the club's edge from
 * `clubStyle`. Spelled out per category because Tailwind only generates the
 * class names it can read.
 *
 * Light only: the plates measure 9.1–11.4:1 against the light card surface
 * but 1.15–1.31:1 against the dark one, where the edge would vanish — so in
 * dark it is the brand foreground, the edge a club-less `ui.edge.start`
 * draws.
 */
const PLATE_EDGE: Record<ArticleCategory, string> = {
  for_you: "border-s-[color:var(--news-plate-for-you)]",
  latest: "border-s-[color:var(--news-plate-latest)]",
  transfers: "border-s-[color:var(--news-plate-transfers)]",
  analysis: "border-s-[color:var(--news-plate-analysis)]",
  interviews: "border-s-[color:var(--news-plate-interviews)]",
};

export function plateEdgeClass(category: ArticleCategory): string {
  return `border-s-4 ${PLATE_EDGE[category]} dark:border-s-[color:var(--ui-ink-fg)]`;
}

/**
 * The clubs an article names, in the ARTICLE's order — the first one colours
 * the card's edge — looked up in the club directory. An id the directory does
 * not know is skipped rather than guessed at.
 */
export function clubsForArticle(clubIds: readonly string[], clubs: readonly Club[]): Club[] {
  const byId = new Map(clubs.map((club) => [club.id, club]));
  return clubIds.flatMap((id) => {
    const club = byId.get(id);
    return club ? [club] : [];
  });
}

/** Arabic script: its letters join, so two of them side by side read as a word. */
const ARABIC_SCRIPT = /\p{Script=Arabic}/u;

/**
 * The initials in the byline disc: "Youssef Amrani" → "YA", the first letter
 * of the first and of the last word. A name in Arabic script gets its first
 * letter only — two Arabic letters written together join into what reads as
 * a word, not as two initials. Empty for an empty name.
 */
export function bylineInitials(name: string): string {
  const words = name.trim().split(/\s+/u).filter(Boolean);
  if (words.length === 0) return "";
  const first = (word: string) => Array.from(word)[0] ?? "";
  if (ARABIC_SCRIPT.test(words[0])) return first(words[0]);
  const initials =
    words.length > 1 ? first(words[0]) + first(words[words.length - 1]) : first(words[0]);
  return initials.toLocaleUpperCase("fr");
}

/**
 * The article's date without the time, in the reader's language —
 * "23 sept. 2026" / "23 شتنبر 2026" (ar-MA: Moroccan month names, Latin
 * digits, like every other date in the product). Empty for an invalid date.
 */
export function formatArticleDate(iso: string, lang: "fr" | "ar"): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(date);
}
