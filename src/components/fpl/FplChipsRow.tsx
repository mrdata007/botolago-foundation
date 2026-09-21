import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface FplChipView {
  key: ChipKey;
  state: ChipState;
}

/**
 * The chip cards above the pitch: an ink band carrying the chip name over a
 * band carrying its state (PLAY / ACTIVE / USED / UNAVAILABLE). Tapping an
 * available chip starts the activation flow; every other state is inert.
 *
 * Converted onto the kit: the name band was `bg-white` / `text-white` (an
 * unthemed surface under themed text), the state band's `tracking-wide` was
 * un-prefixed — which pulls Arabic letterforms apart — and the card sat below
 * the 44px tap floor.
 */
export function FplChipsRow({
  chips,
  onSelect,
  className,
}: {
  chips: FplChipView[];
  onSelect?: (chip: ChipKey) => void;
  className?: string;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn("grid gap-2", className)}
      style={{ gridTemplateColumns: `repeat(${chips.length}, minmax(0, 1fr))` }}
    >
      {chips.map((chip) => {
        const label = t(`fantasy.chip.${chip.key}` as never);
        const state =
          chip.state === "active"
            ? t("fpl.state.active")
            : chip.state === "available"
              ? t("fpl.state.play")
              : chip.state === "used"
                ? t("fpl.state.used")
                : t("fpl.state.unavailable");
        const spent = chip.state === "unavailable" || chip.state === "used";
        const clickable = chip.state === "available" && !!onSelect;
        return (
          <button
            key={chip.key}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(chip.key)}
            className={cn(
              "flex flex-col justify-between overflow-hidden text-center disabled:cursor-default",
              "min-h-[var(--ui-tap-min)]",
              ui.radius.tight,
              ui.focus,
              "shadow-[var(--ui-shadow-card)]",
            )}
            aria-label={`${label}: ${state}`}
          >
            <span
              className={cn(
                "block truncate px-1 py-1.5",
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                spent ? cn(ui.surface.sunken, ui.tone.muted) : ui.surface.inkPlain,
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "block px-1 py-1",
                ui.text.label,
                chip.state === "active"
                  ? "text-[color:var(--ui-ink-deep)]"
                  : cn(
                      "bg-[color:var(--ui-surface)]",
                      chip.state === "available" ? ui.tone.ink : ui.tone.muted,
                    ),
              )}
              style={
                chip.state === "active" ? { backgroundImage: "var(--ui-grad-action)" } : undefined
              }
            >
              {state}
            </span>
          </button>
        );
      })}
    </div>
  );
}
