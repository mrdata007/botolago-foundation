import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { TranslationKey } from "@/i18n/dictionaries";
import { Zap, Repeat, Star, Wand2 } from "lucide-react";
import type { ReactNode } from "react";

export type FantasyChipKey = "bench_boost" | "free_hit" | "triple_captain" | "wildcard";
export type FantasyChipState = "available" | "active" | "unavailable" | "used";

export interface FantasyChip {
  key: FantasyChipKey;
  state: FantasyChipState;
  /** Optional gameweek hint, e.g. "GW14". */
  hint?: string;
}

const ICONS: Record<FantasyChipKey, ReactNode> = {
  bench_boost: <Zap className="h-3.5 w-3.5" aria-hidden />,
  free_hit: <Repeat className="h-3.5 w-3.5" aria-hidden />,
  triple_captain: <Star className="h-3.5 w-3.5" aria-hidden />,
  wildcard: <Wand2 className="h-3.5 w-3.5" aria-hidden />,
};

/** Per-chip accent gives each chip a distinct visual identity without
 *  becoming casino-flashy. Applied as a soft top glow when available and
 *  as a saturated fill when active. */
const CHIP_ACCENTS: Record<FantasyChipKey, { glow: string; solid: string }> = {
  bench_boost: {
    glow: "color-mix(in oklab, var(--accent-emerald) 55%, transparent)",
    solid: "var(--accent-emerald)",
  },
  free_hit: {
    glow: "color-mix(in oklab, var(--accent-cyan) 55%, transparent)",
    solid: "var(--accent-cyan)",
  },
  triple_captain: {
    glow: "color-mix(in oklab, var(--color-warning) 55%, transparent)",
    solid: "var(--color-warning)",
  },
  wildcard: {
    glow: "color-mix(in oklab, var(--brand-accent) 60%, transparent)",
    solid: "var(--brand-accent)",
  },
};

interface CardProps {
  chip: FantasyChip;
  onClick?: (key: FantasyChipKey) => void;
  className?: string;
}

/**
 * Distinctive glass chip card. Each chip has its own accent colour to
 * signal identity, plus clear states for available / active / unavailable
 * / used. Meaning does not depend on colour alone — the state label is
 * always announced under the chip label.
 */
export function FantasyChipCard({ chip, onClick, className }: CardProps) {
  const { t } = useI18n();
  const label = t(`fantasy.chip.${chip.key}` as TranslationKey);
  const state = chip.state;
  const accent = CHIP_ACCENTS[chip.key];
  const isActive = state === "active";
  const disabled = state === "unavailable" || state === "used";

  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(chip.key) : undefined}
      disabled={disabled}
      className={cn(
        "relative inline-flex min-w-[124px] shrink-0 items-center gap-2 overflow-hidden rounded-2xl px-2.5 py-1.5 text-start text-[11px] font-bold shadow-sm transition-all",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        !isActive && "surface-3",
        isActive && "text-white ring-1 ring-white/25",
        disabled && "opacity-55",
        onClick && state === "available" && "motion-safe:hover:-translate-y-0.5",
        className,
      )}
      style={
        isActive
          ? {
              background: `linear-gradient(135deg, ${accent.solid} 0%, color-mix(in oklab, ${accent.solid} 65%, black) 100%)`,
              boxShadow: `0 8px 18px -8px ${accent.glow}, inset 0 1px 0 rgba(255,255,255,0.25)`,
            }
          : undefined
      }
      aria-pressed={isActive}
      aria-label={`${label} — ${t(`fantasy.chip.state.${state}` as TranslationKey)}`}
    >
      {/* Ambient top glow for available chips — gives each chip a distinct hue. */}
      {!isActive && !disabled && (
        <span
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-8 opacity-70"
          style={{
            background: `radial-gradient(120px 40px at 50% 0%, ${accent.glow}, transparent 70%)`,
          }}
        />
      )}
      <span
        className="relative grid h-7 w-7 shrink-0 place-items-center rounded-full"
        style={
          isActive
            ? { background: "rgba(255,255,255,0.20)", color: "white" }
            : {
                background: `color-mix(in oklab, ${accent.solid} 14%, transparent)`,
                color: accent.solid,
                boxShadow: `inset 0 0 0 1px color-mix(in oklab, ${accent.solid} 28%, transparent)`,
              }
        }
      >
        {ICONS[chip.key]}
      </span>
      <span className="relative flex min-w-0 flex-col leading-tight">
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "text-[9px] font-black uppercase tracking-wider",
            isActive ? "text-white/85" : "text-muted-foreground",
          )}
        >
          {t(`fantasy.chip.state.${state}` as TranslationKey)}
          {chip.hint ? ` · ${chip.hint}` : ""}
        </span>
      </span>
    </button>
  );
}

interface RowProps {
  chips: FantasyChip[];
  onSelect?: (key: FantasyChipKey) => void;
  className?: string;
}

export function FantasyChipsRow({ chips, onSelect, className }: RowProps) {
  return (
    <div className={cn("-mx-1 flex gap-2 overflow-x-auto px-1 pb-1", className)} role="list">
      {chips.map((c) => (
        <div key={c.key} role="listitem">
          <FantasyChipCard chip={c} onClick={onSelect} />
        </div>
      ))}
    </div>
  );
}
