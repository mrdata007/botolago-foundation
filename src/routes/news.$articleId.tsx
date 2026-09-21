import { createFileRoute, Link } from "@tanstack/react-router";
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
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { formatFullDate, formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";
import { MediaImage } from "@/components/common/FailureAwareImage";
import { resolveMediaUrl } from "@/lib/media";
import { buildArticleHead, buildCanonicalArticleUrl } from "@/lib/article-meta";
import { gradientTokenForId, publicNewsContext } from "@/components/news/news-data";

export const Route = createFileRoute("/news/$articleId")({
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
        <div className="mt-8 rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--surface)] p-6 text-center">
          <h1 className="text-lg font-black text-foreground">{t("article.not_found_title")}</h1>
          <p className="mt-2 text-sm text-[color:var(--text-secondary)]">
            {t("article.not_found_desc")}
          </p>
          <Link
            to="/news"
            className="mt-4 inline-flex min-h-11 items-center justify-center gap-1.5 rounded-lg cta-brand px-4 text-sm font-semibold"
          >
            {t("article.back")}
          </Link>
        </div>
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
            "inline-flex h-11 items-center gap-1.5 rounded-full px-3 text-sm font-semibold text-foreground",
            "bg-[color:var(--surface-glass-strong)] backdrop-blur-md",
            "border border-[var(--glass-border)] shadow-subtle",
            "hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
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
            className="inline-flex h-11 w-11 items-center justify-center rounded-full text-foreground hover:bg-[color:var(--surface-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]"
          >
            <Share2 className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </div>

      {copied && (
        <div
          role="status"
          aria-live="polite"
          className="mt-2 rounded-full bg-[color:var(--brand-accent)]/10 px-3 py-1 text-center text-xs font-semibold text-[color:var(--brand-accent)]"
        >
          {t("article.share_copied")}
        </div>
      )}

      {/* Hero image */}
      <figure className="mt-4">
        <div className="overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)] shadow-card">
          <MediaImage
            src={heroUrl}
            alt={article.hero?.alt ?? article.title}
            fallback={gradientTokenForId(article.id)}
            loading="eager"
            fetchPriority="high"
            className="aspect-[16/10] w-full animate-in fade-in duration-500"
          />
        </div>
        {(article.hero?.caption || article.hero?.credit) && (
          <figcaption
            dir={contentLanguage === "ar" ? "rtl" : "ltr"}
            className="mt-1.5 text-[11px] text-[color:var(--text-muted)]"
          >
            {article.hero?.caption}
            {article.hero?.caption && article.hero?.credit ? " — " : ""}
            {article.hero?.credit}
          </figcaption>
        )}
      </figure>

      {/* Article surface — a calmer L1 elevated reading card sitting on the news mesh */}
      <article
        lang={contentLanguage}
        dir={contentLanguage === "ar" ? "rtl" : "ltr"}
        className={cn(
          "relative mt-4 rounded-[var(--radius-hero)] border border-[var(--border-subtle)]",
          "bg-[color:var(--background-elevated)] shadow-card",
          "px-4 py-5 sm:px-6 sm:py-7",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
        )}
      >
        {/* Category eyebrow */}
        {article.primaryCategory && (
          <div className="mb-2 inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-0.5 rounded-full bg-[color:var(--brand-accent)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
              {article.primaryCategory.name}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1
          className={cn(
            "text-[26px] font-black leading-[1.12] tracking-tight text-foreground sm:text-[30px]",
            contentLanguage === "ar" && "leading-[1.35]",
          )}
        >
          {article.title}
        </h1>

        {/* Deck / subtitle */}
        {(article.subtitle ?? article.summary) && (
          <p
            className={cn(
              "mt-3 text-[15px] leading-relaxed text-[color:var(--text-secondary)] sm:text-base",
              contentLanguage === "ar" && "text-[16px] leading-[1.85]",
            )}
          >
            {article.subtitle ?? article.summary}
          </p>
        )}

        {/* Byline */}
        <div
          lang={lang}
          dir={dir}
          className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-[var(--border-subtle)] py-3 text-xs text-[color:var(--text-muted)]"
        >
          {byline && (
            <>
              <span className="font-semibold text-foreground">
                {t("article.by")} {byline}
              </span>
              <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
            </>
          )}
          <span title={formatFullDate(article.publishedAt, lang)}>
            {t("article.published")} {formatRelativeTime(article.publishedAt, lang)}
          </span>
          {hasDistinctUpdate && (
            <>
              <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
              <span title={formatFullDate(article.updatedAt, lang)}>
                {t("article.updated")} {formatRelativeTime(article.updatedAt, lang)}
              </span>
            </>
          )}
          <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {article.readingTimeMinutes} {t("news.read_min")}
          </span>
          {teamNames.length > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
              <span className="truncate">{teamNames.join(" · ")}</span>
            </>
          )}
        </div>

        {/* Body — pre-sanitized server-side HTML */}
        {/* `editorial-body` styles the injected HTML itself. The previous
            `space-y-4` sat on this wrapper while every paragraph went into a
            single child, so it spaced exactly one element and the body ran
            together with no gaps at all. */}
        <div
          className={cn(
            "editorial-body mt-5 max-w-[68ch] text-[16px] leading-[1.75] text-foreground/90",
            contentLanguage === "ar" && "text-[17px] leading-[2]",
          )}
          dangerouslySetInnerHTML={{ __html: article.bodyHtml }}
        />

        {/* Topic/team tags */}
        {(topicTags.length > 0 || teamNames.length > 0) && (
          <div className="mt-5 flex flex-wrap gap-1.5 border-t border-[var(--border-subtle)] pt-4">
            {topicTags.map((tag) => (
              <span
                key={tag.id}
                className="rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-secondary)]"
              >
                {tag.name}
              </span>
            ))}
            {article.teams.map((team) => (
              <span
                key={team.id}
                className="rounded-full bg-[color:var(--surface-hover)] px-2.5 py-1 text-[11px] font-semibold text-[color:var(--text-secondary)]"
              >
                {team.name}
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
