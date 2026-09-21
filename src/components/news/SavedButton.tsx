import { Bookmark, BookmarkCheck } from "lucide-react";
import { useSavedArticles } from "@/lib/saved-articles";
import { ui } from "@/components/ui-kit";
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

  const common = cn("inline-flex items-center justify-center gap-1 transition-colors", ui.focus);

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
          ui.space.tap,
          ui.radius.full,
          ui.tone.default,
          "hover:bg-[color:var(--ui-surface-sunken)]",
          saved && ui.tone.ink,
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
          // An overlay sits on photography, so it needs its own scrim rather
          // than a surface token; the ink pair is the kit's on-image pairing.
          ui.space.tap,
          ui.radius.full,
          "bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_70%,transparent)] text-[color:var(--ui-on-ink-plain)] backdrop-blur-md",
          saved && cn(ui.surface.card, ui.tone.ink),
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
        "px-2 py-1 hover:bg-[color:var(--ui-surface-sunken)]",
        ui.space.tap,
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.tone.default,
        className,
      )}
    >
      <Icon className={cn("h-4 w-4", saved && ui.tone.ink)} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
