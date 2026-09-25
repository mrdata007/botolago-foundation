import { Minus, Plus } from "lucide-react";

import { MAX_STEPPER_GOALS } from "@/backend/predictions/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * − n + for one team's goals (plan §8): 44px targets, the number in the score
 * face inside its own `<bdi>`, "–" until the first tap. The row follows the
 * reading direction, so it mirrors in Arabic; the + and − glyphs do not.
 *
 * Not a number field on purpose: the keyboard would cover half the screen,
 * iOS would zoom, Arabic keyboards type ٠١٢, and every match would need two.
 */
export function ScoreStepper({
  team,
  value,
  onStep,
  disabled = false,
  testId,
}: {
  team: string;
  value: number | null;
  onStep: (delta: 1 | -1) => void;
  disabled?: boolean;
  testId?: string;
}) {
  const { t } = useI18n();
  const button = cn(
    "inline-grid place-items-center",
    ui.space.tap,
    ui.radius.full,
    ui.surface.sunken,
    ui.tone.ink,
    ui.focus,
    "disabled:cursor-not-allowed disabled:opacity-40",
    "[&_svg]:h-4 [&_svg]:w-4",
  );
  return (
    <div
      role="group"
      aria-label={t("predictions.stepper.group").replace("{team}", team)}
      className="flex items-center gap-1.5"
      data-testid={testId}
    >
      <button
        type="button"
        className={button}
        aria-label={t("predictions.stepper.decrease").replace("{team}", team)}
        disabled={disabled || value === 0}
        onClick={() => onStep(-1)}
      >
        <Minus aria-hidden />
      </button>
      <output
        aria-live="polite"
        className={cn("w-7 text-center", ui.score.row, ui.text.tabular)}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        <bdi>{value === null ? "–" : value}</bdi>
      </output>
      <button
        type="button"
        className={button}
        aria-label={t("predictions.stepper.increase").replace("{team}", team)}
        disabled={disabled || value === MAX_STEPPER_GOALS}
        onClick={() => onStep(1)}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}
