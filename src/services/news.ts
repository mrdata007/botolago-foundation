import { requireMock } from "@/backend/errors";
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
import { encodeSavedCursor, SupabaseNewsRepository } from "@/backend/news/supabase-repository";
import type { SavedEntry } from "@/lib/saved-collection";
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

const mockRepository =
  import.meta.env.VITE_NEWS_DATA_MODE === "supabase" ? undefined : new MockNewsRepository();
const supabaseRepository = new SupabaseNewsRepository();

export function getNewsDataMode(): NewsDataMode {
  return selectNewsDataMode(import.meta.env.VITE_NEWS_DATA_MODE, import.meta.env.PROD);
}

export function getNewsRepository(): NewsRepository {
  return getNewsDataMode() === "supabase"
    ? supabaseRepository
    : requireMock(mockRepository, "News");
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
 *   - for a third-party story, every off-site anchor in `bodyHtml` loses its
 *     link, and the one that is the SOURCE CREDIT loses its text with it.
 *     Measuring the rendered DOM is what showed why: unwrapping left the words
 *     "read the original on <source>" behind, which is attribution in its own
 *     right. An anchor that is not a credit ("la signature du joueur") is
 *     reporting: it is unwrapped, so the sentence keeps its words. What
 *     counts as a credit is `isAttributionAnchor`. Anchors that are not
 *     absolute URLs (our own relative links) are unwrapped as well.
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
 * How an anchor's text reads when it is a source credit rather than reporting.
 *
 * Written generically and naming no provider (see the rule above). Every
 * pattern is anchored to the WHOLE text of the anchor and bounded in length:
 * "Read the original article" is a credit, "will see more investment" and
 * "قال المصدر" ("the source said") are sentences. French, Arabic and English,
 * since the machine-ingested stubs come in all three. Matched
 * case-insensitively.
 */
const MORE_WORDS = String.raw`(?:\s+\S+){0,3}`;
const ATTRIBUTION_TEXT = new RegExp(
  [
    // "Lire l'original (sur X)", "Lire la suite", "Consulter l'article complet".
    String.raw`^\s*(?:lire|lisez|voir|consulter|découvrir|poursuivre)\b[^<]{0,30}?\b(?:l['’]?\s?original|l['’]?\s?article(?: original| complet)?|la suite|suite|source)(?:\s+(?:sur|chez|à|via)\b.{0,40})?[\s.»…→>]*$`,
    String.raw`^\s*(?:article original|suite sur\b.{0,40})\s*$`,
    // "Source", "Source : X", "via X".
    String.raw`^\s*source\s*(?::\s*\S+${MORE_WORDS})?\s*$`,
    String.raw`^\s*via\s*:?\s*\S+${MORE_WORDS}\s*$|^\s*via\s*$`,
    // "Read the original (article) (on X)", "Continue reading", "Read more".
    String.raw`^\s*(?:read|continue reading|view|see)\b[^<]{0,30}?\b(?:original(?: article| story| post)?|full (?:article|story)|more|source|here)(?:\s+(?:on|at|from|via)\b.{0,40})?[\s.»…→>]*$`,
    String.raw`^\s*(?:the\s+)?original (?:article|story|post|source)\s*$`,
    String.raw`^\s*(?:click here|read more|continue reading|read on|lire la suite)\s*$`,
    // Arabic: "اقرأ الأصل", "قراءة المزيد", "المصدر (: X)", "المقال الأصلي".
    String.raw`^\s*(?:اقرأ|إقرأ)\s+(?:الأصل|المزيد|المقال الأصلي|الخبر الأصلي|المقال كاملا|الخبر كاملا|المقال كاملاً|الخبر كاملاً)${MORE_WORDS}\s*$`,
    String.raw`^\s*(?:قراءة المزيد|المقال الأصلي|الخبر الأصلي)${MORE_WORDS}\s*$`,
    String.raw`^\s*المصدر\s*(?::\s*\S+${MORE_WORDS})?\s*$`,
    String.raw`^\s*المزيد على\s+\S+${MORE_WORDS}\s*$`,
  ].join("|"),
  "i",
);

/** A bare web address as anchor text, with or without its scheme. */
const BARE_ADDRESS =
  /^(?:https?:\/\/\S+|www\.\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}(?:\/\S*)?)$/i;

