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

interface CardProps {
  chip: FantasyChip;
  onClick?: (key: FantasyChipKey) => void;
  className?: string;
}

/**
 * Small glass chip card for future Fantasy chips. Values are mock and
 * config-driven — real rules will come from the backend.
 */
export function FantasyChipCard({ chip, onClick, className }: CardProps) {
  const { t } = useI18n();
  const label = t(`fantasy.chip.${chip.key}` as TranslationKey);
  const state = chip.state;
  return (
    <button
      type="button"
      onClick={onClick ? () => onClick(chip.key) : undefined}
      disabled={state === "unavailable"}
      className={cn(
        "glass-surface glass-regular inline-flex min-w-[112px] shrink-0 items-center gap-1.5 rounded-2xl border border-[var(--glass-border)] px-2.5 py-1.5 text-start text-[11px] font-bold shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
        state === "active" && "bg-[color:var(--brand-primary)] text-white ring-1 ring-[color:var(--brand-accent)]",
        state === "unavailable" && "opacity-55",
        onClick && state !== "unavailable" && "hover:-translate-y-0.5",
        className,
      )}
      aria-pressed={state === "active"}
      aria-label={`${label} — ${t(`fantasy.chip.state.${state}` as TranslationKey)}`}
    >
      <span
        className={cn(
          "grid h-6 w-6 place-items-center rounded-full",
          state === "active" ? "bg-white/20 text-white" : "bg-[color:var(--brand-primary)]/10 text-[color:var(--brand-primary)]",
        )}
      >
        {ICONS[chip.key]}
      </span>
      <span className="flex min-w-0 flex-col leading-tight">
        <span className="truncate">{label}</span>
        <span
          className={cn(
            "text-[9px] font-black uppercase tracking-wider",
            state === "active" ? "text-white/80" : "text-muted-foreground",
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
