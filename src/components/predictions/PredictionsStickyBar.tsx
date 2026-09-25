import { AlertTriangle, Check, CloudOff, Loader2, Smartphone } from "lucide-react";

import type { SaveQueueState } from "@/backend/predictions/save-queue";
import { ui, UiButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { formatNumber } from "./predictions-copy";

/**
 * The bar over the bottom navigation: progress on the journée, and whether
 * the last change is saved — "Enregistré", "Hors connexion", "Échec,
 * réessayer" — or, for a visitor, kept on this phone with a way to sign up.
 */
export function PredictionsStickyBar({
  done,
  total,
  state,
  onRetry,
  onSignUp,
}: {
  done: number;
  total: number;
  state: SaveQueueState | "guest";
  onRetry: () => void;
  onSignUp: () => void;
}) {
  const { t, lang } = useI18n();
  return (
    <>
      {/* Room for the bar, so the last match can scroll clear of it. */}
      <div aria-hidden className="h-[var(--ui-row-min)]" />
      <div
        className={cn(
          "fixed inset-x-0 bottom-[var(--bottomnav-h)] z-40 pb-2.5 md:bottom-0 md:pb-4",
          ui.space.content,
          ui.space.gutter,
        )}
      >
        <div
          role="status"
          data-testid="predictions-bar"
          className={cn(
            "flex min-h-[var(--ui-tap-min)] items-center justify-between gap-3 px-4 py-2",
            ui.radius.full,
            ui.surface.card,
            ui.shadow.lifted,
          )}
        >
          <span className={cn(ui.text.bodyStrong, ui.text.tabular)}>
            {t("predictions.progress")
              .replace("{done}", formatNumber(done, lang))
              .replace("{total}", formatNumber(total, lang))}
          </span>
          <SaveIndicator state={state} onRetry={onRetry} onSignUp={onSignUp} />
        </div>
      </div>
    </>
  );
}

function SaveIndicator({
  state,
  onRetry,
  onSignUp,
}: {
  state: SaveQueueState | "guest";
  onRetry: () => void;
  onSignUp: () => void;
}) {
  const { t } = useI18n();
  const line = cn("inline-flex min-w-0 items-center gap-1.5", ui.text.meta, ui.tone.muted);
  switch (state) {
    case "guest":
      return (
        <span className="flex min-w-0 items-center gap-2">
          <span className={cn(line, "hidden min-[400px]:inline-flex")}>
            <Smartphone className="h-4 w-4 shrink-0" aria-hidden />
            <span className="truncate">{t("predictions.guest.saved_local")}</span>
          </span>
          <UiButton size="sm" variant="ink" onClick={onSignUp}>
            {t("predictions.guest.cta_button")}
          </UiButton>
        </span>
      );
    case "pending":
    case "saving":
      return (
        <span className={line}>
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
          {t("predictions.save.saving")}
        </span>
      );
    case "offline":
      return (
        <span className={line}>
          <CloudOff className="h-4 w-4" aria-hidden />
          {t("predictions.save.offline")}
        </span>
      );
    case "error":
      return (
        <span className="flex items-center gap-2">
          <span className={line}>
            <AlertTriangle className="h-4 w-4" aria-hidden />
            {t("predictions.save.failed")}
          </span>
          <UiButton size="sm" variant="soft" onClick={onRetry}>
            {t("state.retry")}
          </UiButton>
        </span>
      );
    case "saved":
      return (
        <span className={line}>
          <Check className="h-4 w-4" aria-hidden />
          {t("predictions.save.saved")}
        </span>
      );
    default:
      return null;
  }
}
