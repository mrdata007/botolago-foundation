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
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { AppShell } from "@/components/shell/AppShell";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
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
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { cn } from "@/lib/utils";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";

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
 * page. Fixed structure, now drawn in the product design language: the UI
 * kit's type scale, 6px radii, opaque `--ui-surface` cards and one shadow
 * token — no V2 glass (`surface-4`/`surface-2`), no Tailwind type ramp and
 * no responsive type steps, which the language never takes:
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
  // News is hidden at launch (owner decision — see `@/lib/feature-flags`), so
  // the edition is not even fetched: no News RPC, no third-party media URLs
  // reaching the document, nothing to flash before the section is skipped.
  const newsQ = useQuery({
    queryKey: ["news", "edition", lang, "auto"] as const,
    queryFn: () => newsService.getEdition(lang, "auto"),
    enabled: NEWS_ENABLED,
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
    // The greeting dates the football day, so it follows the competition
    // calendar rather than the viewer's browser (BG-0100).
    const fmt = new Intl.DateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      timeZone: MATCH_TIME_ZONE,
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
          <Flame className={cn("h-3.5 w-3.5 shrink-0", ui.tone.ink)} aria-hidden />
          {/* `ui.text.label` replaces the V2 eyebrow idiom
              (`text-[11px] font-black uppercase tracking-[0.16em]`): the
              language has one label token, and its tracking is `ltr:`-only so
              Arabic is never letter-spaced (BG-0069). */}
          <span className={cn(ui.text.label, ui.tone.ink)}>{greeting}</span>
        </div>
        {/* The page's only H1, and deliberately sr-only: nothing in this block
            is a heading a reader needs read aloud, but the document still owes
            crawlers and screen-reader users a descriptive title.

            The manager's name used to render here at `ui.text.hero` (34px),
            between the greeting and the date. Removed by owner decision: it
            told a signed-in reader something they already know, and a
            signed-out one the literal word "Manager", which is the placeholder
            showing through. The greeting now runs straight into the date. */}
        <h1 className="sr-only">{HOME_TITLE}</h1>
        <p className={cn("mt-2 truncate", ui.text.meta, ui.tone.muted)}>
          {gwQ.data ? `${t("home.gameweek")} ${gwQ.data.number}` : ""}
          {gwQ.data ? " · " : ""}
          <span className="capitalize">{dateLine}</span>
        </p>
      </div>

      {/* -------------------------------------------------------- */}
      {/* 2. Matches                                                */}
      {/* -------------------------------------------------------- */}
      {/* Tighter than the shared rhythm, and only here. `Section` sets
          `mt-7 sm:mt-9`, which was measured against a greeting block that
          ended in a 34px name line; with that line gone the same gap reads as
          a hole. Overridden on this one section rather than in `Section`
          itself, whose spacing every other section on this page and the
          Fantasy hub still depend on. */}
      <Section index={1} className="mt-5 sm:mt-7">
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
            className={cn(
              "flex min-h-24 items-center justify-center px-4 text-center",
              ui.surface.card,
              ui.text.bodyStrong,
              ui.tone.ink,
              ui.focus,
            )}
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
            className={cn(
              "flex min-h-24 items-center justify-center px-4 text-center",
              ui.surface.card,
              ui.text.bodyStrong,
              ui.tone.ink,
              ui.focus,
            )}
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
                    <Bell className={cn("h-3.5 w-3.5 shrink-0", ui.tone.ink)} aria-hidden />
                    {/* `home.fantasy_alerts` carries `{accent}` markers, so
                        it must go through <Trans> — rendered raw it prints
                        the literal markers on screen. */}
                    <Trans
                      text={t("home.fantasy_alerts")}
                      className={cn(ui.text.label, ui.tone.muted)}
                      accentClassName={ui.tone.ink}
                    />
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
      {/* 4. News preview — hidden at launch (NEWS_ENABLED)         */}
      {/* -------------------------------------------------------- */}
      {NEWS_ENABLED && (
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
      )}

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
                    className={cn("flex items-center gap-2.5 px-3 py-2", ui.surface.card)}
                  >
                    <span
                      className={cn(
                        "w-4 shrink-0 text-center font-mono",
                        ui.text.meta,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-hidden
                    >
                      {row.position}
                    </span>
                    <ClubCrest club={club} size="sm" />
                    <span
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.tone.default,
                      )}
                    >
                      {tr(club.shortName)}
                    </span>
                    <span
                      className={cn(
                        "w-7 shrink-0 text-center",
                        ui.text.micro,
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-label={t("matches.table.played")}
                    >
                      {row.played}
                    </span>
                    <span
                      className={cn(
                        "w-8 shrink-0 text-center",
                        ui.text.micro,
                        ui.text.tabular,
                        ui.tone.muted,
                      )}
                      aria-label={t("matches.table.goal_difference")}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </span>
                    <span
                      className={cn(
                        "w-8 shrink-0 text-end",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-hero)]",
                        ui.text.tabular,
                        ui.tone.default,
                      )}
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
          {/* News discovery tile — hidden at launch (NEWS_ENABLED). */}
          {NEWS_ENABLED && <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />}
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
        "inline-flex items-center gap-0.5 px-2 py-1.5",
        "min-h-[var(--ui-tap-min)]",
        ui.radius.control,
        ui.text.meta,
        "[font-weight:var(--ui-weight-heavy)]",
        ui.tone.ink,
        "transition-colors duration-[var(--duration-quick)]",
        "hover:bg-[color:var(--ui-surface-sunken)]",
        ui.focus,
      )}
    >
      {t("home.view_all")}
      <ChevronRight className="h-3.5 w-3.5 rtl:rotate-180" aria-hidden />
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
        "flex items-center gap-2.5 px-3.5 py-3",
        "min-h-[var(--ui-row-min)]",
        ui.surface.card,
        "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
        ui.focus,
      )}
    >
      <span
        className={cn(
          "grid h-9 w-9 shrink-0 place-items-center",
          ui.radius.control,
          "text-[color:var(--ui-ink-deep)]",
        )}
        style={{ backgroundImage: "var(--ui-grad-action)" }}
        aria-hidden
      >
        <Icon className="h-4 w-4" aria-hidden />
      </span>
      {/* Wraps rather than truncates: at 390px the two-up tile leaves ~75px
          for the label, and "Actualités" / "الملف الشخصي" do not fit on one
          line at the language's 15px body step. */}
      <span className={cn("min-w-0 flex-1 leading-tight", ui.text.bodyStrong, ui.tone.default)}>
        {label}
      </span>
      <ChevronRight
        className={cn("ms-auto h-4 w-4 shrink-0 rtl:rotate-180", ui.tone.muted)}
        aria-hidden
      />
    </Link>
  );
}
