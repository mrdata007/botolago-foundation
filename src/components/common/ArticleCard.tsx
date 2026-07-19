import { Link } from "@tanstack/react-router";
import { Clock } from "lucide-react";
import type { Article } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { formatRelativeTime } from "@/lib/format-time";
import { SavedButton } from "@/components/news/SavedButton";
import { cn } from "@/lib/utils";

/**
 * Design System V2 — Article card, five variants:
 *   - `lead`        hero editorial card (16:10 image + overlay)
 *   - `row`         standard image-on-top card (default)
 *   - `compact`     media list row
 *   - `horizontal`  side-by-side image + text (dense lists)
 *   - `imageLed`    tall image-first card for "top stories" grid
 *
 * Every variant is wrapped in a router Link to the article page, uses
 * semantic surface tokens, respects RTL logical alignment, and exposes
 * the saved-state via the shared SavedButton (single source of truth).
 */
export function ArticleCard({
  article,
  variant = "row",
}: {
  article: Article;
  variant?: "row" | "lead" | "compact" | "horizontal" | "imageLed";
}) {
  const { tr, t, lang } = useI18n();
  const time = formatRelativeTime(article.publishedAt, lang);
  const to = "/news/$articleId";
  const params = { articleId: article.id };
  const ariaLabel = tr(article.title);

  if (variant === "lead") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(
          "group relative block overflow-hidden rounded-[var(--radius-hero)]",
          "border border-[var(--border-subtle)] shadow-card",
          "transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          "hover:shadow-floating active:translate-y-px",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2",
        )}
      >
        <div
          className="aspect-[16/10] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.02]"
          style={{ background: article.heroGradient }}
          aria-hidden
        />
        <div
          className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/35 to-transparent"
          aria-hidden
        />
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-1/3 bg-gradient-to-b from-black/25 to-transparent"
          aria-hidden
        />
        <div className="absolute end-3 top-3 z-10">
          <SavedButton articleId={article.id} variant="overlay" />
        </div>
        <div className="absolute inset-x-0 bottom-0 p-4 sm:p-5">
          {article.tag && (
            <span className="inline-flex items-center rounded-full bg-white/95 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-primary)] shadow-subtle backdrop-blur">
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
            {time && (
              <>
                <span className="h-1 w-1 shrink-0 rounded-full bg-white/50" aria-hidden />
                <span>{time}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "compact") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(
          "surface-2-interactive flex items-center gap-3 p-3",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        )}
      >
        <div
          className="h-14 w-14 shrink-0 rounded-xl shadow-inner"
          style={{ background: article.heroGradient }}
          aria-hidden
        />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">
            {tr(article.title)}
          </h4>
          <div className="mt-1 flex items-center gap-1.5 truncate text-[11px] text-[color:var(--text-muted)]">
            <span className="truncate">{tr(article.authorName)}</span>
            {time && (
              <>
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-muted)]/50"
                  aria-hidden
                />
                <span className="shrink-0">{time}</span>
              </>
            )}
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "horizontal") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(
          "group grid grid-cols-[7.5rem_minmax(0,1fr)] gap-3 overflow-hidden rounded-[var(--radius-card)]",
          "border border-[var(--border-subtle)] bg-[color:var(--surface)] p-2",
          "shadow-subtle transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          "hover:shadow-card active:translate-y-px",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        )}
      >
        <div className="relative overflow-hidden rounded-[calc(var(--radius-card)-4px)]">
          <div
            className="aspect-square w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.05]"
            style={{ background: article.heroGradient }}
            aria-hidden
          />
        </div>
        <div className="flex min-w-0 flex-col justify-between py-1 pe-1">
          <div>
            {article.tag && (
              <div className="text-[9.5px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-accent)]">
                {tr(article.tag)}
              </div>
            )}
            <h3 className="mt-0.5 line-clamp-3 text-[14px] font-black leading-snug tracking-tight text-foreground">
              {tr(article.title)}
            </h3>
          </div>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10.5px] text-[color:var(--text-muted)]">
            <span className="inline-flex items-center gap-1 truncate">
              {time && <span className="truncate">{time}</span>}
              {time && (
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-muted)]/50"
                  aria-hidden
                />
              )}
              <Clock className="h-3 w-3 shrink-0" aria-hidden />
              <span className="shrink-0">
                {article.readMinutes} {t("news.read_min")}
              </span>
            </span>
            <SavedButton articleId={article.id} variant="icon" className="h-9 w-9 -me-1" />
          </div>
        </div>
      </Link>
    );
  }

  if (variant === "imageLed") {
    return (
      <Link
        to={to}
        params={params}
        aria-label={ariaLabel}
        className={cn(
          "group relative block overflow-hidden rounded-[var(--radius-card-lg)]",
          "border border-[var(--border-subtle)] bg-[color:var(--surface)]",
          "shadow-card transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          "hover:shadow-floating active:translate-y-px",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2",
        )}
      >
        <div className="relative overflow-hidden">
          <div
            className="aspect-[4/5] w-full transition-transform duration-500 ease-[var(--ease-standard)] group-hover:scale-[1.03]"
            style={{ background: article.heroGradient }}
            aria-hidden
          />
          <div
            className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/25 to-transparent"
            aria-hidden
          />
          {article.tag && (
            <span className="absolute start-3 top-3 inline-flex items-center rounded-full bg-white/95 px-2 py-0.5 text-[9.5px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-primary)] shadow-subtle backdrop-blur">
              {tr(article.tag)}
            </span>
          )}
          <div className="absolute inset-x-0 bottom-0 p-3">
            <h3 className="line-clamp-3 text-[15px] font-black leading-snug tracking-tight text-white drop-shadow">
              {tr(article.title)}
            </h3>
            <div className="mt-1.5 flex items-center gap-2 text-[10px] text-white/85">
              {time && <span>{time}</span>}
              <span className="inline-flex items-center gap-1">
                <Clock className="h-3 w-3" aria-hidden />
                {article.readMinutes} {t("news.read_min")}
              </span>
            </div>
          </div>
        </div>
      </Link>
    );
  }

  // default: row
  return (
    <Link
      to={to}
      params={params}
      aria-label={ariaLabel}
      className={cn(
        "group block overflow-hidden rounded-[var(--radius-card-lg)]",
        "border border-[var(--border-subtle)] bg-[color:var(--surface)]",
        "shadow-card transition-[transform,box-shadow] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
        "hover:shadow-floating active:translate-y-px",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2",
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
        <div className="mt-3 flex items-center justify-between gap-2 text-[11px] text-[color:var(--text-muted)]">
          <span className="inline-flex items-center gap-1.5 truncate">
            <span className="truncate">{tr(article.authorName)}</span>
            {time && (
              <>
                <span
                  className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-muted)]/50"
                  aria-hidden
                />
                <span className="shrink-0">{time}</span>
              </>
            )}
            <span
              className="h-1 w-1 shrink-0 rounded-full bg-[color:var(--text-muted)]/50"
              aria-hidden
            />
            <span className="inline-flex shrink-0 items-center gap-1">
              <Clock className="h-3 w-3" aria-hidden />
              {article.readMinutes} {t("news.read_min")}
            </span>
          </span>
          <SavedButton articleId={article.id} variant="icon" className="h-9 w-9 -me-1" />
        </div>
      </div>
    </Link>
  );
}
