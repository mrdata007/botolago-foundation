import { UiButton, ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { useCardCopy } from "./copy";

/**
 * What a full card shows when its renderer could not be loaded (audit 2026-10-14, SEC-04): the
 * sentence that says so, and a retry, inside the same reserved box so the page does not move.
 * Once a retry has failed too (`needsReload`) the button reloads the page instead: some engines
 * remember a failed dynamic import for the page's lifetime, so asking again could not succeed.
 * The card's label stays in the page for a screen reader, as it does behind the skeleton.
 */
export function CardLoadFailed({
  aspect,
  label,
  needsReload = false,
  onRetry,
  onReload = () => window.location.reload(),
}: {
  /** height ÷ width of the box the card would fill. */
  aspect: number;
  /** The card's spoken label (`cardLabel`). */
  label: string;
  /** A retry has already failed: offer a page reload in place of another retry. */
  needsReload?: boolean;
  onRetry: () => void;
  onReload?: () => void;
}) {
  const { t } = useI18n();
  const copy = useCardCopy();
  return (
    <div
      style={{ aspectRatio: `1 / ${aspect}` }}
      className={cn(
        "flex h-full w-full flex-col items-center justify-center gap-3 bg-[color:var(--ui-surface-sunken)] p-4 text-center",
        ui.radius.sheet,
      )}
      data-mc-failed="1"
    >
      <span className="sr-only">{label}</span>
      <p role="alert" className={cn(ui.text.meta, ui.tone.muted)}>
        {copy.loadFailed}
      </p>
      {needsReload ? (
        <UiButton variant="soft" size="sm" onClick={onReload}>
          {copy.reload}
        </UiButton>
      ) : (
        <UiButton variant="soft" size="sm" onClick={onRetry}>
          {t("state.retry")}
        </UiButton>
      )}
    </div>
  );
}
