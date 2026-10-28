import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import type { RoundState, RoundSummaryDto } from "@/backend/predictions/contracts";
import { ui, UiIconButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { roundStateLabel } from "./predictions-copy";

/**
 * "‹ Journée 6 · En cours ›" as the page's hero band: the header gradient
 * with a spring glow from the top centre, the journée large in the display
 * face and its state on a pill. Previous is at the start of the line, so in
 * Arabic it sits on the right; styles.css mirrors the lucide chevrons under
 * `dir="rtl"`, so the icons are not swapped here (that would flip them twice).
 *
 * `children` is the band's second row (the reader's progress and points on
 * the "Mes pronos" tab).
 *
 * Contrast: the gradient is drawn at 135% of the band's height, so the band
 * ends about three quarters down it, where `--ui-on-grad-header` still
 * clears 4.5:1 (its last stop, 4.10:1 in light, is never reached). The glow
 * is 45% spring in light and 16% in dark, where the text is the light one.
 */
export function RoundSwitcher({
  number,
  state,
  rounds,
  onChange,
  children,
}: {
  number: number;
  state: RoundState;
  rounds: readonly RoundSummaryDto[];
  onChange: (number: number) => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const index = rounds.findIndex((round) => round.number === number);
  const previous = index > 0 ? rounds[index - 1] : undefined;
  const next = index >= 0 && index < rounds.length - 1 ? rounds[index + 1] : undefined;
  return (
    <section
      className={cn(
        "relative isolate flex flex-col gap-3 overflow-hidden px-2 pb-3 pt-2",
        ui.radius.card,
        ui.shadow.lifted,
        ui.tone.onGradHeader,
        // The glass chevrons read `--ui-on-club`: here, the band's own text.
        "[--ui-on-club:var(--ui-on-grad-header)] [--glow:45%] dark:[--glow:16%]",
      )}
      style={{
        backgroundImage:
          "radial-gradient(120% 90% at 50% 0%, color-mix(in oklab, var(--ui-accent-spring) var(--glow), transparent) 0%, transparent 60%), var(--ui-grad-header)",
        backgroundSize: "100% 100%, 100% 135%",
        backgroundRepeat: "no-repeat",
      }}
      data-testid="predictions-round"
    >
      <div className="flex items-center justify-between gap-2">
        <UiIconButton
          variant="glass"
          aria-label={t("predictions.round.previous")}
          disabled={!previous}
          onClick={() => previous && onChange(previous.number)}
        >
          <ChevronLeft aria-hidden />
        </UiIconButton>
        <p className="flex min-w-0 flex-col items-center gap-1 text-center" aria-live="polite">
          <span className={cn("max-w-full truncate", ui.display.section)}>
            {t("predictions.round.name").replace("{n}", String(number))}
          </span>
          <span className="sr-only"> · </span>
          <span
            className={cn(
              "rounded-full px-2.5 py-0.5",
              ui.text.micro,
              "[font-weight:var(--ui-weight-heavy)]",
              state === "completed"
                ? "bg-[color:color-mix(in_oklab,var(--ui-on-grad-header)_14%,transparent)]"
                : state === "upcoming"
                  ? "bg-[color:var(--ui-ink-deep)] text-[color:var(--ui-on-ink-plain)]"
                  : // Under way: the action gradient, light in both themes.
                    cn("text-[color:var(--ui-ink-deep)]", ui.shadow.card),
            )}
            style={
              state === "in_progress" || state === "provisional"
                ? { backgroundImage: "var(--ui-grad-action)" }
                : undefined
            }
          >
            {roundStateLabel(state, t)}
          </span>
        </p>
        <UiIconButton
          variant="glass"
          aria-label={t("predictions.round.next")}
          disabled={!next}
          onClick={() => next && onChange(next.number)}
        >
          <ChevronRight aria-hidden />
        </UiIconButton>
      </div>
      {children}
    </section>
  );
}
