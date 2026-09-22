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
            //
            // Merged with the kit conversion, which landed on this file in the
            // same integration. The STRUCTURE here is BG-0111's — two-row grid,
            // a wrapping label, no `truncate`. The colour, radius, focus ring
            // and type are the kit's, because those are the themed,
            // contract-tested ones: the other side still painted `bg-white`
            // under `text-white` and carried an un-prefixed `tracking-wide`,
            // which pulls Arabic letterforms apart (BG-0069).
            //
            // BG-0111's `[line-height:1.15]` is dropped for `ui.text.meta`'s
            // 1.5. This button hides its overflow, and 1.15 cuts glyph ink in
            // both scripts — measured, with the arithmetic, in BG-0124. 1.5
            // clears Latin; Arabic needs 1.73 and gets it at the token layer
            // for the whole product rather than as a literal here.
            className={cn(
              "grid grid-rows-[1fr_auto] overflow-hidden text-center disabled:cursor-default",
              "min-h-[var(--ui-tap-min)]",
              ui.radius.tight,
              ui.focus,
              "shadow-[var(--ui-shadow-card)]",
            )}
            aria-label={`${label}: ${state}`}
          >
            <span
              className={cn(
                "flex items-center justify-center px-1 py-1.5",
                "[overflow-wrap:break-word] [hyphens:none]",
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
