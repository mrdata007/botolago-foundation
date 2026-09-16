import { useMemo } from "react";
import type { MatchStatisticComparisonDto } from "@/backend/football/contracts";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/** Generic comparison rows backed exclusively by canonical provider statistics. */
export function StatComparison({
  stats,
  homeName,
  awayName,
  isFinished,
}: {
  stats: readonly MatchStatisticComparisonDto[];
  homeName: string;
  awayName: string;
  isFinished: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = useMemo(
    () =>
      new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        maximumFractionDigits: 2,
      }),
    [lang],
  );

  if (stats.length === 0) {
    return (
      <div className="rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface)]/40 px-4 py-8 text-center text-sm text-[color:var(--text-secondary)]">
        {t(isFinished ? "matches.detail.no_stats_finished" : "matches.detail.no_stats")}
      </div>
    );
  }

  const displayValue = (
    value: number | null,
    provided: string | null,
    valueType: MatchStatisticComparisonDto["valueType"],
    unit: string | null,
  ) => {
    if (provided) return provided;
    if (value === null) return "—";
    const suffix = valueType === "percentage" ? "%" : unit ? ` ${unit}` : "";
    return `${nf.format(value)}${suffix}`;
  };

  return (
    <div className="rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-4 shadow-card">
      <div className="flex items-center justify-between gap-4 border-b border-[var(--border-subtle)] pb-3 text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
        <span className="truncate">{homeName}</span>
        <span className="truncate text-end">{awayName}</span>
      </div>

      <div className="mt-4 grid gap-4">
        {stats.map((stat) => {
          const home = stat.homeValue;
          const away = stat.awayValue;
          const hasComparison = home !== null && away !== null;
          const total = hasComparison ? home + away : 0;
          const homePercent = hasComparison && total > 0 ? (home / total) * 100 : 50;
          const homeLeads = hasComparison && home > away;
          const awayLeads = hasComparison && away > home;

          return (
            <div key={stat.code}>
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    homeLeads
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)]",
                  )}
                >
                  {displayValue(home, stat.homeDisplayValue, stat.valueType, stat.unit)}
                </span>
                <span className="text-center text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  {stat.label}
                </span>
                <span
                  className={cn(
                    "text-end font-mono tabular-nums",
                    awayLeads
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)]",
                  )}
                >
                  {displayValue(away, stat.awayDisplayValue, stat.valueType, stat.unit)}
                </span>
              </div>
              {hasComparison && (
                <div className="mt-1 flex h-1.5 gap-1 overflow-hidden" aria-hidden>
                  <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        homeLeads
                          ? "bg-[color:var(--brand-primary)]"
                          : "bg-[color:var(--text-muted)]/45",
                      )}
                      style={{ width: `${homePercent}%` }}
                    />
                  </div>
                  <div className="flex flex-1 overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
                    <div
                      className={cn(
                        "h-full rounded-full transition-[width] duration-500",
                        awayLeads
                          ? "bg-[color:var(--brand-primary)]"
                          : "bg-[color:var(--text-muted)]/45",
                      )}
                      style={{ width: `${100 - homePercent}%` }}
                    />
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
