import { Zap } from "lucide-react";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The "breaking" pill for a `breaking` placement from `api.news_home_modules`
 * (see `isBreaking`). Option A: an inline 24px pill that `ArticleCard` shows
 * with the card's own label — beside the tag pill on a photo card, above the
 * headline on a row — rather than a ribbon laid over a corner, where it now
 * collided with the row's thumbnail and its Save control.
 *
 * The fill is the negative status colour with ITS foreground,
 * `--ui-on-negative`: the negative turns into a light tint in the dark theme,
 * where the plain white this used to carry measured 2.31:1.
 */
export function PlacementBadge({ className }: { className?: string }) {
  const { t } = useI18n();
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 px-2.5",
        ui.radius.full,
        // Label type: size, weight, casing and an `ltr:`-only tracking.
        ui.text.label,
        "bg-[color:var(--ui-negative)]",
        ui.tone.onNegative,
        className,
      )}
    >
      <Zap className="h-3 w-3 shrink-0" aria-hidden />
      {t("news.breaking")}
    </span>
  );
}
