import { ChevronLeft, ChevronRight } from "lucide-react";

import type { RoundState, RoundSummaryDto } from "@/backend/predictions/contracts";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { roundStateLabel } from "./predictions-copy";

/**
 * "‹ Journée 6 · En cours ›". Previous is at the start of the line, so in
 * Arabic it sits on the right; styles.css mirrors the lucide chevrons under
 * `dir="rtl"`, so the icons are not swapped here (that would flip them twice).
 */
export function RoundSwitcher({
  number,
  state,
  rounds,
  onChange,
}: {
  number: number;
  state: RoundState;
  rounds: readonly RoundSummaryDto[];
  onChange: (number: number) => void;
}) {
  const { t } = useI18n();
  const index = rounds.findIndex((round) => round.number === number);
  const previous = index > 0 ? rounds[index - 1] : undefined;
  const next = index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : undefined;
  return (
    <div className="flex items-center justify-between gap-2" data-testid="predictions-round">
      <UiIconButton
        aria-label={t("predictions.round.previous")}
        disabled={!previous}
        onClick={() => previous && onChange(previous.number)}
      >
        <ChevronLeft aria-hidden />
      </UiIconButton>
      <p className={cn("min-w-0 truncate text-center", ui.text.bodyStrong)} aria-live="polite">
        {t("predictions.round.name").replace("{n}", String(number))}
        <span className={cn(ui.tone.muted, "[font-weight:var(--ui-weight-body)]")}>
          {" · "}
          {roundStateLabel(state, t)}
        </span>
      </p>
      <UiIconButton
        aria-label={t("predictions.round.next")}
        disabled={!next}
        onClick={() => next && onChange(next.number)}
      >
        <ChevronRight aria-hidden />
      </UiIconButton>
    </div>
  );
}