/** The text of an anchor as a reader sees it: tags dropped, entities decoded, spaces folded. */
function visibleText(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&nbsp;/gi, " ")
    .replace(/&#x27;|&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/&amp;/gi, "&")
    .replace(/\s+/g, " ")
    .trim();
}

/** Letters and digits only, lowercased: for finding a name inside another text. */
function squash(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLocaleLowerCase();
}

/** A host without its "www.", lowercased; `null` for anything unreadable. */
function hostOf(address: string | null | undefined): string | null {
  if (!address) return null;
  try {
    return new URL(address.replace(/&amp;/g, "&").trim()).hostname
      .replace(/^www\./i, "")
      .toLowerCase();
  } catch {
    return null;
  }
}

/** What the story says about its own source, for telling a credit from reporting. */
interface StorySource {
  /** The publisher's and the licensed source's names. */
  readonly names: readonly string[];
  /** The host of the licensed source's address, when it has one. */
  readonly host: string | null;
}

/**
 * Whether an off-site anchor is the story's source credit, to be removed with
 * its words, rather than a phrase of the reporting that happens to be linked.
 *
 * It is a credit when its text is empty, is itself a web address, reads like
 * "read the original" (`ATTRIBUTION_TEXT`), or names the story's own source
 * (the publisher or licensed source the DTO carries). It is also one when it
 * is named after the site it points at AND that site is the story's licensed
 * source. Naming the site it points at is not enough on its own, wherever the
 * anchor sits: "sanctionné par <a href="fifa.com">la FIFA</a>." and "Le
 * <a href="wydad.ma">Wydad</a> a annoncé" are reporting that happens to link
 * the body they name. Anything else -- "la signature du joueur" -- is the
 * article's own wording.
 */
function isAttributionAnchor(href: string, text: string, source: StorySource): boolean {
  if (text === "") return true;
  if (BARE_ADDRESS.test(text)) return true;
  if (ATTRIBUTION_TEXT.test(text)) return true;
  const squashed = squash(text);
  if (squashed === "") return true;
  const named = source.names.map(squash).filter((name) => name.length >= 3);
  if (named.some((name) => squashed.includes(name))) return true;
  const host = hostOf(href);
  if (host === null) return false;
  // "elbotola" from www.elbotola.com: the site's own name, whatever it is.
  const labels = host.split(".");
  const site = squash(labels.length > 1 ? labels[labels.length - 2]! : labels[0]!);
  if (site.length < 4 || !squashed.includes(site)) return false;
  return host === source.host;
}

/**
 * Removes every off-site link from a third-party story and keeps the words.
 *
 * An anchor that is the story's source credit goes with its text: unwrapping
 * "Lire l'original sur <source>" would leave attribution behind. Every other
 * anchor -- off-site or not -- is unwrapped to its text, so removing a link
 * never removes the reporting that was linked ("Le club a confirmé <a>la
 * signature du joueur</a>." stays a sentence). Anchors nested in one another
 * (which the sanitizer should not let through) are settled innermost first.
 *
 * The body HTML is already sanitized server-side (`src/backend/news/
 * sanitizer.ts`), so this operates on a known-narrow tag set; it is an
 * editorial-policy pass, not a security boundary.
 */
function removeOutboundLinks(html: string, source: StorySource): string {
  // An anchor with no other anchor opening inside it: the innermost first.
  const innermost = /<a\b([^>]*)>((?:(?!<a\b)[\s\S])*?)<\/a\s*>/gi;
  let current = html;
  for (let pass = 0; pass < 8; pass++) {
    const next = current.replace(
      innermost,
      (_anchor: string, attributes: string, inner: string) => {
        const match = /\bhref\s*=\s*"([^"]*)"|\bhref\s*=\s*'([^']*)'/i.exec(attributes);
        const href = match?.[1] ?? match?.[2] ?? "";
        if (!/^https?:\/\//i.test(href.trim())) return inner;
        return isAttributionAnchor(href, visibleText(inner), source) ? "" : inner;
      },
    );
    if (next === current) break;
    current = next;
  }
  return current
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
        ? removeOutboundLinks(sanitized.bodyHtml, {
            names: [
              publisherName,
              "source" in sanitized ? sanitized.source?.name : undefined,
            ].filter((name): name is string => typeof name === "string" && name.trim() !== ""),
            host: hostOf("source" in sanitized ? sanitized.source?.url : null),
          })
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
    isSaved: safe.isSaved,
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
    crestUrl: resolveMediaUrl({ sourceUrl: team.crestUrl, storagePath: team.crestPath }),
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

