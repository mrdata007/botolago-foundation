import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface FplChipView {
  key: ChipKey;
  state: ChipState;
}

/**
 * Chip cards reconstructed from the FPL "Pick Team" reference: an ink band
 * carrying the chip name above a white band carrying PLAY / UNAVAILABLE /
 * ACTIVE (gradient). Tapping an available chip starts the activation flow.
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
        const clickable = chip.state === "available" && !!onSelect;
        return (
          <button
            key={chip.key}
            type="button"
            disabled={!clickable}
            onClick={() => onSelect?.(chip.key)}
            className={cn(
              "overflow-hidden rounded-[4px] text-center shadow-sm disabled:cursor-default",
              chip.state === "unavailable" || chip.state === "used" ? "opacity-90" : "",
            )}
            aria-label={`${label}: ${state}`}
          >
            <span
              className={cn(
                "block truncate px-1 py-1.5 text-[13px] font-extrabold",
                chip.state === "unavailable" || chip.state === "used"
                  ? "bg-white text-[color:var(--fpl-ink-deep)]"
                  : "bg-[color:var(--fpl-ink)] text-white",
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "block px-1 py-1 text-[11px] font-bold uppercase tracking-wide",
                chip.state === "active"
                  ? "text-[color:var(--fpl-ink-deep)]"
                  : chip.state === "available"
                    ? "bg-white text-[color:var(--fpl-ink-deep)]"
                    : "bg-white text-[color:var(--fpl-grey-text)]",
              )}
              style={chip.state === "active" ? { backgroundImage: "var(--fpl-grad)" } : undefined}
            >
              {state}
            </span>
          </button>
        );
      })}
    </div>
  );
}
