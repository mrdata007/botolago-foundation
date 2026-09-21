import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronRight,
  Flame,
  CircleDot,
  Bell,
  Newspaper,
  Trophy,
  Compass,
  UserRound,
} from "lucide-react";

import { newsService } from "@/services/news";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { FantasyUnavailableState } from "@/components/fantasy/FantasyUnavailableState";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { ClubCrest } from "@/components/common/ClubCrest";
import { EmptyState, ErrorState } from "@/components/common/States";
import {
  HeroSkeleton,
  MatchCardSkeleton,
  ArticleCardSkeleton,
  AlertRowSkeleton,
  StandingsRowSkeleton,
  SkeletonList,
} from "@/components/common/Skeletons";
import { WelcomeScreen } from "@/components/welcome/WelcomeScreen";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { cn } from "@/lib/utils";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

const HOME_TITLE = "BotolaGO — Actualité, matchs et Fantasy du football marocain";
const HOME_DESCRIPTION =
  "Suivez la Botola Pro sur BotolaGO : résultats en direct, actualités, classement et votre équipe Fantasy.";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: HOME_TITLE },
      { name: "description", content: HOME_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: HOME_TITLE },
      { property: "og:description", content: HOME_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: HOME_TITLE },
      { name: "twitter:description", content: HOME_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/` }],
  }),
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
 * BotolaGO Home (Accueil) — dashboard redesign (BG-0012).
 *
 * A genuine "control center" landing screen, not a duplicate of the News
 * page. Fixed structure, styled with the same semantic tokens/surfaces as
 * the Fantasy design system (`--brand-*`, `surface-*`, `shadow-*`):
 *
 *   1. Compact greeting        — eyebrow + name + gameweek/date, no giant hero
 *   2. Matches                 — live/upcoming, score-first cards
 *   3. Fantasy                 — gameweek deadline + team entry/summary card
 *   4. News preview            — a few curated cards linking into /news
 *   5. Standings snapshot      — top of the table, only when real data exists
 *   6. Discovery links         — quick access to Matches/Fantasy/News/Profile
 */
function HomeContent() {
  const { t, tr, lang } = useI18n();
  const { status, user } = useAuth();
  const { source, key } = useFantasyDataSource();
  const greeting = useGreeting();
  const availability = useFantasyAvailability();
  const fantasyReady = !availability.isError && availability.data?.status === "ready";
  const canCreate = availability.data?.status === "ready" && availability.data.canCreate;

  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: fantasyReady && source !== "guest",
  });
  const gwQ = useQuery({
    queryKey: ["gameweek"],
    queryFn: () => fantasyService.getCurrentGameweek(),
    enabled: fantasyReady,
  });
  const matchesQ = useQuery({
    queryKey: ["football", "home-matches", lang],
    queryFn: () => footballService.getHomeMatches(lang),
  });
  const alertsQ = useQuery({
    queryKey: ["alerts"],
    queryFn: () => fantasyService.getAlerts(),
    enabled: fantasyReady,
  });
  const playersQ = useQuery({
    queryKey: ["all-players-for-alerts"],
    queryFn: () => fantasyService.getTrendingPlayers(),
    enabled: fantasyReady,
  });
  const newsQ = useQuery({
    queryKey: ["news", "edition", lang, "auto"] as const,
    queryFn: () => newsService.getEdition(lang, "auto"),
  });
  const clubsQ = useQuery({
    queryKey: ["football", "clubs", lang],
    queryFn: () => footballService.getClubs(lang),
  });

  // Standings snapshot reuses the same real data source as /matches
  // (getHomeMatches never carries a table; a season-scoped fetch does).
  // No standings route/component exists yet, so this section renders only
  // once a real, non-empty table comes back — never a fabricated one.
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });
  const currentSeasonId = useMemo(
    () => seasonsQ.data?.find((season) => season.isCurrent)?.id ?? seasonsQ.data?.[0]?.id,
    [seasonsQ.data],
  );
  const standingsQ = useQuery({
    queryKey: ["football", "home-standings", lang, currentSeasonId],
    queryFn: () => footballService.getMatchDay(new Date(), lang, currentSeasonId),
    enabled: seasonsQ.isSuccess,
  });

  const clubById = (id: string) =>
    matchesQ.data?.clubs.find((club) => club.id === id) ??
    standingsQ.data?.clubs.find((club) => club.id === id) ??
    clubsQ.data?.find((club) => club.id === id);

  // Localized full date used in the greeting meta line.
  const dateLine = useMemo(() => {
    const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return fmt.format(new Date());
  }, [lang]);

  // Up to three curated stories: the edition's lead plus its next articles.
  // Never the full News page — a lightweight preview only.
  const newsPreview = useMemo(() => {
    const edition = newsQ.data;
    if (!edition) return null;
    const rest = edition.articles.filter((a) => a.id !== edition.lead?.id);
    return [...(edition.lead ? [edition.lead] : []), ...rest].slice(0, 3);
  }, [newsQ.data]);

  const standingsLoading = seasonsQ.isPending || (seasonsQ.isSuccess && standingsQ.isPending);
  const standingsFailed = seasonsQ.isError || standingsQ.isError;
  const standingsRows = standingsQ.data?.standings ?? [];
  const showStandings = standingsLoading || standingsFailed || standingsRows.length > 0;

  return (
    <AppShell>
      {/* -------------------------------------------------------- */}
      {/* 1. Compact greeting                                      */}
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
        {/* The visible line is the manager's name, which says nothing about the
            page. Crawlers and screen-reader users get a descriptive H1 instead,
            and the name keeps its exact visual treatment below it. */}
        <h1 className="sr-only">{HOME_TITLE}</h1>
        <div className="mt-1.5 truncate text-[22px] font-black leading-[1.1] tracking-tight text-foreground sm:text-2xl">
          {user?.displayName?.trim() || summaryQ.data?.managerName || "Manager"}
        </div>
        <p className="mt-1 truncate text-[13px] text-[color:var(--text-secondary)]">
          {gwQ.data ? `${t("home.gameweek")} ${gwQ.data.number}` : ""}
          {gwQ.data ? " · " : ""}
          <span className="capitalize">{dateLine}</span>
        </p>
      </div>

      {/* -------------------------------------------------------- */}
      {/* 2. Matches                                                */}
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
          {matchesQ.isError && <ErrorState onRetry={() => void matchesQ.refetch()} />}
          {!matchesQ.isLoading && matchesQ.data?.matches.length === 0 && (
            <EmptyState compact>{t("state.empty")}</EmptyState>
          )}
          {matchesQ.data?.matches.map((m) => {
            const home = clubById(m.homeClubId);
            const away = clubById(m.awayClubId);
            if (!home || !away) return null;
            return <MatchCard key={m.id} match={m} home={home} away={away} />;
          })}
        </div>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* 3. Fantasy — gameweek deadline / team entry                */}
      {/* -------------------------------------------------------- */}
      <Section index={2}>
        <SectionHeader
          eyebrow={t("nav.fantasy")}
          icon={Trophy}
          title={t("home.fantasy_hub")}
          action={<ViewAllLink to="/fantasy" />}
        />
        {status === "loading" || availability.isPending ? (
          <HeroSkeleton />
        ) : availability.isError ? (
          <ErrorState onRetry={() => void availability.refetch()} />
        ) : availability.data.status !== "ready" ? (
          <FantasyUnavailableState reason={availability.data.status} />
        ) : source === "guest" ? (
          <Link
            to={canCreate ? "/fantasy/create" : "/fantasy"}
            className="surface-4 flex min-h-24 items-center justify-center rounded-2xl px-4 text-center text-sm font-black text-[color:var(--brand-primary)]"
          >
            {t(canCreate ? "fantasy.create.title" : "fantasy.title")}
          </Link>
        ) : summaryQ.isError || gwQ.isError ? (
          <ErrorState
            onRetry={() => {
              void summaryQ.refetch();
              void gwQ.refetch();
            }}
          />
        ) : summaryQ.data && gwQ.data ? (
          <FantasySummaryCard
            summary={{
              ...summaryQ.data,
              managerName: user?.displayName?.trim() || summaryQ.data.managerName,
            }}
            gw={gwQ.data}
          />
        ) : summaryQ.isSuccess && summaryQ.data === null ? (
          <Link
            to={canCreate ? "/fantasy/create" : "/fantasy"}
            className="surface-4 flex min-h-24 items-center justify-center rounded-2xl px-4 text-center text-sm font-black text-[color:var(--brand-primary)]"
          >
            {t(canCreate ? "fantasy.create.title" : "fantasy.title")}
          </Link>
        ) : (
          <HeroSkeleton />
        )}

        {fantasyReady && source !== "guest" && (
          <div className="mt-3">
            {alertsQ.isError || playersQ.isError ? null : alertsQ.data && playersQ.data ? (
              alertsQ.data.length > 0 && (
                <>
                  <div className="mb-1.5 inline-flex items-center gap-1.5">
                    <Bell
                      className="h-3.5 w-3.5 shrink-0 text-[color:var(--brand-accent)]"
                      aria-hidden
                    />
                    <span className="text-[10px] font-black uppercase tracking-[0.14em] text-[color:var(--text-muted)]">
                      {t("home.fantasy_alerts")}
                    </span>
                  </div>
                  <FantasyAlertList alerts={alertsQ.data} players={playersQ.data} />
                </>
              )
            ) : (
              <SkeletonList count={1}>{() => <AlertRowSkeleton />}</SkeletonList>
            )}
          </div>
        )}
      </Section>

      {/* -------------------------------------------------------- */}
      {/* 4. News preview                                           */}
      {/* -------------------------------------------------------- */}
      <Section index={3}>
        <SectionHeader
          eyebrow={t("nav.news")}
          icon={Newspaper}
          title={t("home.news_preview")}
          action={<ViewAllLink to="/news" />}
        />
        <div className="grid gap-2.5">
          {newsQ.isError ? (
            <ErrorState onRetry={() => void newsQ.refetch()} />
          ) : !newsPreview ? (
            <SkeletonList count={3}>{() => <ArticleCardSkeleton />}</SkeletonList>
          ) : newsPreview.length === 0 ? (
            <EmptyState compact>{t("state.empty")}</EmptyState>
          ) : (
            newsPreview.map((a) => (
              <ArticleCard key={a.id} article={a} variant="compact" clubs={clubsQ.data ?? []} />
            ))
          )}
        </div>
      </Section>

      {/* -------------------------------------------------------- */}
      {/* 5. Standings snapshot — only when the backend has one     */}
      {/* -------------------------------------------------------- */}
      {showStandings && (
        <Section index={4}>
          <SectionHeader
            eyebrow={t("matches.competition.botola")}
            title={t("matches.table_preview")}
            action={<ViewAllLink to="/matches" />}
          />
          {standingsLoading ? (
            <SkeletonList count={5}>{() => <StandingsRowSkeleton />}</SkeletonList>
          ) : standingsFailed ? (
            <ErrorState
              onRetry={() => {
                void seasonsQ.refetch();
                void standingsQ.refetch();
              }}
            />
          ) : (
            <div className="grid gap-1.5">
              {standingsRows.slice(0, 5).map((row) => {
                const club = clubById(row.clubId);
                if (!club) return null;
                return (
                  <div
                    key={row.clubId}
                    className="flex items-center gap-2.5 rounded-[var(--radius-card)] border border-[var(--border-subtle)] bg-[color:var(--surface)] px-3 py-2"
                  >
                    <span
                      className="w-4 shrink-0 text-center font-mono text-xs font-black tabular-nums text-[color:var(--text-muted)]"
                      aria-hidden
                    >
                      {row.position}
                    </span>
                    <ClubCrest club={club} size="sm" />
                    <span className="min-w-0 flex-1 truncate text-sm font-bold text-foreground">
                      {tr(club.shortName)}
                    </span>
                    <span
                      className="w-7 shrink-0 text-center text-[11px] tabular-nums text-[color:var(--text-muted)]"
                      aria-label={t("matches.table.played")}
                    >
                      {row.played}
                    </span>
                    <span
                      className="w-8 shrink-0 text-center text-[11px] tabular-nums text-[color:var(--text-muted)]"
                      aria-label={t("matches.table.goal_difference")}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </span>
                    <span
                      className="w-8 shrink-0 text-end text-sm font-black tabular-nums text-foreground"
                      aria-label={t("matches.table.points")}
                    >
                      {row.points}
                    </span>
                  </div>
                );
              })}
            </div>
          )}
        </Section>
      )}

      {/* -------------------------------------------------------- */}
      {/* 6. Discovery links                                        */}
      {/* -------------------------------------------------------- */}
      <Section index={5} className="pb-2">
        <SectionHeader icon={Compass} title={t("home.explore")} />
        <div className="grid grid-cols-2 gap-2">
          <DiscoveryLink to="/matches" icon={CircleDot} label={t("nav.matches")} />
          <DiscoveryLink to="/fantasy" icon={Trophy} label={t("nav.fantasy")} />
          <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />
          <DiscoveryLink to="/profile" icon={UserRound} label={t("nav.profile")} />
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

function DiscoveryLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/matches" | "/fantasy" | "/news" | "/profile";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  return (
    <Link
      to={to}
      className={cn(
        "surface-2-interactive flex items-center gap-2.5 px-3.5 py-3",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--brand-accent)]",
      )}
    >
      <span
        className="grid h-9 w-9 shrink-0 place-items-center rounded-xl text-white shadow-inner"
        style={{ backgroundImage: "var(--bg-brand-gradient)" }}
        aria-hidden
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      <span className="truncate text-sm font-black text-foreground">{label}</span>
      <ChevronRight
        className="ms-auto h-4 w-4 shrink-0 text-[color:var(--text-muted)]"
        aria-hidden
      />
    </Link>
  );
}