const EDITION_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * The test `api.news_article_detail` applies before reading an identifier as an
 * edition id (lower-case RFC 4122, versions 1-5); anything else it reads as a
 * slug, so only an identifier that passes this one can have been swapped.
 */
const DATABASE_EDITION_ID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
      !EDITION_ID_PATTERN.test(identifier)
    ) {
      throw error;
    }
    return sanitizeArticleAttribution(
      await repository.getArticle(identifier, language === "fr" ? "ar" : "fr", requestContext),
    );
  }
}

/**
 * The article a permalink names: `/news/<edition id>` is that edition, in its
 * own language, whatever language the reader browses in.
 *
 * `api.news_article_detail` answers an edition id asked for in the other
 * language with the requested language's edition of the same story
 * (migration 20261011170000). The article page asks in French on the server,
 * so every Arabic edition with a French counterpart rendered the French text
 * and declared the French URL canonical: Google could not index the Arabic
 * edition and its hreflang pair pointed at a page saying it was French
 * (about 1,900 sitemap URLs, measured 2026-10-26). Asking again in the other
 * language returns the named edition itself. The reader still finds the
 * other edition through the page's translation link.
 */
export async function getArticleByPermalink(
  repository: Pick<NewsRepository, "getArticle">,
  identifier: string,
  language: NewsLanguage,
  requestContext: RepositoryContext,
): Promise<ArticleDetailDto> {
  const article = await getArticleWithLanguageFallback(
    repository,
    identifier,
    language,
    requestContext,
  );
  if (!DATABASE_EDITION_ID_PATTERN.test(identifier) || article.id === identifier) {
    return article;
  }
  return sanitizeArticleAttribution(
    await repository.getArticle(
      identifier,
      article.language === "fr" ? "ar" : "fr",
      requestContext,
    ),
  );
}

/** The server caps a page of the saved list at 50 (`api.news_saved_articles`). */
export const SAVED_PAGE_SIZE = 50;
/** A runaway guard for `collectSavedIds`: 40 pages is 2,000 saved stories. */
const SAVED_IDS_MAX_PAGES = 40;
/** The most saved ids the app reads (2,000); a longer list is reported as incomplete. */
export const SAVED_IDS_LIMIT = SAVED_PAGE_SIZE * SAVED_IDS_MAX_PAGES;

/**
 * The saved story ids and whether they are all of them. `complete: false`
 * means the reader has more saves than the app reads: `ids` is then the newest
 * `SAVED_IDS_LIMIT`, and no caller may treat a missing id as "not saved".
 */
export interface SavedIds {
  ids: string[];
  complete: boolean;
}

/**
 * Every story id the reader has saved, across all pages, up to
 * `SAVED_IDS_LIMIT`. The save toggles and the Profile count read this; it used
 * to ask for one page of "100" that the server cut to 50, so the 51st saved
 * story looked unsaved (its bookmark offered "Enregistrer" again) and was
 * missing from the count.
 *
 * Past the limit it says so (`complete: false`) rather than returning the
 * first 2,000 as if they were the whole list.
 */
