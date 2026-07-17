import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { botolaService } from "@/services/mock";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHeader } from "@/components/common/SectionHeader";
import { FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { PlayerRow } from "@/components/common/PlayerRow";
import { LoadingState, EmptyState } from "@/components/common/States";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { useI18n } from "@/i18n/provider";
import { ChevronRight, TrendingUp } from "lucide-react";
import { Link } from "@tanstack/react-router";

const WELCOME_KEY = "botolago.welcomed";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function useGreeting() {
  const { t } = useI18n();
  const h = new Date().getHours();
  if (h < 12) return t("home.greeting_morning");
  if (h < 18) return t("home.greeting_afternoon");
  return t("home.greeting_evening");
}

function HomePage() {
  const { t, tr } = useI18n();
  const greeting = useGreeting();
  const navigate = useNavigate();

  const [welcomeState, setWelcomeState] = useState<"pending" | "show" | "hide">("pending");
  useEffect(() => {
    try {
      const seen = window.localStorage.getItem(WELCOME_KEY) === "1";
      setWelcomeState(seen ? "hide" : "show");
    } catch {
      setWelcomeState("hide");
    }
  }, []);

  const dismissWelcome = () => {
    try { window.localStorage.setItem(WELCOME_KEY, "1"); } catch { /* ignore */ }
    setWelcomeState("hide");
  };

  if (welcomeState === "show") {
    return (
      <WelcomeScreen
        onStart={dismissWelcome}
        onSignIn={() => {
          dismissWelcome();
          navigate({ to: "/profile" });
        }}
      />
    );
  }


  const summaryQ = useQuery({ queryKey: ["fantasy-summary"], queryFn: () => botolaService.getFantasySummary() });
  const gwQ = useQuery({ queryKey: ["gameweek"], queryFn: () => botolaService.getCurrentGameweek() });
  const matchesQ = useQuery({ queryKey: ["home-matches"], queryFn: () => botolaService.getLiveOrUpcoming() });
  const alertsQ = useQuery({ queryKey: ["alerts"], queryFn: () => botolaService.getFantasyAlerts() });
  const playersQ = useQuery({ queryKey: ["all-players-for-alerts"], queryFn: () => botolaService.getTrendingPlayers() });
  const leadQ = useQuery({ queryKey: ["lead"], queryFn: () => botolaService.getLeadArticle() });
  const followedQ = useQuery({ queryKey: ["followed"], queryFn: () => botolaService.getFollowedClubs() });
  const followedNewsQ = useQuery({ queryKey: ["followed-news"], queryFn: () => botolaService.getArticles({ category: "latest" }) });
  const trendingQ = useQuery({ queryKey: ["trending"], queryFn: () => botolaService.getTrendingPlayers() });
  const clubsQ = useQuery({ queryKey: ["clubs"], queryFn: () => botolaService.getClubs() });
  const leaguesQ = useQuery({ queryKey: ["leagues"], queryFn: () => botolaService.getPrivateLeagues() });

  const clubById = (id: string) => clubsQ.data?.find((c) => c.id === id);

  return (
    <AppShell>
      <div className="pt-2">
        <div className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          {greeting}
        </div>
        <h1 className="mt-1 text-2xl font-black tracking-tight text-foreground">
          {summaryQ.data?.managerName ?? "Manager"}
        </h1>
      </div>

      <div className="mt-4">
        {summaryQ.data && gwQ.data ? (
          <FantasySummaryCard summary={summaryQ.data} gw={gwQ.data} />
        ) : (
          <LoadingState />
        )}
      </div>

      <SectionHeader
        title={t("home.live_upcoming")}
        action={<ViewAllLink to="/matches" />}
      />
      <div className="grid gap-2">
        {matchesQ.isLoading && <LoadingState />}
        {matchesQ.data?.length === 0 && <EmptyState />}
        {matchesQ.data?.map((m) => {
          const home = clubById(m.homeClubId);
          const away = clubById(m.awayClubId);
          if (!home || !away) return null;
          return <MatchCard key={m.id} match={m} home={home} away={away} />;
        })}
      </div>

      <SectionHeader title={t("home.fantasy_alerts")} />
      {alertsQ.data && playersQ.data ? (
        <FantasyAlertList alerts={alertsQ.data} players={playersQ.data} />
      ) : (
        <LoadingState />
      )}

      <SectionHeader title={t("home.lead_story")} />
      {leadQ.data ? <ArticleCard article={leadQ.data} variant="lead" /> : <LoadingState />}

      <SectionHeader
        title={t("home.followed_news")}
        subtitle={followedQ.data?.map((c) => tr(c.shortName)).join(" · ")}
        action={<ViewAllLink to="/news" />}
      />
      <div className="grid gap-3">
        {followedNewsQ.data?.slice(0, 3).map((a) => (
          <ArticleCard key={a.id} article={a} />
        ))}
      </div>

      <SectionHeader
        title={t("home.trending")}
        action={<TrendingUp className="h-4 w-4 text-[color:var(--brand-accent)]" aria-hidden />}
      />
      <div className="grid gap-2">
        {trendingQ.data?.map((p) => (
          <PlayerRow key={p.id} player={p} club={clubById(p.clubId)} />
        ))}
      </div>

      <SectionHeader title={t("home.private_leagues")} action={<ViewAllLink to="/fantasy" />} />
      <div className="grid gap-2">
        {leaguesQ.data?.map((l) => (
          <div key={l.id} className="glass-surface glass-regular flex items-center gap-3 rounded-2xl border border-[var(--glass-border)] px-3 py-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--bg-brand-gradient)] text-sm font-black text-white">
              #{l.rank}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-bold text-foreground">{l.name}</div>
              <div className="truncate text-[11px] text-muted-foreground">{l.members} managers</div>
            </div>
            <div className="text-end text-[11px] text-muted-foreground">
              <span className={l.rank < l.previousRank ? "text-emerald-600 font-bold" : l.rank > l.previousRank ? "text-red-600 font-bold" : ""}>
                {l.rank < l.previousRank ? "▲" : l.rank > l.previousRank ? "▼" : "="} {Math.abs(l.rank - l.previousRank) || "0"}
              </span>
            </div>
          </div>
        ))}
      </div>
    </AppShell>
  );
}

function ViewAllLink({ to }: { to: "/news" | "/matches" | "/fantasy" }) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-0.5 rounded-lg px-2 py-1 text-xs font-semibold text-[color:var(--brand-accent)] hover:bg-accent"
    >
      {t("home.view_all")}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
