import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight,
  Flame,
  CircleDot,
  Bell,
  Newspaper,
  Heart,
  TrendingUp,
  Trophy,
} from "lucide-react";

import { botolaService } from "@/services/mock";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { PlayerRow } from "@/components/common/PlayerRow";
import { EmptyState } from "@/components/common/States";
import {
  HeroSkeleton,
  MatchCardSkeleton,
  ArticleCardSkeleton,
  PlayerRowSkeleton,
  AlertRowSkeleton,
  LeagueRowSkeleton,
  SkeletonList,
} from "@/components/common/Skeletons";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { cn } from "@/lib/utils";

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
  const navigate = useNavigate();
  const { status } = useAuth();
  const { t } = useI18n();

  // Read localStorage only after mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const showWelcome = mounted && status === "anonymous" && !hasWelcomed();

  if (showWelcome) {
    return (
      <WelcomeScreen
        onStart={() => navigate({ to: "/auth/register" })}
        onSignIn={() => navigate({ to: "/auth/login" })}
        onGuest={async () => {
          await authService.continueAsGuest();
          markWelcomeDone();
          toast.success(t("auth.success.guest"));
        }}
      />
    );
  }
  return <HomeContent />;
}

/**
 * BotolaGO Home — Design System V2 editorial redesign.
 *
 * Layout intent:
 *   1. Hero  — greeting eyebrow + manager H1 + date/GW meta, followed by
 *              the Fantasy summary hero card. Feels like a premium landing.
 *   2. Live/upcoming matches — score-first, highly scannable.
 *   3. Fantasy alerts — colored tone-per-severity.
 *   4. Lead story — editorial 16:10 with strong overlay + refined chip.
 *   5. Followed clubs — three refined article cards.
 *   6. Trending players — ranked leaderboard.
 *   7. Private leagues — structured, badge-first.
 *
 * Each section owns its identity via SectionHeader (eyebrow + icon) and
 * flows into the next through Section's consistent rhythm + stagger.
 */
