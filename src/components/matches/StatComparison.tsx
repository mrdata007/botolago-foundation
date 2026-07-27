import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { MatchStats, MatchTeamStats } from "@/services/match-live";
import type { TranslationKey } from "@/i18n/dictionaries";

const ROWS: { key: keyof MatchTeamStats; label: TranslationKey; percent?: boolean }[] = [
  { key: "shots", label: "matches.stats.shots" },
  { key: "shotsOnTarget", label: "matches.stats.shots_on_target" },
  { key: "corners", label: "matches.stats.corners" },
  { key: "fouls", label: "matches.stats.fouls" },
  { key: "offsides", label: "matches.stats.offsides" },
  { key: "saves", label: "matches.stats.saves" },
  { key: "passAccuracy", label: "matches.stats.pass_accuracy", percent: true },
];

/** Possession split + dual comparison bars, brand-accented on the leading side. */
export function StatComparison({
  stats,
  homeName,
  awayName,
  available,
}: {
  stats: MatchStats;
  homeName: string;
  awayName: string;
  available: boolean;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  if (!available) {
    return (
      <div className="rounded-[var(--radius-card-lg)] border border-dashed border-[var(--border-subtle)] bg-[color:var(--surface)]/40 px-4 py-8 text-center text-sm text-[color:var(--text-secondary)]">
        {t("matches.detail.no_stats")}
      </div>
    );
  }

  return (
    <div className="rounded-[var(--radius-card-lg)] border border-[var(--border-subtle)] bg-[color:var(--background-elevated)] p-4 shadow-card">
      {/* Possession */}
      <div>
        <div className="flex items-center justify-between text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
          <span className="truncate">{homeName}</span>
          <span>{t("matches.stats.possession")}</span>
          <span className="truncate">{awayName}</span>
        </div>
        <div className="mt-2 flex items-center gap-2">
          <span className="font-mono text-lg font-black tabular-nums text-[color:var(--brand-primary)]">
            {nf.format(stats.home.possession)}%
          </span>
          <div className="relative h-2.5 flex-1 overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
            <div
              className="absolute inset-y-0 start-0 rounded-full bg-[color:var(--brand-primary)] transition-[width] duration-500"
              style={{ width: `${stats.home.possession}%` }}
            />
          </div>
          <span className="font-mono text-lg font-black tabular-nums text-[color:var(--text-secondary)]">
            {nf.format(stats.away.possession)}%
          </span>
        </div>
      </div>

      <div className="mt-4 grid gap-3 border-t border-[var(--border-subtle)] pt-4">
        {ROWS.map((row) => {
          const h = stats.home[row.key];
          const a = stats.away[row.key];
          const total = h + a || 1;
          const hPct = (h / total) * 100;
          const homeLeads = h > a;
          const awayLeads = a > h;
          return (
            <div key={row.key}>
              <div className="flex items-center justify-between gap-2 text-[11px] font-semibold">
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    homeLeads
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)]",
                  )}
                >
                  {nf.format(h)}
                  {row.percent ? "%" : ""}
                </span>
                <span className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--text-muted)]">
                  {t(row.label)}
                </span>
                <span
                  className={cn(
                    "font-mono tabular-nums",
                    awayLeads
                      ? "text-[color:var(--brand-primary)]"
                      : "text-[color:var(--text-secondary)]",
                  )}
                >
                  {nf.format(a)}
                  {row.percent ? "%" : ""}
                </span>
              </div>
              <div className="mt-1 flex h-1.5 gap-1 overflow-hidden">
                <div className="flex flex-1 justify-end overflow-hidden rounded-full bg-[color:var(--surface-hover)]">
                  <div
                    className={cn(
                      "h-full rounded-full transition-[width] duration-500",
                      homeLeads
                        ? "bg-[color:var(--brand-primary)]"
                        : "bg-[color:var(--text-muted)]/45",
                    )}
                    style={{ width: `${hPct}%` }}
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
                    style={{ width: `${100 - hPct}%` }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
