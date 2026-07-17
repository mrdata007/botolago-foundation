import { useState } from "react";
import { Bookmark, BookmarkCheck, Clock } from "lucide-react";
import type { Article } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export function ArticleCard({ article, variant = "row" }: { article: Article; variant?: "row" | "lead" | "compact" }) {
  const { tr, t, lang } = useI18n();
  const [saved, setSaved] = useState(false);

  if (variant === "lead") {
    return (
      <article className="relative overflow-hidden rounded-3xl border border-[var(--glass-border)] shadow-xl shadow-black/10">
        <div className="aspect-[16/10] w-full" style={{ background: article.heroGradient }} aria-hidden />
        <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" aria-hidden />
        <div className="absolute inset-x-0 bottom-0 p-4">
          {article.tag && (
            <span className="inline-block rounded-full bg-white/95 px-2.5 py-0.5 text-[10px] font-black uppercase tracking-wide text-[color:var(--brand-primary)]">
              {tr(article.tag)}
            </span>
          )}
          <h3 className="mt-2 text-xl font-black leading-tight text-white drop-shadow-md">
            {tr(article.title)}
          </h3>
          <p className={cn("mt-1 line-clamp-2 text-sm text-white/85", lang === "ar" && "leading-relaxed")}>
            {tr(article.excerpt)}
          </p>
          <div className="mt-3 flex items-center gap-3 text-[11px] text-white/80">
            <span>{tr(article.authorName)}</span>
            <span aria-hidden>•</span>
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
      <article className="flex items-center gap-3 rounded-2xl bg-card p-3 shadow-sm">
        <div className="h-14 w-14 shrink-0 rounded-xl" style={{ background: article.heroGradient }} aria-hidden />
        <div className="min-w-0 flex-1">
          <h4 className="line-clamp-2 text-sm font-bold leading-snug text-foreground">{tr(article.title)}</h4>
          <div className="mt-1 truncate text-[11px] text-muted-foreground">{tr(article.authorName)}</div>
        </div>
      </article>
    );
  }

  return (
    <article className="overflow-hidden rounded-2xl bg-card shadow-sm ring-1 ring-black/5">
      <div className="aspect-[16/8] w-full" style={{ background: article.heroGradient }} aria-hidden />
      <div className="p-4">
        <div className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
          {article.tag && <span className="text-[color:var(--brand-accent)]">{tr(article.tag)}</span>}
        </div>
        <h3 className="mt-1 line-clamp-2 text-base font-black leading-snug text-foreground">
          {tr(article.title)}
        </h3>
        <p className={cn("mt-1 line-clamp-2 text-sm text-muted-foreground", lang === "ar" && "leading-relaxed")}>
          {tr(article.excerpt)}
        </p>
        <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <Clock className="h-3 w-3" aria-hidden /> {article.readMinutes} {t("news.read_min")}
          </span>
          <button
            type="button"
            onClick={() => setSaved((s) => !s)}
            aria-pressed={saved}
            className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-foreground hover:bg-accent"
          >
            {saved ? <BookmarkCheck className="h-4 w-4 text-[color:var(--brand-accent)]" /> : <Bookmark className="h-4 w-4" />}
            {saved ? t("news.bookmarked") : t("news.bookmark")}
          </button>
        </div>
      </div>
    </article>
  );
}
