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
            // BG-0111 — the chip names are fixed product vocabulary, so the
            // layout accommodates the longest one instead of shortening it.
            // "Triple Capitaine" measures 103px of text against a 108.7px
            // content box at 390px: it survived only by 5.7px, and `truncate`
            // meant any narrower phone (360px is common), a heavier fallback
            // face while Manrope loads, or a fourth chip in the row clipped it
            // to "Triple Capitain…". The name now wraps at a word boundary
            // rather than truncating, and the button is a two-row grid whose
            // first row takes the slack, so the ink bands and the state bands
            // stay aligned across chips of different name lengths.
            className={cn(
              "grid grid-rows-[1fr_auto] overflow-hidden rounded-[4px] text-center shadow-sm",
              "disabled:cursor-default",
              chip.state === "unavailable" || chip.state === "used" ? "opacity-90" : "",
            )}
            aria-label={`${label}: ${state}`}
          >
            <span
              className={cn(
                "flex items-center justify-center px-1 py-1.5 text-[13px] font-extrabold",
                "[line-height:1.15] [overflow-wrap:break-word] [hyphens:none]",
                chip.state === "unavailable" || chip.state === "used"
                  ? "bg-white text-[color:var(--fpl-ink-deep)]"
                  : "bg-[color:var(--fpl-ink)] text-white",
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "block px-1 py-1 text-[11px] font-bold uppercase ltr:tracking-wide",
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
