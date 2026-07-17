import type { FantasySummary, Gameweek } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { Trophy } from "lucide-react";

export function FantasySummaryCard({ summary, gw }: { summary: FantasySummary; gw: Gameweek }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <div className="glass-surface glass-strong overflow-hidden rounded-3xl border border-[var(--glass-border)] p-4 shadow-lg shadow-black/5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[color:var(--brand-accent)]">
            <Trophy className="h-3.5 w-3.5" aria-hidden /> {t("home.gameweek")} {gw.number}
          </div>
          <div className="mt-1 truncate text-lg font-black text-foreground">{summary.teamName}</div>
          <div className="truncate text-xs text-muted-foreground">{summary.managerName}</div>
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{t("home.deadline")}</div>
          <div className="mt-1"><DeadlineCountdown iso={gw.deadline} /></div>
        </div>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label={t("fantasy.gw_points")} value={nf.format(summary.gameweekPoints)} accent />
        <Metric label={t("fantasy.total_points")} value={nf.format(summary.totalPoints)} />
        <Metric label={t("fantasy.overall_rank")} value={nf.format(summary.overallRank)} small />
        <Metric label={t("fantasy.transfers")} value={String(summary.transfersLeft)} />
      </div>
    </div>
  );
}

function Metric({ label, value, accent, small }: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div className="rounded-xl bg-white/40 px-1.5 py-2">
      <div className={`tabular-nums font-black leading-none ${accent ? "text-[color:var(--brand-accent)]" : "text-foreground"} ${small ? "text-sm" : "text-base"}`}>
        {value}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
