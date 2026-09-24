import type { ChipKey, ChipState } from "@/lib/fantasy-engine";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

export interface FplChipView {
  key: ChipKey;
  state: ChipState;
}

/**
 * The chips above the pitch (A-Team): a row of white pills — the chip's name,
 * then its state in a smaller pill at the inline end ("Bench Boost [JOUER]").
 * Tapping an available chip starts the activation flow; every other state is
 * inert.
 *
 * The row scrolls sideways rather than squeezing: the chip names are fixed
 * product vocabulary (BG-0111 — "Triple Capitaine" must never be cut), so each
 * pill takes the width its name needs and the row, not the name, gives way.
 * The scroller spans the gutter (`-mx` / `px` of the same step) so a chip
 * slides under the screen edge instead of stopping 16px short of it, and the
 * page itself never scrolls sideways.
 *
 * State, by more than colour: the inner pill's WORD changes ("JOUER",
 * "ACTIF", "UTILISÉ", "INDISPONIBLE"), the active one is the action gradient,
 * and a spent chip's name drops to the muted tone. The accessible name stays
 * `${label}: ${state}`.
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
  // Literal branches, never `fantasy.chip.${key}`: a key assembled at runtime
  // is invisible to the i18n gate and to the TranslationKey type alike.
  const chipLabel = (key: ChipKey) =>
    key === "bench_boost"
      ? t("fantasy.chip.bench_boost")
      : key === "free_hit"
        ? t("fantasy.chip.free_hit")
        : key === "triple_captain"
          ? t("fantasy.chip.triple_captain")
          : t("fantasy.chip.wildcard");
  return (
    <div
      data-scroll-x
      className={cn(
        "-mx-[var(--ui-gutter)] flex gap-2 overflow-x-auto px-[var(--ui-gutter)] py-1",
        "[scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className,
      )}
    >
      {chips.map((chip) => {
        const label = chipLabel(chip.key);
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
            aria-label={`${label}: ${state}`}
            className={cn(
              "inline-flex min-h-[var(--ui-tap-min)] shrink-0 items-center gap-2.5 pe-1.5 ps-3.5",
              ui.radius.full,
              "bg-[color:var(--ui-surface)]",
              ui.shadow.card,
              ui.focus,
              "disabled:cursor-default",
            )}
          >
            <span
              className={cn(
                "whitespace-nowrap",
                ui.text.meta,
                "[font-weight:var(--ui-weight-heavy)]",
                spent ? ui.tone.muted : ui.tone.default,
              )}
            >
              {label}
            </span>
            <span
              className={cn(
                "inline-flex min-h-8 items-center whitespace-nowrap px-3",
                ui.radius.full,
                ui.text.label,
                chip.state === "active"
                  ? "text-[color:var(--ui-ink-deep)]"
                  : chip.state === "available"
                    ? cn(ui.surface.sunken, ui.tone.ink)
                    : cn(ui.surface.sunken, ui.tone.muted),
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