function HomeContent() {
  const { t, tr, lang } = useI18n();
  const greeting = useGreeting();

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

  // Localized full date used in the hero meta line.
  const dateLine = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return fmt.format(new Date());
  }, [lang]);

  const nf = useMemo(
    () => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR"),
    [lang],
  );

  return (
    <AppShell>
      {/* -------------------------------------------------------- */}
      {/* Hero                                                     */}
      {/* -------------------------------------------------------- */}
      <div
        className={cn(
          "pt-3 sm:pt-4",
          "animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out",
        )}
      >
        <div className="inline-flex items-center gap-1.5">
          <Flame className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-accent)]" aria-hidden />
          <span className="text-[11px] font-black uppercase tracking-[0.16em] text-brand">
            {greeting}
          </span>
        </div>
        <h1 className="mt-1.5 truncate text-[28px] font-black leading-[1.05] tracking-tight text-foreground sm:text-[32px]">
          {summaryQ.data?.managerName ?? "Manager"}
        </h1>
        <p className="mt-1 truncate text-[13px] text-[color:var(--text-secondary)]">
          {gwQ.data ? `${t("home.gameweek")} ${gwQ.data.number}` : ""}
          {gwQ.data ? " · " : ""}
          <span className="capitalize">{dateLine}</span>
        </p>
      </div>

      <div
        className="mt-5 animate-in fade-in-0 slide-in-from-bottom-2 duration-500 ease-out"
        style={{ animationDelay: "60ms", animationFillMode: "both" }}
      >
        {summaryQ.data && gwQ.data ? (
          <FantasySummaryCard summary={summaryQ.data} gw={gwQ.data} />
        ) : (
          <HeroSkeleton />
        )}
      </div>

      {/* -------------------------------------------------------- */}
      {/* Live & upcoming matches                                  */}
      {/* -------------------------------------------------------- */}
      <Section index={1}>
        <SectionHeader
          eyebrow={t("nav.matches")}
          icon={CircleDot}
          title={t("home.live_upcoming")}
          action={<ViewAllLink to="/matches" />}
        />
        <div className="grid gap-2">
          {matchesQ.isLoading && (
            <SkeletonList count={2}>{() => <MatchCardSkeleton />}</SkeletonList>
          )}
          {!matchesQ.isLoading && matchesQ.data?.length === 0 && (
            <EmptyState compact>{t("state.empty")}</EmptyState>
          )}
          {matchesQ.data?.map((m) => {
            const home = clubById(m.homeClubId);
            const away = clubById(m.awayClubId);
            if (!home || !away) return null;
            return <MatchCard key={m.id} match={m} home={home} away={away} />;
          })}
        </div>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* Fantasy alerts                                           */}
      {/* -------------------------------------------------------- */}
      <Section index={2}>
        <SectionHeader
          eyebrow={t("nav.fantasy")}
          icon={Bell}
          title={t("home.fantasy_alerts")}
        />
        {alertsQ.data && playersQ.data ? (
          alertsQ.data.length === 0 ? (
            <EmptyState compact>{t("state.empty")}</EmptyState>
          ) : (
            <FantasyAlertList alerts={alertsQ.data} players={playersQ.data} />
          )
        ) : (
          <SkeletonList count={2}>{() => <AlertRowSkeleton />}</SkeletonList>
        )}
      </Section>

      {/* -------------------------------------------------------- */}
      {/* Lead story                                               */}
      {/* -------------------------------------------------------- */}
      <Section index={3}>
        <SectionHeader
          eyebrow={t("nav.news")}
          icon={Newspaper}
          title={t("home.lead_story")}
        />
        {leadQ.data ? (
          <ArticleCard article={leadQ.data} variant="lead" />
        ) : (
          <ArticleCardSkeleton variant="lead" />
        )}
      </Section>

      {/* -------------------------------------------------------- */}
      {/* Followed clubs                                           */}
      {/* -------------------------------------------------------- */}
      <Section index={4}>
        <SectionHeader
          eyebrow={t("nav.news")}
          icon={Heart}
          title={t("home.followed_news")}
          subtitle={followedQ.data?.map((c) => tr(c.shortName)).join(" · ")}
          action={<ViewAllLink to="/news" />}
        />
        <div className="grid gap-3">
          {!followedNewsQ.data && (
            <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
          )}
          {followedNewsQ.data?.slice(0, 3).map((a) => (
            <ArticleCard key={a.id} article={a} />
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* Trending players                                         */}
      {/* -------------------------------------------------------- */}
      <Section index={5}>
        <SectionHeader
          eyebrow={t("nav.fantasy")}
          icon={TrendingUp}
          title={t("home.trending")}
        />
        <div className="grid gap-2">
          {!trendingQ.data && (
            <SkeletonList count={4}>{() => <PlayerRowSkeleton />}</SkeletonList>
          )}
          {trendingQ.data?.map((p, i) => (
            <PlayerRow
              key={p.id}
              player={p}
              club={clubById(p.clubId)}
              rank={i + 1}
            />
          ))}
        </div>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* Private leagues                                          */}
      {/* -------------------------------------------------------- */}
      <Section index={6} className="pb-2">
        <SectionHeader
          eyebrow={t("nav.fantasy")}
          icon={Trophy}
          title={t("home.private_leagues")}
          action={<ViewAllLink to="/fantasy" />}
        />
        <div className="grid gap-2">
          {!leaguesQ.data && (
            <SkeletonList count={3}>{() => <LeagueRowSkeleton />}</SkeletonList>
          )}
          {leaguesQ.data?.map((l) => {
            const delta = l.previousRank - l.rank; // positive = climbed
            const climbed = delta > 0;
            const dropped = delta < 0;
            return (
              <div
                key={l.id}
                className={cn(
                  "surface-2-interactive flex items-center gap-3 px-3 py-3",
                )}
              >
                <div
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-xl text-sm font-black text-white shadow-inner"
                  style={{ backgroundImage: "var(--bg-brand-gradient)" }}
                  aria-hidden
                >
                  #{l.rank}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-sm font-bold text-foreground">{l.name}</div>
                  <div className="truncate text-[11px] text-[color:var(--text-muted)]">
                    {nf.format(l.members)} managers
                  </div>
                </div>
                <div
                  className={cn(
                    "inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-black tabular-nums",
                    climbed &&
                      "bg-[color:color-mix(in_oklab,var(--color-success)_14%,transparent)] text-[color:var(--color-success)]",
                    dropped &&
                      "bg-[color:color-mix(in_oklab,var(--color-danger)_14%,transparent)] text-[color:var(--color-danger)]",
                    !climbed && !dropped &&
                      "bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)]",
                  )}
                  aria-label={
                    climbed
                      ? `+${delta}`
                      : dropped
                        ? `${delta}`
                        : "0"
                  }
                >
                  <span aria-hidden>{climbed ? "▲" : dropped ? "▼" : "="}</span>
                  {Math.abs(delta) || 0}
                </div>
              </div>
            );
          })}
        </div>
      </Section>
    </AppShell>
  );
}

function ViewAllLink({ to }: { to: "/news" | "/matches" | "/fantasy" }) {
  const { t } = useI18n();
  return (
    <Link
      to={to}
      className={cn(
        "inline-flex min-h-9 items-center gap-0.5 rounded-lg px-2 py-1.5 text-xs font-semibold",
        "text-[color:var(--brand-accent)] transition-colors duration-[var(--duration-quick)]",
        "hover:bg-[color:color-mix(in_oklab,var(--brand-accent)_10%,transparent)]",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brand-accent)]",
      )}
    >
      {t("home.view_all")}
      <ChevronRight className="h-3.5 w-3.5" aria-hidden />
    </Link>
  );
}
