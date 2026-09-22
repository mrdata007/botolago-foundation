import { createFileRoute, redirect } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock, Share2 } from "lucide-react";
import { getArticleWithLanguageFallback, getNewsRepository, newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SavedButton } from "@/components/news/SavedButton";
import { ErrorState, LoadingState } from "@/components/common/States";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { formatFullDate, formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { ArticleHeroFallback } from "@/components/common/ArticleHeroFallback";
import { resolveMediaUrl } from "@/lib/media";
import { buildArticleHead, buildCanonicalArticleUrl } from "@/lib/article-meta";
import { gradientTokenForId, publicNewsContext } from "@/components/news/news-data";
import { NEWS_ENABLED } from "@/lib/feature-flags";

export const Route = createFileRoute("/news/$articleId")({
  // While News is hidden (owner decision — see `@/lib/feature-flags`) article
  // permalinks redirect to Home rather than 404; the full rationale is on the
  // parent route in `news.tsx`. The parent's `beforeLoad` already redirects
  // before this route is reached, on SSR and on client navigation alike; this
  // repeat guard keeps the child honest if the route tree is ever reshaped,
  // and runs before the loader so no News RPC is issued and no article meta or
  // JSON-LD is ever built.
  beforeLoad: () => {
    if (!NEWS_ENABLED) throw redirect({ to: "/", replace: true });
  },
  loader: async ({ params, context }) => {
    try {
      return await context.queryClient.ensureQueryData({
        queryKey: ["news", "article-detail-v2", "fr", params.articleId],
        queryFn: () =>
          getArticleWithLanguageFallback(
            getNewsRepository(),
            params.articleId,
            "fr",
            publicNewsContext(),
          ),
      });
    } catch {
      return null;
    }
  },
  head: ({ loaderData, params }) => buildArticleHead(loaderData, params.articleId),
  component: ArticlePage,
});

/** The byline separator — one dot, on the rule colour so it follows the theme. */
function Dot() {
  return (
    <span
      aria-hidden
      className="h-1 w-1 rounded-full bg-[color:var(--ui-on-surface-muted)] opacity-60"
    />
  );
}

function ArticlePage() {
  const { articleId } = Route.useParams();
  const { t, lang, dir } = useI18n();
  // Articles and matches are the pages most often opened from a shared link,
  // where there is no in-app entry to go back to; fall back to the listing.
  const goBack = useBackTo("/news");
  const [copied, setCopied] = useState(false);
  const initialArticle = Route.useLoaderData();

  const articleQ = useQuery({
    queryKey: ["news", "article-detail-v2", lang, articleId],
    queryFn: () =>
      getArticleWithLanguageFallback(getNewsRepository(), articleId, lang, publicNewsContext()),
    initialData: lang === "fr" ? (initialArticle ?? undefined) : undefined,
  });
  const relatedQ = useQuery({
    queryKey: ["news", "related", lang, articleId],
    queryFn: () => newsService.getRelated(articleId, lang),
    enabled: !!articleQ.data,
  });
  const clubsQ = useQuery({
    queryKey: ["news", "team-filters", lang],
    queryFn: () => newsService.getTeamFilters(lang),
  });
  const article = articleQ.data;
  const related = relatedQ.data ?? [];

  if (articleQ.isLoading) {
    return (
      <AppShell backgroundVariant="news">
        <LoadingState />
      </AppShell>
    );
  }

  if (articleQ.isError) {
    return (
      <AppShell backgroundVariant="news">
        <div className="mt-8">
          <ErrorState onRetry={() => void articleQ.refetch()} />
        </div>
      </AppShell>
    );
  }

  if (!article) {
    return (
      <AppShell backgroundVariant="news">
        <UiCard padding="lg" className="mt-8 text-center">
          <h1 className={cn(ui.text.section, ui.tone.default)}>{t("article.not_found_title")}</h1>
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("article.not_found_desc")}
          </p>
          <UiLinkButton to="/news" variant="ink" className="mt-4">
            {t("article.back")}
          </UiLinkButton>
        </UiCard>
      </AppShell>
    );
  }

  const contentLanguage = article.language ?? lang;
  const clubs = clubsQ.data ?? [];
  const teamNames = article.teams.map((team) => team.name);
  const topicTags = article.taxonomies.filter((tax) => tax.type !== "category");
  const byline = article.author?.name ?? article.publisher?.name;
  const heroUrl = resolveMediaUrl(article.hero);
  const hasDistinctUpdate =
    !!article.updatedAt &&
    article.updatedAt !== article.publishedAt &&
    Math.abs(Date.parse(article.updatedAt) - Date.parse(article.publishedAt)) > 60_000;

  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;
  const canonicalUrl = buildCanonicalArticleUrl(article.id);
  const share = async () => {
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({
          title: article.title,
          text: article.subtitle ?? article.summary,
          url: canonicalUrl,
        });
        return;
      }
    } catch {
      /* user cancelled or blocked */
    }
    try {
      await navigator.clipboard.writeText(canonicalUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  return (
    <AppShell backgroundVariant="news">
      {/* Reading actions row */}
      <div className="mt-1 flex items-center justify-between gap-2">
        <button
          type="button"
          onClick={goBack}
          aria-label={t("article.back")}
          className={cn(
            "inline-flex items-center gap-1.5 px-3",
            ui.space.tap,
            ui.radius.control,
            ui.surface.card,
            ui.text.bodyStrong,
            ui.focus,
            "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
          )}
        >
          <BackArrow className="h-4 w-4" aria-hidden />
          <span>{t("article.back")}</span>
        </button>
        <div className="flex items-center gap-1">
          <SavedButton articleId={article.id} variant="icon" />
          <button
            type="button"
            onClick={share}
            aria-label={t("article.share")}
            className={cn(
              "inline-flex items-center justify-center",
              ui.space.tap,
              ui.radius.control,
              ui.tone.default,
              ui.focus,
              "transition-colors hover:bg-[color:var(--ui-surface-sunken)]",
            )}
          >
            <Share2 className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {copied && (
        <div
          role="status"
          aria-live="polite"
          className={cn(
            "mt-2 px-3 py-1 text-center",
            ui.radius.control,
            ui.text.meta,
            "[font-weight:var(--ui-weight-heavy)]",
            "bg-[color:color-mix(in_oklab,var(--ui-ink)_12%,transparent)]",
            ui.tone.default,
          )}
        >
          {t("article.share_copied")}
        </div>
      )}

      {/* Hero image */}
      <figure className="mt-4">
        <div
          className={cn(
            "overflow-hidden",
            ui.radius.control,
            ui.rule.all,
            "shadow-[var(--ui-shadow-card)]",
          )}
        >
          <MediaImage
            src={heroUrl}
            alt={article.hero?.alt ?? article.title}
            fallback={gradientTokenForId(article.id)}
            // Same branded plate the cards use (BG-0076): a reader who taps a
            // hero-less card must not land on a second empty block. No club
            // directory is loaded on this route, so this one is wordmark-only.
            placeholder={<ArticleHeroFallback category={article.primaryCategory?.slug} />}
            loading="eager"
            fetchPriority="high"
            className="aspect-[16/10] w-full animate-in fade-in duration-500"
          />
        </div>
        {(article.hero?.caption || article.hero?.credit) && (
          <figcaption
            dir={contentLanguage === "ar" ? "rtl" : "ltr"}
            className={cn("mt-1.5", ui.text.micro, ui.tone.muted)}
          >
            {article.hero?.caption}
            {article.hero?.caption && article.hero?.credit ? " — " : ""}
            {article.hero?.credit}
          </figcaption>
        )}
      </figure>

      {/* Article surface — the Fantasy card, at reading width */}
      <article
        lang={contentLanguage}
        dir={contentLanguage === "ar" ? "rtl" : "ltr"}
        className={cn(
          ui.surface.card,
          "relative mt-4 px-4 py-5 sm:px-6 sm:py-7",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
        )}
      >
        {/* Category eyebrow */}
        {article.primaryCategory && (
          <div className="mb-2 inline-flex items-center gap-1.5">
            <span
              aria-hidden
              className={cn("h-3 w-0.5", ui.radius.full, "bg-[color:var(--ui-ink)]")}
            />
            {/* `ui.text.label` letter-spaces Latin only (BG-0069). */}
            <span className={cn(ui.text.label, ui.tone.default)}>
              {article.primaryCategory.name}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1
          className={cn(ui.text.hero, ui.tone.default, contentLanguage === "ar" && "leading-snug")}
        >
          {article.title}
        </h1>

        {/* Deck / subtitle */}
        {(article.subtitle ?? article.summary) && (
          <p
            className={cn(
              "mt-3 leading-relaxed",
              ui.text.subtitle,
              "[font-weight:var(--ui-weight-body)]",
              ui.tone.muted,
              contentLanguage === "ar" && "leading-loose",
            )}
          >
            {article.subtitle ?? article.summary}
          </p>
        )}

        {/* Byline */}
        <div
          lang={lang}
          dir={dir}
          className={cn(
            "mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 py-3",
            "border-y border-[color:var(--ui-rule)]",
            ui.text.meta,
            ui.tone.muted,
          )}
        >
          {byline && (
            <>
              <span className={cn("[font-weight:var(--ui-weight-heavy)]", ui.tone.default)}>
                {t("article.by")} {byline}
              </span>
              <Dot />
            </>
          )}
          <span title={formatFullDate(article.publishedAt, lang)}>
            {t("article.published")} {formatRelativeTime(article.publishedAt, lang)}
          </span>
          {hasDistinctUpdate && (
            <>
              <Dot />
              <span title={formatFullDate(article.updatedAt, lang)}>
                {t("article.updated")} {formatRelativeTime(article.updatedAt, lang)}
              </span>
            </>
          )}
          <Dot />
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {article.readingTimeMinutes} {t("news.read_min")}
          </span>
          {teamNames.length > 0 && (
            <>
              <Dot />
              <span className="truncate">{teamNames.join(" · ")}</span>
            </>
          )}
        </div>

        {/* The same story in the other language, when that edition is public
            (the API lists no other kind). Its label is written in the target
            language, so a reader who cannot read this page can still find it. */}
        {(article.translations ?? []).map((translation) => (
          <UiLinkButton
            key={translation.id}
            to="/news/$articleId"
            params={{ articleId: translation.id }}
            variant="outline"
            size="sm"
            className="mt-4"
            lang={translation.language}
            dir={translation.language === "ar" ? "rtl" : "ltr"}
            hrefLang={translation.language}
            data-testid="article-translation-link"
          >
            {translation.language === "ar"
              ? "اقرأ هذا المقال بالعربية"
              : "Lire cet article en français"}
          </UiLinkButton>
        ))}

        {/* Body — pre-sanitized server-side HTML */}
        {/* `editorial-body` styles the injected HTML itself. The previous
            `space-y-4` sat on this wrapper while every paragraph went into a
            single child, so it spaced exactly one element and the body ran
            together with no gaps at all. Sizes come from the type scale —
            reading copy is one step up from body, and Arabic one more, which
            is the same relationship the rest of the product uses. */}
        <div
          className={cn(
            "editorial-body mt-5 max-w-[68ch] leading-[1.75]",
            ui.text.subtitle,
            "[font-weight:var(--ui-weight-body)]",
            ui.tone.default,
            contentLanguage === "ar" && "text-[length:var(--ui-text-section)] leading-loose",
          )}
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />

        {/* Topic/team tags — 6px chips, the language's control radius */}
        {(topicTags.length > 0 || teamNames.length > 0) && (
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-[color:var(--ui-rule)] pt-4">
            {[
              ...topicTags.map((tag) => ({ key: `topic-${tag.id}`, name: tag.name })),
              ...article.teams.map((team) => ({ key: `team-${team.id}`, name: team.name })),
            ].map((chip) => (
              <span
                key={chip.key}
                className={cn(
                  "inline-flex items-center px-2.5 py-1",
                  ui.radius.control,
                  ui.text.meta,
                  "[font-weight:var(--ui-weight-strong)]",
                  ui.surface.sunken,
                  ui.tone.muted,
                )}
              >
                {chip.name}
              </span>
            ))}
          </div>
        )}
      </article>

      {/* Related */}
      {related.length > 0 && (
        <Section index={1}>
          <SectionHeader title={t("article.related")} eyebrow={t("article.related")} />
          <div className="grid gap-2.5">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} variant="horizontal" clubs={clubs} />
            ))}
          </div>
        </Section>
      )}
    </AppShell>
  );
}
