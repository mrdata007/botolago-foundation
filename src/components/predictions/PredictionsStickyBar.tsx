import { AlertTriangle, Check, CloudOff, Loader2, ShieldAlert, Smartphone } from "lucide-react";

import { ui, UiButton } from "@/components/ui-kit";
import { useJustTurnedOn } from "@/lib/motion";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { formatNumber } from "./predictions-copy";
import type { PredictionsSaveState } from "./use-predictions-round";

/**
 * The bar over the bottom navigation: progress on the journée, and whether
 * the last change is saved — "Enregistré", "Hors connexion", "Échec,
 * réessayer", "Code requis" — or, for a visitor, kept on this phone with a way
 * to sign up.
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
  state: PredictionsSaveState;
  onRetry: () => void;
  onSignUp: () => void;
}) {
  const { t, lang } = useI18n();
  const complete = total > 0 && done >= total;
  const justCompleted = useJustTurnedOn(complete);
  const percent = total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;
  return (
    <>
      {/* Room for the bar, so the last match can scroll clear of it. */}
      <div aria-hidden className="h-[4.5rem]" />
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
            "relative flex min-h-[var(--ui-tap-min)] items-center justify-between gap-3 overflow-hidden px-4 py-2",
            justCompleted && "settle",
            ui.radius.full,
            ui.surface.card,
            ui.shadow.lifted,
          )}
        >
          <span
            className={cn("inline-flex items-center gap-1.5", ui.text.bodyStrong, ui.text.tabular)}
          >
            {complete ? (
              <Check
                className={cn("h-4 w-4 text-[color:var(--ui-positive)]", justCompleted && "pop")}
                aria-hidden
              />
            ) : null}
            {t("predictions.progress")
              .replace("{done}", formatNumber(done, lang))
              .replace("{total}", formatNumber(total, lang))}
          </span>
          <SaveIndicator state={state} onRetry={onRetry} onSignUp={onSignUp} />
          <span
            aria-hidden
            data-testid="predictions-bar-fill"
            className={cn(
              "absolute inset-x-0 bottom-0 h-1 origin-left transition-transform duration-500 ease-out motion-reduce:transition-none rtl:origin-right",
              complete ? "bg-[color:var(--ui-positive)]" : "bg-[color:var(--ui-ink-fg)]",
            )}
            style={{ transform: `scaleX(${percent / 100})` }}
          />
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
  state: PredictionsSaveState;
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
    // Refused until the one-time code is in: not a failed save. The picks stay
    // queued (and kept as the account's draft, sent on the next visit), the
    // auth layer's notice says where the code comes from, and "Réessayer"
    // sends them again.
    case "step_up":
      return (
        <span className="flex items-center gap-2">
          <span className={line}>
            <ShieldAlert className="h-4 w-4" aria-hidden />
            {t("predictions.save.step_up")}
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
