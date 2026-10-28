import { Minus, Plus } from "lucide-react";
import { useEffect, useState } from "react";

import { MAX_STEPPER_GOALS } from "@/backend/predictions/contracts";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useJustChanged } from "@/lib/motion";
import { cn } from "@/lib/utils";

/**
 * − n + for one team's goals (plan §8): 44px targets, the number in a boxed
 * score face inside its own `<bdi>`, an empty dashed box until the first tap. The row follows the
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
  tone = "plain",
}: {
  team: string;
  value: number | null;
  onStep: (delta: 1 | -1) => void;
  disabled?: boolean;
  testId?: string;
  /**
   * `vivid` (the /pronostics list): + on the action gradient, − as a raised
   * surface disc, and a picked number on an ink scoreboard tile. `plain`
   * (default) is the quiet sunken look the match page keeps.
   */
  tone?: "plain" | "vivid";
}) {
  const { t } = useI18n();
  // The number rolls in from the direction of the tap.
  const [direction, setDirection] = useState<1 | -1>(1);
  const changed = useJustChanged(value, 300);
  // Only a tap rolls the number; a saved pick arriving from the server does not.
  const [tapped, setTapped] = useState(false);
  useEffect(() => {
    if (!tapped) return;
    const timer = setTimeout(() => setTapped(false), 500);
    return () => clearTimeout(timer);
  }, [tapped]);
  const rolled = changed && tapped;
  const vivid = tone === "vivid";
  const frame = cn(
    "inline-grid place-items-center",
    ui.space.tap,
    ui.radius.full,
    ui.focus,
    "disabled:cursor-not-allowed disabled:opacity-40",
    "[&_svg]:h-4 [&_svg]:w-4",
  );
  const button = cn(frame, ui.surface.sunken, ui.tone.ink);
  // Vivid: − is a raised surface disc ringed in the ink, + the bright action
  // gradient with ink-deep on it (light in both themes, 9.9:1 or better).
  const minus = vivid
    ? cn(
        frame,
        "bg-[color:var(--ui-surface)] ring-1 ring-inset ring-[color:color-mix(in_oklab,var(--ui-ink-fg)_35%,transparent)]",
        ui.shadow.card,
        ui.tone.ink,
        "[&_svg]:stroke-[2.75]",
      )
    : button;
  const plus = vivid
    ? cn(frame, "text-[color:var(--ui-ink-deep)]", ui.shadow.lifted, "[&_svg]:stroke-[2.75]")
    : button;
  const plusStyle = vivid ? { backgroundImage: "var(--ui-grad-action)" } : undefined;
  return (
    <div
      role="group"
      aria-label={t("predictions.stepper.group").replace("{team}", team)}
      className="flex items-center gap-0.5"
      data-testid={testId}
    >
      <button
        type="button"
        className={minus}
        aria-label={t("predictions.stepper.decrease").replace("{team}", team)}
        disabled={disabled || value === 0}
        onClick={() => {
          setDirection(-1);
          setTapped(true);
          onStep(-1);
        }}
      >
        <Minus aria-hidden />
      </button>
      <output
        aria-live="polite"
        className={cn(
          "grid h-11 place-items-center rounded-xl border-2",
          vivid ? "w-10" : "w-8",
          ui.score.md,
          ui.text.tabular,
          value === null
            ? vivid
              ? cn(
                  "border-dashed border-[color:color-mix(in_oklab,var(--ui-ink-fg)_45%,transparent)] bg-[color:var(--ui-surface)]",
                  ui.tone.faint,
                )
              : cn("border-dashed border-[color:var(--ui-rule)] bg-transparent", ui.tone.faint)
            : vivid
              ? // The picked number as a scoreboard tile on the "selected"
                // fill: ink with white in light, the bright ink-fg with
                // ink-deep in dark, where the ink would sink into the card.
                cn(
                  "border-solid border-[color:var(--ui-selected)] bg-[color:var(--ui-selected)] text-[color:var(--ui-on-selected)]",
                  ui.shadow.lifted,
                )
              : "border-solid border-[color:var(--ui-ink-fg)] bg-[color:var(--ui-surface)]",
        )}
        data-testid={testId ? `${testId}-value` : undefined}
      >
        <bdi
          key={value ?? "none"}
          className={rolled ? (direction === 1 ? "roll-up" : "roll-down") : undefined}
        >
          {value === null ? "–" : value}
        </bdi>
      </output>
      <button
        type="button"
        className={plus}
        style={plusStyle}
        aria-label={t("predictions.stepper.increase").replace("{team}", team)}
        disabled={disabled || value === MAX_STEPPER_GOALS}
        onClick={() => {
          setDirection(1);
          setTapped(true);
          onStep(1);
        }}
      >
        <Plus aria-hidden />
      </button>
    </div>
  );
}
