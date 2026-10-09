import { Link } from "@tanstack/react-router";

import { useGradinsCopy, useMomentCopy } from "@/components/manager-card/copy";
import { ui, UiCard, UiErrorState, UiSkeleton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The states every Gradins screen shares (plan 4.1): a skeleton with the shape of the screen,
 * the error panel for a card that could not be read, and the line for an account that has no card.
 */

/** A card-shaped stage (296 px, 336 px from 768 px, 1 : 1.618), two text lines and three blocks, announced once as « Chargement ». */
export function GradinsLoading() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-label={t("state.loading")}
      data-testid="gradins-loading"
      className="px-4 pt-5"
    >
      <span className="sr-only">{t("state.loading")}</span>
      <div className="mx-auto w-[min(296px,calc(100vw-32px))] md:w-[336px]">
        <UiSkeleton className={cn("aspect-[1000/1618] w-full", ui.radius.sheet)} />
      </div>
      <div className="mx-auto mt-4 flex max-w-xs flex-col items-center gap-2">
        <UiSkeleton className="h-6 w-48" />
        <UiSkeleton className="h-4 w-64" />
      </div>
      <div className="mt-6 space-y-4">
        <UiSkeleton className={cn("h-28 w-full", ui.radius.card)} />
        <UiSkeleton className={cn("h-40 w-full", ui.radius.card)} />
        <UiSkeleton className={cn("h-32 w-full", ui.radius.card)} />
      </div>
    </div>
  );
}

/** The card could not be read: the plain sentence and an ink « Réessayer ». No stale number. */
export function GradinsError({ retry }: { retry: () => void }) {
  const moments = useMomentCopy();
  return (
    <div className="px-4 pt-6" data-testid="gradins-error">
      <UiErrorState title={moments.state.offlineText} onRetry={retry} />
    </div>
  );
}

/** An account the card read does not know (a deleted-pending profile): a line and the profile. */
export function GradinsUnavailable() {
  const copy = useGradinsCopy();
  const { t } = useI18n();
  return (
    <div className="px-4 pt-6" data-testid="gradins-unavailable">
      <UiCard padding="lg" className="flex flex-col items-center gap-4 text-center">
        <p className={cn("text-pretty", ui.text.body, ui.tone.default)}>{copy.unavailable}</p>
        <Link
          to="/profile"
          className={cn(
            "inline-flex items-center justify-center px-4",
            ui.space.tap,
            ui.radius.full,
            ui.surface.sunken,
            ui.text.bodyStrong,
            ui.focus,
          )}
        >
          {t("nav.profile")}
        </Link>
      </UiCard>
    </div>
  );
}
