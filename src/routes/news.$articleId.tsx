import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowLeft, ArrowRight, Clock, Share2 } from "lucide-react";
import { newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { SavedButton } from "@/components/news/SavedButton";
import { LoadingState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { formatFullDate, formatRelativeTime } from "@/lib/format-time";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/news/$articleId")({
  component: ArticlePage,
});

function ArticlePage() {
  const { articleId } = Route.useParams();
  const { t, tr, lang, dir } = useI18n();
  const router = useRouter();
  const [copied, setCopied] = useState(false);

  const articleQ = useQuery({
    queryKey: ["news", "article", lang, articleId],
    queryFn: () => newsService.getArticle(articleId, lang),
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

  const clubs = clubsQ.data ?? [];
  const clubNames = article.clubIds
    .map((id) => clubs.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => tr(c!.shortName));

  const BackArrow = dir === "rtl" ? ArrowRight : ArrowLeft;
  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({
          title: tr(article.title),
          text: tr(article.excerpt),
          url,
        });
        return;
      }
    } catch {
      /* user cancelled or blocked */
    }
    try {
      await navigator.clipboard.writeText(url);
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
          onClick={() => router.history.back()}
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
      <div className="mt-4 overflow-hidden rounded-[var(--radius-hero)] border border-[var(--border-subtle)] shadow-card">
        <div
          className="aspect-[16/10] w-full animate-in fade-in duration-500"
          style={
            article.heroUrl
              ? {
                  backgroundImage: `url(${article.heroUrl})`,
                  backgroundSize: "cover",
                  backgroundPosition: "center",
                }
              : { background: article.heroGradient }
          }
          role="img"
          aria-label={tr(article.title)}
        />
      </div>

      {/* Article surface — a calmer L1 elevated reading card sitting on the news mesh */}
      <article
        className={cn(
          "relative mt-4 rounded-[var(--radius-hero)] border border-[var(--border-subtle)]",
          "bg-[color:var(--background-elevated)] shadow-card",
          "px-4 py-5 sm:px-6 sm:py-7",
          "animate-in fade-in-0 slide-in-from-bottom-1 duration-500 ease-out",
        )}
      >
        {/* Category eyebrow */}
        {article.tag && (
          <div className="mb-2 inline-flex items-center gap-1.5">
            <span aria-hidden className="h-3 w-0.5 rounded-full bg-[color:var(--brand-accent)]" />
            <span className="text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
              {tr(article.tag)}
            </span>
          </div>
        )}

        {/* Headline */}
        <h1
          className={cn(
            "text-[26px] font-black leading-[1.12] tracking-tight text-foreground sm:text-[30px]",
            lang === "ar" && "leading-[1.35]",
          )}
        >
          {tr(article.title)}
        </h1>

        {/* Deck / subtitle */}
        <p
          className={cn(
            "mt-3 text-[15px] leading-relaxed text-[color:var(--text-secondary)] sm:text-base",
            lang === "ar" && "text-[16px] leading-[1.85]",
          )}
        >
          {tr(article.excerpt)}
        </p>

        {/* Byline */}
        <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 border-y border-[var(--border-subtle)] py-3 text-xs text-[color:var(--text-muted)]">
          <span className="font-semibold text-foreground">
            {t("article.by")} {tr(article.authorName)}
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
          <span title={formatFullDate(article.publishedAt, lang)}>
            {t("article.published")} {formatRelativeTime(article.publishedAt, lang)}
          </span>
          <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3.5 w-3.5" aria-hidden />
            {article.readMinutes} {t("news.read_min")}
          </span>
          {clubNames.length > 0 && (
            <>
              <span className="h-1 w-1 rounded-full bg-[color:var(--text-muted)]/50" aria-hidden />
              <span className="truncate">{clubNames.join(" · ")}</span>
            </>
          )}
        </div>

        {/* Body */}
        <div
          className={cn(
            "mt-5 max-w-[68ch] space-y-4 text-[16px] leading-[1.75] text-foreground/90",
            lang === "ar" && "text-[17px] leading-[2]",
          )}
        >
          <div dangerouslySetInnerHTML={{ __html: article.bodyHtml ?? "" }} />
        </div>
      </article>

      {/* Related */}
      {related.length > 0 && (
        <Section index={1}>
          <SectionHeader title={t("article.related")} eyebrow={t("article.related")} />
          <div className="grid gap-2.5">
            {related.map((a) => (
              <ArticleCard key={a.id} article={a} variant="horizontal" />
            ))}
          </div>
        </Section>
      )}
    </AppShell>
  );
}
