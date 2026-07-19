import type { FantasySummary, Gameweek } from "@/types/domain";
import { useI18n } from "@/i18n/provider";
import { DeadlineCountdown } from "./DeadlineCountdown";
import { Trophy, Shirt, ChevronRight } from "lucide-react";
import { Link } from "@tanstack/react-router";

// Design System V2 — Fantasy CTA hero card.
// Level-4 glass surface with a brand-gradient inner glow and a premium
// primary CTA. Preserves layout, i18n, and RTL behaviour.

export function FantasySummaryCard({ summary, gw }: { summary: FantasySummary; gw: Gameweek }) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  return (
    <div className="surface-4 relative overflow-hidden p-4">
      {/* Subtle brand glow overlay — decorative. */}
      <div
        aria-hidden
        className="pointer-events-none absolute -top-24 -end-16 h-56 w-56 rounded-full"
        style={{
          background:
            "radial-gradient(closest-side, color-mix(in oklab, var(--brand-accent) 30%, transparent), transparent 70%)",
          filter: "blur(8px)",
        }}
      />
      <div className="relative grid grid-cols-[minmax(0,1fr)_auto] items-start gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[11px] font-black uppercase tracking-wider text-[color:var(--brand-accent)]">
            <Trophy className="h-3.5 w-3.5 shrink-0" aria-hidden />
            <span className="truncate">{t("home.gameweek")} {gw.number}</span>
          </div>
          <div className="mt-1 truncate text-lg font-black text-foreground">{summary.teamName}</div>
          <div className="truncate text-xs text-[color:var(--text-secondary)]">{summary.managerName}</div>
        </div>
        <div className="text-end">
          <div className="text-[10px] uppercase tracking-wide text-[color:var(--text-muted)]">
            {t("home.deadline")}
          </div>
          <div className="mt-1">
            <DeadlineCountdown iso={gw.deadline} />
          </div>
        </div>
      </div>

      <div className="relative mt-4 grid grid-cols-4 gap-2 text-center">
        <Metric label={t("fantasy.gw_points")} value={nf.format(summary.gameweekPoints)} accent />
        <Metric label={t("fantasy.total_points")} value={nf.format(summary.totalPoints)} />
        <Metric label={t("fantasy.overall_rank")} value={nf.format(summary.overallRank)} small />
        <Metric label={t("fantasy.transfers")} value={String(summary.transfersLeft)} />
      </div>

      <Link
        to="/fantasy/team"
        aria-label={t("home.view_fantasy_team")}
        className={[
          "relative mt-4 flex w-full min-h-11 items-center justify-center gap-2 rounded-2xl px-4 py-2.5",
          "text-sm font-black text-primary-foreground",
          "shadow-card hover:shadow-floating",
          "transition-[box-shadow,transform] duration-[var(--duration-quick)] ease-[var(--ease-standard)]",
          "active:translate-y-px",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--background)]",
        ].join(" ")}
        style={{ backgroundImage: "var(--bg-brand-gradient)" }}
      >
        <Shirt className="h-4 w-4 shrink-0" aria-hidden />
        <span className="truncate">{t("home.view_fantasy_team")}</span>
        <ChevronRight className="h-4 w-4 shrink-0" aria-hidden />
      </Link>
    </div>
  );
}

function Metric({
  label,
  value,
  accent,
  small,
}: { label: string; value: string; accent?: boolean; small?: boolean }) {
  return (
    <div
      className="rounded-xl px-1.5 py-2"
      style={{
        background: "color-mix(in oklab, var(--surface) 70%, transparent)",
        border: "1px solid var(--border-subtle)",
      }}
    >
      <div
        className={[
          "tabular-nums font-black leading-none",
          accent ? "text-[color:var(--brand-accent)]" : "text-foreground",
          small ? "text-sm" : "text-base",
        ].join(" ")}
      >
        {value}
      </div>
      <div className="mt-1 truncate text-[9px] uppercase tracking-wide text-[color:var(--text-muted)]">
        {label}
      </div>
    </div>
  );
}
