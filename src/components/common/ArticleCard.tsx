import { useState } from "react";
import { Bookmark, BookmarkCheck, Clock } from "lucide-react";
import type { Article } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Article card.
 *
 * Editorial personality: image-first, elegant metadata, softer overlay,
 * refined typography. Three variants:
 *   - `lead`     hero article with a 16:10 image, gradient overlay, chip tag
 *   - `row`      standard editorial card (default)
 *   - `compact`  media list row
 *
 * All variants respect logical text alignment for RTL and use surface
 * tokens rather than hardcoded colors.
 */
export function ArticleCard({
  article,
  variant = "row",
}: {
  article: Article;
  variant?: "row" | "lead" | "compact";
}) {
  const { tr, t, lang } = useI18n();
  const [saved, setSaved] = useState(false);

  if (variant === "lead") {
    return (
      <article
        className={cn(
          "group relative overflow-hidden rounded-[var(--radius-hero)]",
          "border border-[var(--border-subtle)] shadow-card",
          "transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          "hover:shadow-floating active:translate-y-px",
        )}
      >
        <div
          className="aspect-[16/10] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.02]"
          style={{ background: article.heroGradient }}
          aria-hidden
        />
        {/* Layered overlay: strong bottom, soft top for crest of image. */}
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/25 to-transparent"
          aria-hidden
        />
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {article.tag && (
            <span
              className={cn(
                "inline-flex items-center rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em]",
                "bg-white/95 text-[color:var(--brand-primary)] shadow-subtle backdrop-blur",
              )}
            >
              {tr(article.tag)}
            </span>
          )}
          <h3 className="mt-2.5 text-[22px] font-black leading-[1.15] tracking-tight text-white drop-shadow-md sm:text-2xl">
            {tr(article.title)}
          </h3>
          <p
            className={cn(
              "mt-1.5 line-clamp-2 text-sm text-white/85",
              lang === "ar" && "leading-relaxed",
            )}
          >
            {tr(article.excerpt)}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[11px] font-medium text-white/85">
            <span className="truncate">{tr(article.authorName)}</span>
            <span className="h-1 w-1 shrink-0 rounded-full bg-white/50" aria-hidden />
            <span className="inline-flex items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {article.readMinutes} {t("news.read_min")}
            </span>
          </div>
        </div>
      </article>
    );
  }

  if (variant === "compact") {
    return (
      <article className="surface-2-interactive flex items-center gap-3 p-3">
        <div
          className="h-14 w-14 shrink-0 rounded-xl shadow-inner"
          style={{ background: article.heroGradient }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
            {tr(article.title)}
          </h4>
          <div className="mt-1 truncate text-[11px] text-[color:var(--text-muted)]">
            {tr(article.authorName)}
          </div>
        </div>
      </article>
    );
  }

  return (
    <article
      className={cn(
        "group overflow-hidden rounded-[var(--radius-card-lg)]",
        "border border-[var(--border-subtle)] bg-[color:var(--surface)]",
        "shadow-card transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        "hover:shadow-floating active:translate-y-px",
      )}
    >
      <div className="relative overflow-hidden">
        <div
          className="aspect-[16/8] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.03]"
          style={{ background: article.heroGradient }}
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/15 via-transparent to-transparent"
          aria-hidden
        />
      </div>
      <div className="p-4">
        {article.tag && (
          <div className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-accent)]">
            {tr(article.tag)}
          </div>
        )}
        <h3 className="mt-1 line-clamp-2 text-[15px] font-black leading-snug tracking-tight text-foreground">
          {tr(article.title)}
        </h3>
        <p
          className={cn(
            "mt-1.5 line-clamp-2 text-[13px] text-[color:var(--text-secondary)]",
            lang === "ar" && "leading-relaxed",
          )}
        >
          {tr(article.excerpt)}
        </p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-[color:var(--text-muted)]">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden /> {article.readMinutes}{" "}
            {t("news.read_min")}
          </span>
          <button
            type="button"
            onClick={() => setSaved((s) => !s)}
            aria-pressed={saved}
            className={cn(
              "inline-flex min-h-9 items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold",
              "text-foreground transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--surface-hover)]",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
            )}
          >
            {saved ? (
              <BookmarkCheck className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />
            ) : (
              <Bookmark className="h-4 w-4" aria-hidden />
            )}
            <span>{saved ? t("news.bookmarked") : t("news.bookmark")}</span>
          </button>
        </div>
      </div>
    </article>
  );
}