export async function collectSavedIds(
  repository: Pick<NewsRepository, "getSaved">,
  requestContext: RepositoryContext,
): Promise<SavedIds> {
  const ids = new Set<string>();
  const seenCursors = new Set<string>();
  let cursor: string | null = null;
  for (let page = 0; page < SAVED_IDS_MAX_PAGES; page += 1) {
    const result = await repository.getSaved(SAVED_PAGE_SIZE, requestContext, cursor);
    for (const item of result.items) ids.add(item.id);
    cursor = encodeSavedCursor(result.nextCursor);
    // A cursor seen before would loop forever on the same page.
    if (!cursor) return { ids: [...ids], complete: true };
    // A repeated cursor means the rest of the list could not be read.
    if (seenCursors.has(cursor)) return { ids: [...ids], complete: false };
    seenCursors.add(cursor);
  }
  console.warn(
    `[news] saved ids stopped at ${SAVED_IDS_MAX_PAGES} pages (${ids.size} ids); the list is longer.`,
  );
  return { ids: [...ids], complete: false };
}

/**
 * Whether the signed-in reader has saved one story, asked of the server (every
 * article the News API returns carries `isSaved` for the caller). Used when the
 * saved ids are only the newest 2,000 and so cannot answer.
 */
export async function readArticleSavedState(
  repository: Pick<NewsRepository, "getArticle">,
  articleId: string,
  language: NewsLanguage,
  requestContext: RepositoryContext,
): Promise<boolean> {
  const first = await getArticleWithLanguageFallback(
    repository,
    articleId,
    language,
    requestContext,
  );
  // The server answers an edition id asked in the other language with that
  // language's sibling edition, a different row with its own saved state. Only
  // an answer for the very edition asked about may decide a save or a removal.
  if (first.id === articleId) return first.isSaved;
  const second = await repository.getArticle(
    articleId,
    language === "fr" ? "ar" : "fr",
    requestContext,
  );
  if (second.id === articleId) return second.isSaved;
  throw new NewsError("data_unavailable", "The saved state of this article could not be read.");
}

/** One page of the saved collection, as rows, plus the cursor of the next. */
export async function getSavedEntriesPage(
  repository: Pick<NewsRepository, "getSaved">,
  cursor: string | null,
  requestContext: RepositoryContext,
): Promise<{ entries: SavedEntry[]; nextCursor: string | null }> {
  const page = await repository.getSaved(SAVED_PAGE_SIZE, requestContext, cursor);
  return {
    entries: page.items.map((item) => ({ kind: "article", article: presentArticle(item) })),
    nextCursor: encodeSavedCursor(page.nextCursor),
  };
}

/**
 * Rows for a list of saved ids the device holds (preview mode only; in
 * production the server holds the list and drops what is gone, see
 * `api.news_saved_articles`). An id whose story no longer exists becomes an
 * `unavailable` row the reader can remove; any other failure is a failure and
 * is thrown, so the page shows an error with a retry rather than a shorter list.
 */
export async function resolveSavedIds(
  repository: Pick<NewsRepository, "getArticle">,
  ids: readonly string[],
  language: NewsLanguage,
  requestContext: RepositoryContext,
): Promise<SavedEntry[]> {
  return Promise.all(
    ids.map(async (id): Promise<SavedEntry> => {
      try {
        const article = await getArticleWithLanguageFallback(
          repository,
          id,
          language,
          requestContext,
        );
        return { kind: "article", article: presentArticle(article) };
      } catch (error) {
        if (error instanceof NewsError && error.code === "article_not_found") {
          return { kind: "unavailable", id };
        }
        throw error;
      }
    }),
  );
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

  async getSavedIds(): Promise<SavedIds> {
    return collectSavedIds(getNewsRepository(), context());
  },

  /** Whether one story is saved, per the server (see `readArticleSavedState`). */
  async isArticleSaved(articleId: string, language: NewsLanguage): Promise<boolean> {
    return readArticleSavedState(getNewsRepository(), articleId, language, context());
  },

  /** A page of the signed-in reader's collection (production). */
  async getSavedEntries(cursor: string | null) {
    return getSavedEntriesPage(getNewsRepository(), cursor, context());
  },

  /** The collection for ids the device holds (preview mode). */
  async resolveSavedIds(ids: readonly string[], language: NewsLanguage) {
    return resolveSavedIds(getNewsRepository(), ids, language, context());
  },

  async save(articleId: string): Promise<void> {
    await getNewsRepository().save(articleId, context());
  },

  async unsave(articleId: string): Promise<void> {
    await getNewsRepository().unsave(articleId, context());
  },
};
