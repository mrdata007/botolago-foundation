import { ChevronLeft, ChevronRight } from "lucide-react";

import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The "‹ Journée N ›" stepper, on the kit.
 *
 * One control for both places that step through gameweeks — the Points
 * screen and Top players — so they cannot drift apart again.
 * `tone="onGradient"` puts it on a header band; the default sits on a page
 * surface.
 *
 * Option A (default tone): a white pill on the card shadow, like the
 * "Terrain | Liste" toggle it sits beside, with round 44px steppers at its
 * ends and the gameweek between them — "JOURNÉE" in label type and the
 * number on the stat ramp, on one baseline.
 *
 * The steppers were 36px squares (under the 44px floor) and announced
 * themselves as "Journée -1" / "Journée +1"; they now name the gameweek they
 * actually go to. Chevrons are logical: start = previous, end = next, and
 * `html[dir="rtl"] .lucide-chevron-*` in styles.css mirrors the glyph so the
 * arrow points the way the reader travels.
 */
export function GameweekSelector({
  value,
  min = 1,
  max = 30,
  onChange,
  tone = "onSurface",
  showLabel = false,
  className,
}: {
  value: number;
  min?: number;
  max?: number;
  onChange: (n: number) => void;
  tone?: "onSurface" | "onGradient";
  /**
   * Print "JOURNÉE" above the number. Off by default because the caller
   * usually already says it — /fantasy/top-players puts its own label beside
   * the control, and the stepper used to repeat it in 9px capitals right next
   * to it. The Points header, where the control stands alone, asks for it.
   */
  showLabel?: boolean;
  className?: string;
}) {
  const { t } = useI18n();
  const previous = Math.max(min, value - 1);
  const next = Math.min(max, value + 1);
  const stepClass = cn(
    "grid shrink-0 place-items-center",
    ui.space.tap,
    ui.radius.full,
    ui.focus,
    "transition-colors disabled:opacity-40",
    tone === "onGradient"
      ? "text-[color:var(--ui-on-grad-header)] hover:bg-[color:color-mix(in_oklab,var(--ui-on-grad-header)_12%,transparent)]"
      : cn(ui.surface.sunken, ui.tone.ink),
  );

  return (
    <div
      role="group"
      aria-label={t("fantasy.points.gameweek")}
      className={cn(
        "inline-flex items-center gap-1 p-1",
        // On a header band the stepper is deliberately untinted. A
        // translucent white track over the *dark* header gradient measured
        // 4.01:1 against `--ui-on-grad-header` — under AA — whereas
        // `--ui-on-grad-header` on the band itself is the pairing the design
        // system guarantees in both themes (measured 8.9:1).
        tone === "onGradient"
          ? cn("bg-transparent", ui.radius.track)
          : cn(ui.radius.full, "bg-[color:var(--ui-surface)]", ui.shadow.card),
        className,
      )}
    >
      <button
        type="button"
        onClick={() => onChange(previous)}
        disabled={value <= min}
        className={stepClass}
        aria-label={`${t("fantasy.points.gameweek")} ${previous}`}
      >
        <ChevronLeft className="h-5 w-5" aria-hidden />
      </button>
      <div
        className={cn(
          "flex min-w-0 flex-1 select-none items-center justify-center",
          // A header band stacks the label over the number; the Option A pill
          // sets them on one baseline, which is what fits a 44px row.
          tone === "onGradient" ? "flex-col gap-0.5" : "items-baseline gap-1.5 px-1",
        )}
      >
        {showLabel ? (
          <span
            className={cn(
              "truncate",
              ui.text.label,
              tone === "onGradient" ? "text-[color:var(--ui-on-grad-header)]" : ui.tone.muted,
            )}
          >
            {t("fantasy.points.gameweek")}
          </span>
        ) : null}
        <span
          className={cn(
            ui.stat.md,
            tone === "onGradient" ? "text-[color:var(--ui-on-grad-header)]" : ui.tone.default,
          )}
        >
          {value}
        </span>
      </div>
      <button
        type="button"
        onClick={() => onChange(next)}
        disabled={value >= max}
        className={stepClass}
        aria-label={`${t("fantasy.points.gameweek")} ${next}`}
      >
        <ChevronRight className="h-5 w-5" aria-hidden />
      </button>
    </div>
  );
}
