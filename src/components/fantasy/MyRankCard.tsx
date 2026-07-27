import { Link } from "@tanstack/react-router";
import type { LeagueStanding } from "@/types/fantasy";
import { useI18n } from "@/i18n/provider";
import { RankChangeIndicator } from "./RankChangeIndicator";
import { Target, UserPlus } from "lucide-react";

export function MyRankCard({
  standing,
  onJump,
}: {
  standing?: LeagueStanding;
  onJump?: () => void;
}) {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");

  if (!standing) {
    return (
      <div className="glass-surface glass-regular flex flex-col gap-3 rounded-2xl border border-[var(--glass-border)] p-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-black text-foreground">{t("fantasy.rankings.no_team")}</p>
          <p className="text-xs text-muted-foreground">{t("fantasy.rankings.no_team_desc")}</p>
        </div>
        <Link
          to="/fantasy/create"
          className="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl cta-brand px-4 text-sm font-bold transition-opacity hover:opacity-95"
        >
          <UserPlus className="h-4 w-4" aria-hidden />
          {t("fantasy.rankings.create_team")}
        </Link>
      </div>
    );
  }

  return (
    <div
      className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] p-4"
      style={{ boxShadow: "var(--shadow-card)" }}
    >
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--brand-accent)]">
            {t("fantasy.rankings.my_rank")}
          </p>
          <p className="truncate text-sm font-bold text-foreground">{standing.teamName}</p>
        </div>
        <RankChangeIndicator rank={standing.rank} previousRank={standing.previousRank} />
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        <Stat label={t("fantasy.overall_rank")} value={nf.format(standing.rank)} accent />
        <Stat label={t("fantasy.total_points")} value={nf.format(standing.totalScore)} />
        <Stat label={t("fantasy.gw_points")} value={nf.format(standing.gameweekScore)} />
      </div>
      {onJump && (
        <button
          type="button"
          onClick={onJump}
          className="mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-2xl border border-[var(--border-subtle)] bg-card px-4 text-sm font-bold text-foreground transition-colors hover:bg-muted"
        >
          <Target className="h-4 w-4" aria-hidden />
          {t("fantasy.rankings.jump_to_me")}
        </button>
      )}
    </div>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-xl bg-background/60 px-2 py-2 text-center ring-1 ring-black/5">
      <div className="text-[9px] font-black uppercase tracking-wider text-muted-foreground">
        {label}
      </div>
      <div
        className={`text-base font-black tabular-nums ${accent ? "text-[color:var(--brand-accent)]" : "text-foreground"}`}
      >
        {value}
      </div>
    </div>
  );
}
