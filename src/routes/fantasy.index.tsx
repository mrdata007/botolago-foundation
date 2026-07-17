import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { botolaService } from "@/services/mock";
import { fantasyService } from "@/services/fantasy-mock";
import { FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { LoadingState } from "@/components/common/States";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { PlayerRow } from "@/components/common/PlayerRow";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { useI18n } from "@/i18n/provider";
import { ArrowRightLeft, CalendarDays, LayoutGrid, ListChecks, TrendingUp, Trophy, UserCog, Users } from "lucide-react";
import type { TranslationKey } from "@/i18n/dictionaries";

export const Route = createFileRoute("/fantasy/")({
  component: FantasyHub,
});

type QuickAction = { to: "/fantasy/team" | "/fantasy/transfers" | "/fantasy/points" | "/fantasy/leagues" | "/fantasy/players" | "/fantasy/fixtures"; labelKey: TranslationKey; icon: React.ComponentType<{ className?: string }> };
const quickActions: QuickAction[] = [
  { to: "/fantasy/team", labelKey: "fantasy.tab.team", icon: UserCog },
  { to: "/fantasy/transfers", labelKey: "fantasy.tab.transfers", icon: ArrowRightLeft },
  { to: "/fantasy/points", labelKey: "fantasy.tab.points", icon: ListChecks },
  { to: "/fantasy/leagues", labelKey: "fantasy.tab.leagues", icon: Users },
  { to: "/fantasy/players", labelKey: "fantasy.tab.players", icon: LayoutGrid },
  { to: "/fantasy/fixtures", labelKey: "fantasy.tab.fixtures", icon: CalendarDays },
];

function FantasyHub() {
  const { t, lang } = useI18n();
  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR", { maximumFractionDigits: 1 });
  const summary = useQuery({ queryKey: ["fantasy-summary"], queryFn: () => botolaService.getFantasySummary() });
  const gw = useQuery({ queryKey: ["gameweek"], queryFn: () => botolaService.getCurrentGameweek() });
  const alerts = useQuery({ queryKey: ["alerts"], queryFn: () => botolaService.getFantasyAlerts() });
  const trending = useQuery({ queryKey: ["trending"], queryFn: () => botolaService.getTrendingPlayers() });
  const clubs = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const leagues = useQuery({ queryKey: ["fantasy-leagues"], queryFn: () => fantasyService.getLeagues("private") });
  const articles = useQuery({ queryKey: ["fantasy-articles"], queryFn: () => botolaService.getArticles({ category: "for_you" }) });

  const clubById = (id: string) => clubs.data?.find((c) => c.id === id);

  return (
    <div>
      <h1 className="text-2xl font-black tracking-tight text-foreground">{t("fantasy.title")}</h1>
      <p className="mt-1 text-sm text-muted-foreground">{t("fantasy.subtitle")}</p>

      <div className="mt-3">
        {summary.data && gw.data ? (
          <FantasySummaryCard summary={summary.data} gw={gw.data} />
        ) : (
          <LoadingState />
        )}
      </div>

      {summary.data && (
        <div className="mt-3 grid grid-cols-3 gap-2">
          <MiniStat label={t("fantasy.team_value")} value={nf.format(summary.data.teamValue)} />
          <MiniStat label={t("fantasy.bank")} value={nf.format(summary.data.bankValue)} />
          <MiniStat label={t("fantasy.free_transfers")} value={String(summary.data.transfersLeft)} />
        </div>
      )}

      <SectionHeader title={t("fantasy.quick_actions")} />
      <div className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {quickActions.map((a) => (
          <Link
            key={a.to}
            to={a.to}
            className="glass-surface glass-regular flex flex-col items-center gap-1.5 rounded-2xl border border-[var(--glass-border)] px-2 py-3 text-center transition-transform motion-safe:hover:-translate-y-0.5"
          >
            <div className="grid h-8 w-8 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-white">
              <a.icon className="h-4 w-4" aria-hidden />
            </div>
            <span className="text-[11px] font-semibold text-foreground">{t(a.labelKey)}</span>
          </Link>
        ))}
      </div>

      <SectionHeader title={t("fantasy.injury_alerts")} />
      {alerts.data && trending.data ? (
        <FantasyAlertList alerts={alerts.data} players={trending.data} />
      ) : (
        <LoadingState />
      )}

      <SectionHeader title={t("fantasy.recent_news")} />
      <div className="grid gap-3">
        {articles.data?.slice(0, 2).map((a) => <ArticleCard key={a.id} article={a} />)}
      </div>

      <SectionHeader
        title={t("fantasy.trending")}
        action={<TrendingUp className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />}
      />
      <div className="grid gap-2">
        {trending.data?.map((p) => <PlayerRow key={p.id} player={p} club={clubById(p.clubId)} />)}
      </div>

      <SectionHeader title={t("fantasy.mini_league")} action={<Link to="/fantasy/leagues" className="text-xs font-semibold text-[color:var(--brand-accent)]">{t("home.view_all")}</Link>} />
      <div className="grid gap-2">
        {leagues.data?.map((l) => (
          <Link
            key={l.id}
            to="/fantasy/leagues/$leagueId"
            params={{ leagueId: l.id }}
            className="glass-surface glass-regular flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-3 py-3"
          >
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-sm font-black text-white">
              <Trophy className="h-4 w-4" aria-hidden />
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-foreground">{l.name}</div>
              <div className="text-[11px] text-muted-foreground">{l.members} {t("fantasy.leagues.members")}</div>
            </div>
            <div className="text-end">
              <div className="text-sm font-black tabular-nums">#{l.rank}</div>
              <RankChangeIndicator rank={l.rank} previousRank={l.previousRank} />
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-surface glass-regular rounded-2xl border border-[var(--glass-border)] px-2 py-2 text-center">
      <div className="text-sm font-black tabular-nums text-foreground">{value}</div>
      <div className="mt-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
    </div>
  );
}
