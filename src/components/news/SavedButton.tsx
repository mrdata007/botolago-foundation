import type { MouseEvent } from "react";
import { Bookmark, BookmarkCheck } from "lucide-react";
import { useSavedArticles } from "@/lib/saved-articles";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * Reusable save-toggle. Persists to the local saved-articles store and
 * broadcasts to every subscribed card so state stays consistent across
 * the feed and the article page without optimistic drift.
 *
 * Variants (Option A — every one of them round):
 *   - `soft`     the 44px soft disc of a header bar (the article's
 *                "← Retour · Save · Share" bar): `UiIconButton`
 *   - `overlay`  a 44px disc over a photo (the lead card): an ink-deep glass
 *                that stays legible on any picture
 *   - `thumb`    the same glass, painted at 32px on a row's 88×68 thumbnail —
 *                a 44px disc would cover half of it — with a transparent 44px
 *                target behind it (`ui.hitArea`), so the tap floor holds
 *   - `chip`     a labelled pill (icon + "Enregistrer")
 *
 * It is always the card link's SIBLING, never inside it: a button in an `<a>`
 * is invalid HTML and is announced twice (`ArticleCard.semantics.test.ts`).
 */
export function SavedButton({
  articleId,
  variant = "chip",
  className,
}: {
  articleId: string;
  variant?: "chip" | "soft" | "overlay" | "thumb";
  className?: string;
}) {
  const { t } = useI18n();
  const { isSaved, toggle, hydrated } = useSavedArticles();
  const saved = hydrated && isSaved(articleId);
  const label = saved ? t("news.bookmarked") : t("news.bookmark");
  const Icon = saved ? BookmarkCheck : Bookmark;
  const onClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    toggle(articleId);
  };

  if (variant === "soft") {
    return (
      <UiIconButton aria-label={label} aria-pressed={saved} onClick={onClick} className={className}>
        <Icon aria-hidden />
      </UiIconButton>
    );
  }

  if (variant === "overlay" || variant === "thumb") {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-pressed={saved}
        aria-label={label}
        className={cn(
          "inline-grid shrink-0 place-items-center transition-colors",
          ui.radius.full,
          ui.focus,
          variant === "overlay"
            ? cn(ui.space.tap, "[&_svg]:h-5 [&_svg]:w-5")
            : cn(ui.hitArea, "h-8 w-8 [&_svg]:h-4 [&_svg]:w-4"),
          // On a photograph there is no surface token to sit on, so the
          // control brings its own ground: the ink-deep scrim the photo cards
          // already use, blurred, with the plain on-ink foreground. Saved, it
          // turns into the surface disc with the brand icon.
          saved
            ? cn("bg-[color:var(--ui-surface)]", ui.tone.ink, ui.shadow.card)
            : "bg-[color:color-mix(in_oklab,var(--ui-ink-deep)_70%,transparent)] text-[color:var(--ui-on-ink-plain)] backdrop-blur-md",
          className,
        )}
      >
        <Icon aria-hidden />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={saved}
      className={cn(
        "inline-flex items-center justify-center gap-1 px-3 transition-colors",
        "hover:bg-[color:var(--ui-surface-sunken)]",
        ui.space.tap,
        ui.radius.full,
        ui.text.meta,
        "[font-weight:var(--ui-weight-strong)]",
        ui.tone.default,
        ui.focus,
        className,
      )}
    >
      <Icon className={cn("h-4 w-4", saved && ui.tone.ink)} aria-hidden />
      <span>{label}</span>
    </button>
  );
}
