import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { newsService } from "@/services/news";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import { ErrorState, LoadingState } from "@/components/common/States";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { PlayerRow } from "@/components/common/PlayerRow";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { useI18n } from "@/i18n/provider";
import { Sparkles, TrendingUp, Trophy } from "lucide-react";

export const Route = createFileRoute("/fantasy/")({
  component: FantasyHub,
});

function FantasyHub() {
  const { t, lang } = useI18n();
  const gw = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
  });
  const alerts = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fantasyService.getAlerts(),
  });
  const trending = useQuery({
    queryKey: ["trending"],
    queryFn: () => fantasyService.getTrendingPlayers(),
  });
  const clubs = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });
  const leagues = useQuery({
    queryKey: ["fantasy-leagues"],
    queryFn: () => fantasyService.getLeagues("private"),
  });
  const articles = useQuery({
    queryKey: ["fantasy-articles"],
    queryFn: () => newsService.getArticles(lang, { category: "for_you" }),
  });

  const clubById = (id: string) => clubs.data?.find((c) => c.id === id);

  return (
    <div>
      <div className="flex items-baseline justify-between gap-3">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.18em] text-[color:var(--brand-accent)]">
            <Sparkles className="h-3 w-3" aria-hidden />
            {gw.data ? `${t("home.gameweek")} ${gw.data.number}` : t("fantasy.title")}
          </div>
          <h1 className="mt-1 text-[26px] font-black tracking-tight text-foreground">
            <span className="text-brand">{t("fantasy.title")}</span>
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            <Trans text={t("fantasy.subtitle")} accentClassName="text-brand font-semibold" />
          </p>
        </div>
      </div>

      <SectionHeader title={t("fantasy.injury_alerts")} />
      {alerts.isError || trending.isError ? (
        <ErrorState
          onRetry={() => {
            void alerts.refetch();
            void trending.refetch();
          }}
        />
      ) : alerts.data && trending.data ? (
        <FantasyAlertList alerts={alerts.data} players={trending.data} />
      ) : (
        <LoadingState />
      )}

      <SectionHeader title={t("fantasy.recent_news")} />
      <div className="grid gap-3">
        {articles.isError ? (
          <ErrorState onRetry={() => void articles.refetch()} />
        ) : articles.isLoading ? (
          <LoadingState />
        ) : (
          articles.data?.slice(0, 2).map((a) => <ArticleCard key={a.id} article={a} />)
        )}
      </div>

      <SectionHeader
        title={t("fantasy.trending")}
        action={<TrendingUp className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />}
      />
      <div className="grid gap-2">
        {trending.isError ? (
          <ErrorState onRetry={() => void trending.refetch()} />
        ) : trending.isLoading ? (
          <LoadingState />
        ) : (
          trending.data?.map((p) => <PlayerRow key={p.id} player={p} club={clubById(p.clubId)} />)
        )}
      </div>

      <SectionHeader
        title={t("fantasy.mini_league")}
        action={
          <Link
            to="/fantasy/leagues"
            className="text-xs font-semibold text-[color:var(--brand-accent)]"
          >
            {t("home.view_all")}
          </Link>
        }
      />
      <div className="grid gap-2">
        {leagues.isError ? (
          <ErrorState onRetry={() => void leagues.refetch()} />
        ) : leagues.isLoading ? (
          <LoadingState />
        ) : (
          leagues.data?.map((l) => (
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
                <div className="text-[11px] text-muted-foreground">
                  {l.members} {t("fantasy.leagues.members")}
                </div>
              </div>
              <div className="text-end">
                <div className="text-sm font-black tabular-nums">
                  {l.rank === null ? "—" : `#${l.rank}`}
                </div>
                {l.rank !== null && (
                  <RankChangeIndicator rank={l.rank} previousRank={l.previousRank ?? l.rank} />
                )}
              </div>
            </Link>
          ))
        )}
      </div>
    </div>
  );
}

