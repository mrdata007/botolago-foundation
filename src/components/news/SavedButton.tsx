import { Bookmark, BookmarkCheck } from "lucide-react";
import { useSavedArticles } from "@/lib/saved-articles";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Reusable save-toggle. Persists to the local saved-articles store and
 * broadcasts to every subscribed card so state stays consistent across
 * the feed and the article page without optimistic drift.
 */
export function SavedButton({
  articleId,
  variant = "chip",
  className,
}: {
  articleId: string;
  variant?: "chip" | "icon" | "overlay";
  className?: string;
}) {
  const { t } = useI18n();
  const { isSaved, toggle, hydrated } = useSavedArticles();
  const saved = hydrated && isSaved(articleId);
  const label = saved ? t("news.bookmarked") : t("news.bookmark");
  const Icon = saved ? BookmarkCheck : Bookmark;

  const common =
    "inline-flex items-center justify-center gap-1 font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)] focus-visible:ring-offset-2";

  if (variant === "icon") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(articleId);
        }}
        aria-pressed={saved}
        aria-label={label}
        className={cn(
          common,
          "h-11 w-11 rounded-full text-foreground hover:bg-[color:var(--surface-hover)]",
          saved && "text-[color:var(--brand-accent)]",
          className,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  if (variant === "overlay") {
    return (
      <button
        type="button"
        onClick={(e) => {
          e.preventDefault();
          e.stopPropagation();
          toggle(articleId);
        }}
        aria-pressed={saved}
        aria-label={label}
        className={cn(
          common,
          "h-11 w-11 rounded-full bg-black/45 text-white backdrop-blur-md hover:bg-black/60",
          saved && "bg-white/95 text-[color:var(--brand-primary)]",
          className,
        )}
      >
        <Icon className="h-5 w-5" aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        toggle(articleId);
      }}
      aria-pressed={saved}
      className={cn(
        common,
        "min-h-9 rounded-lg px-2 py-1 text-xs text-foreground hover:bg-[color:var(--surface-hover)]",
        className,
      )}
    >
      <Icon className={cn("h-4 w-4", saved && "text-[color:var(--brand-accent)]")} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
