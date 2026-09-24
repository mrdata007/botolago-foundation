import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { BrandedText } from "@/components/brand/BrandedText";
import { useEffect, useMemo, useState, type ComponentType } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { CircleDot, Bell, Newspaper, Shield, Trophy, UserRound } from "lucide-react";

import { newsService } from "@/services/news";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { footballService } from "@/services/football";
import { fantasyService } from "@/services/fantasy-runtime";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { AppShell } from "@/components/shell/AppShell";
import {
  SectionGroupHeader,
  SectionHeader,
  SectionHeaderLink,
} from "@/components/common/SectionHeader";
import { Trans } from "@/components/common/Trans";
import { Section } from "@/components/common/Section";
import { FantasyCreateCard, FantasySummaryCard } from "@/components/common/FantasySummaryCard";
import { FantasyUnavailableState } from "@/components/fantasy/FantasyUnavailableState";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { useOnLiveMatchEnd } from "@/components/matches/use-live-matches";
import { ClubCrest } from "@/components/common/ClubCrest";
import { STRETCHED_LINK } from "@/components/clubs/stretched-link";
import { rowClubName } from "@/lib/club-identity";
import { DeadlineCountdown } from "@/components/common/DeadlineCountdown";
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
import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useAuth } from "@/auth/AuthProvider";
import { authService } from "@/services/auth";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { cn } from "@/lib/utils";
import { matchesRefetchInterval } from "@/lib/match-refresh";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { capitalizeFirst, groupByMatchDay } from "@/lib/match-days";
import type { Match } from "@/types/domain";
import stadiumBand from "@/assets/brand/home-band-stadium.webp";
import stadiumBandSmall from "@/assets/brand/home-band-stadium-800.webp";
import liveBand from "@/assets/photos/home-band-live.webp";
import liveBandSmall from "@/assets/photos/home-band-live-800.webp";

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

/** A match being played right now, for the split live card. */
const isInPlay = (match: Match) => match.status === "live";

/**
 * BotolaGO Home (Accueil) — Option A "Club colours" (A-Home).
 *
 * A "control center" landing screen, not a duplicate of the News page. The
 * structure is fixed (the order is pinned by `index.home-structure.test.ts`):
 *
 *   1. Gameweek band      — a photo band flush under the bar: the date,
 *                           "JOURNÉE 14" in the display face and the Fantasy
 *                           deadline as a gradient pill
 *   2. Live & upcoming    — each live match as the split club-colour card,
 *                           the first one rising out of the band; then "À
 *                           venir", day by day, as club-colour rows
 *   3. Fantasy            — the manager's gradient card, or the way into
 *                           creating a team
 *   4. News preview       — a few curated cards linking into /news (flagged)
 *   5. Standings snapshot — top of the table, only when real data exists
 *   6. Discovery links    — quick access to Matches/Fantasy/News/Profile
 *
 * Nothing on the page is invented: the board's scorers line under the live
 * card needs goal events the home payload does not carry, and the Fantasy
 * card's rank movement needs a previous rank the summary does not hold, so
 * neither is drawn.
 */
function HomeContent() {
  const { t, tr, lang } = useI18n();
  const { status } = useAuth();
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
    // The live card is the loudest thing on the page: while a match is on it
    // follows the score at the live strip's own pace, a match that ends
    // leaves it (the home payload holds live and upcoming fixtures only), and
    // one about to kick off is watched so it becomes the live card on time.
    refetchInterval: (query) => matchesRefetchInterval(query.state.data?.matches, Date.now()),
    refetchIntervalInBackground: false,
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

  // Standings snapshot: the top of the table on the Classement tab
  // (/matches/standings), from the same query — worked out from the current
  // season's results. It renders only once a real, non-empty table comes
  // back — never a fabricated one, and not before the first result.
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });
  const currentSeason = useMemo(
    () => seasonsQ.data?.find((season) => season.isCurrent) ?? seasonsQ.data?.[0],
    [seasonsQ.data],
  );
  const standingsQ = useQuery({
    queryKey: ["football", "standings", currentSeason?.id, lang],
    queryFn: () => footballService.getStandings(currentSeason!, lang),
    enabled: currentSeason != null,
  });
  // A match ending changes the table (see /matches/standings).
  const queryClient = useQueryClient();
  useOnLiveMatchEnd(() => {
    void queryClient.invalidateQueries({ queryKey: ["football", "standings"] });
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

  const homeMatches = useMemo(() => matchesQ.data?.matches ?? [], [matchesQ.data]);
  const liveMatches = useMemo(() => homeMatches.filter(isInPlay), [homeMatches]);
  // "Aujourd'hui" and "Demain" rather than the date the band already shows.
  const upcomingDays = useMemo(
    () =>
      groupByMatchDay(
        homeMatches.filter((match) => !isInPlay(match)),
        {
          locale: lang === "ar" ? "ar-MA" : "fr-FR",
          today: t("matches.date.today"),
          tomorrow: t("matches.date.tomorrow"),
        },
      ),
    [homeMatches, lang, t],
  );
  // The band names the Fantasy gameweek; before Fantasy has one (or for a
  // visitor it is not open to), the league round of the next fixture.
  const bandGameweek =
    gwQ.data?.number ?? homeMatches.find((match) => match.gameweek > 0)?.gameweek;

  // Up to three curated stories: the edition's lead plus its next articles.
  // Never the full News page — a lightweight preview only.
  const newsPreview = useMemo(() => {
    const edition = newsQ.data;
    if (!edition) return null;
    const rest = edition.articles.filter((a) => a.id !== edition.lead?.id);
    return [...(edition.lead ? [edition.lead] : []), ...rest].slice(0, 3);
  }, [newsQ.data]);

  const standingsLoading = seasonsQ.isPending || (currentSeason != null && standingsQ.isPending);
  const standingsFailed = seasonsQ.isError || standingsQ.isError;
  const standingsRows = standingsQ.data?.overall ?? [];
  const showStandings = standingsLoading || standingsFailed || standingsRows.length > 0;

  return (
    <AppShell liveStrip>
      {/* -------------------------------------------------------- */}
      {/* 1. Gameweek band — the page's anchor                     */}
      {/* -------------------------------------------------------- */}
      {/* The page's only H1, and deliberately sr-only: the band names the
          gameweek, which is what a reader needs, but the document still owes
          crawlers and screen-reader users a descriptive title. */}
      <h1 className="sr-only">{HOME_TITLE}</h1>
      <GameweekBand
        greeting={greeting}
        dateLine={dateLine}
        gameweek={bandGameweek}
        deadline={gwQ.data?.deadline}
        live={liveMatches.length > 0}
        overlap={liveMatches.length > 0}
      />

      {/* -------------------------------------------------------- */}
      {/* 2. Live & upcoming                                        */}
      {/* -------------------------------------------------------- */}
      <h2 className="sr-only">{plain(t("home.live_upcoming"))}</h2>
      {/* Each live match as the split club-colour card; the first rises out
          of the band, so the gameweek and its live match read as one moment. */}
      {liveMatches.length > 0 && (
        <div className="relative -mt-16 grid gap-3">
          {liveMatches.map((match) => {
            const home = clubById(match.homeClubId);
            const away = clubById(match.awayClubId);
            if (!home || !away) return null;
            return (
              <MatchCard key={match.id} match={match} home={home} away={away} variant="hero" />
            );
          })}
        </div>
      )}
      {(matchesQ.isError || upcomingDays.length > 0 || homeMatches.length === 0) && (
        <Section>
          <SectionHeader
            as="h3"
            title={t("matches.section.upcoming")}
            action={<ViewAllLink to="/matches" />}
          />
          {matchesQ.isPending ? (
            <UiCard
              padding="none"
              className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
            >
              <MatchCardSkeleton flat />
              <MatchCardSkeleton flat />
            </UiCard>
          ) : matchesQ.isError ? (
            <ErrorState onRetry={() => void matchesQ.refetch()} />
          ) : upcomingDays.length === 0 ? (
            <EmptyState compact>{t("state.empty")}</EmptyState>
          ) : (
            <div className="grid gap-4">
              {upcomingDays.map((day) => (
                <div key={day.key} className="min-w-0">
                  <SectionGroupHeader as="h4" title={day.label} />
                  {/* The card clips the rows' club edge bars to its corners. */}
                  <UiCard
                    padding="none"
                    className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
                  >
                    {day.matches.map((m) => {
                      const home = clubById(m.homeClubId);
                      const away = clubById(m.awayClubId);
                      if (!home || !away) return null;
                      return (
                        <MatchCard
                          key={m.id}
                          match={m}
                          home={home}
                          away={away}
                          variant="list"
                          listGameweek={bandGameweek}
                        />
                      );
                    })}
                  </UiCard>
                </div>
              ))}
            </div>
          )}
        </Section>
      )}

      {/* -------------------------------------------------------- */}
      {/* 3. Fantasy — the manager's card / team entry              */}
      {/* -------------------------------------------------------- */}
      {/* The card names itself ("VOTRE FANTASY · ATLAS XI"), as the board
          draws it; the heading is for the document outline. */}
      <Section>
        <h2 className="sr-only">{plain(t("home.fantasy_hub"))}</h2>
        {status === "loading" || availability.isPending ? (
          <HeroSkeleton />
        ) : availability.isError ? (
          <ErrorState onRetry={() => void availability.refetch()} />
        ) : availability.data.status !== "ready" ? (
          <FantasyUnavailableState reason={availability.data.status} />
        ) : source === "guest" ? (
          <FantasyCreateCard canCreate={canCreate} />
        ) : summaryQ.isError || gwQ.isError ? (
          <ErrorState
            onRetry={() => {
              void summaryQ.refetch();
              void gwQ.refetch();
            }}
          />
        ) : summaryQ.data && gwQ.data ? (
          <FantasySummaryCard summary={summaryQ.data} />
        ) : summaryQ.isSuccess && summaryQ.data === null ? (
          <FantasyCreateCard canCreate={canCreate} />
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
        <Section>
          <SectionHeader
            title={plain(t("home.news_preview"))}
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
        <Section>
          <SectionHeader
            title={plain(t("matches.table_preview"))}
            action={<ViewAllLink to="/matches/standings" />}
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
            <UiCard
              padding="none"
              className="divide-y divide-[color:var(--ui-rule)] overflow-hidden"
            >
              {standingsRows.slice(0, 5).map((row) => {
                const club = clubById(row.clubId);
                if (!club) return null;
                // Each club opens its club page. The name is the link and its
                // ::after stretches over the row, so the whole row is the
                // target while the link is named by the club alone and the
                // figures are still read as figures.
                return (
                  <div
                    key={row.clubId}
                    className="relative flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-[color:var(--ui-surface-sunken)]"
                  >
                    <span
                      className={cn("w-5 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}
                      aria-hidden
                    >
                      {row.position}
                    </span>
                    <ClubCrest club={club} size="sm" />
                    <Link
                      to="/clubs/$clubId"
                      params={{ clubId: club.id }}
                      className={cn(
                        "min-w-0 flex-1 truncate",
                        ui.text.body,
                        "[font-weight:var(--ui-weight-heavy)]",
                        ui.tone.default,
                        STRETCHED_LINK,
                      )}
                    >
                      {rowClubName(tr(club.shortName), tr(club.name))}
                    </Link>
                    <span
                      className={cn("w-7 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}
                      aria-label={t("matches.table.played")}
                    >
                      {row.played}
                    </span>
                    <bdi
                      className={cn("w-9 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}
                      aria-label={t("matches.table.goal_difference")}
                    >
                      {row.goalDifference > 0 ? `+${row.goalDifference}` : row.goalDifference}
                    </bdi>
                    <span
                      className={cn("w-8 shrink-0 text-end", ui.stat.md, ui.tone.default)}
                      aria-label={t("matches.table.points")}
                    >
                      {row.points}
                    </span>
                  </div>
                );
              })}
            </UiCard>
          )}
        </Section>
      )}

      {/* -------------------------------------------------------- */}
      {/* 6. Discovery links                                        */}
      {/* -------------------------------------------------------- */}
      <Section className="pb-2">
        <SectionHeader title={<BrandedText text={t("home.explore")} />} />
        {/* Four across; with News on, five tiles do not fit a 390px row
            ("Actualités" is wider than a fifth of it), so they wrap in threes. */}
        <div className={cn("grid gap-2", NEWS_ENABLED ? "grid-cols-3" : "grid-cols-4")}>
          <DiscoveryLink to="/matches" icon={CircleDot} label={t("nav.matches")} />
          <DiscoveryLink to="/clubs" icon={Shield} label={t("clubs.title")} />
          <DiscoveryLink to="/fantasy" icon={Trophy} label={t("nav.fantasy")} />
          {/* News discovery tile — hidden at launch (NEWS_ENABLED). */}
          {NEWS_ENABLED && <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />}
          <DiscoveryLink to="/profile" icon={UserRound} label={t("nav.profile")} />
        </div>
      </Section>
    </AppShell>
  );
}

/** "Tout voir" on a section heading: the shared 44px round link. */
function ViewAllLink({ to }: { to: "/news" | "/matches" | "/matches/standings" | "/fantasy" }) {
  return <SectionHeaderLink to={to} />;
}

function DiscoveryLink({
  to,
  icon: Icon,
  label,
}: {
  to: "/matches" | "/clubs" | "/fantasy" | "/news" | "/profile";
  icon: ComponentType<{ className?: string; "aria-hidden"?: boolean }>;
  label: string;
}) {
  // One quiet row of tiles. These repeat the navigation bar, so they carry
  // the ink colour rather than the action gradient, which on this page is
  // kept for Fantasy.
  return (
    <Link
      to={to}
      className={cn(
        "flex min-h-16 flex-col items-center justify-center gap-1.5 px-2 py-3 text-center",
        ui.surface.card,
        "transition-transform duration-[var(--duration-tap)] ease-[var(--ease-standard)] active:translate-y-px",
        ui.focus,
      )}
    >
      <Icon className={cn("h-5 w-5 shrink-0", ui.tone.ink)} aria-hidden />
      {/* Wraps rather than truncates: "Actualités" / "الملف الشخصي" do not
          fit a three- or four-up tile on one line at 360px. */}
      <span
        className={cn(
          "min-w-0 leading-tight",
          ui.text.meta,
          "[font-weight:var(--ui-weight-heavy)]",
          ui.tone.default,
        )}
      >
        {label}
      </span>
    </Link>
  );
}

/** Home titles are single-tone: the `{accent}` markers the dictionary
 *  carries for other surfaces are dropped here, so a title introduces its
 *  content without becoming a second accent on the page. */
function plain(text: string): string {
  return text.replace(/\{\/?accent\}/g, "");
}

/**
 * The gameweek band: Home's anchor (A-Home). A night-match photograph flush
 * under the bar, full-bleed on a phone and a rounded panel from `sm`; on it,
 * the date, the gameweek in the display face and — while it is still ahead —
 * the Fantasy deadline as the gradient pill, counting down.
 *
 * The scrim runs `to bottom` from a light veil to near-navy: the text sits in
 * the upper half, and the live card, when there is one, covers the dark lower
 * edge (`overlap` leaves it the room). A degree angle would land on the wrong
 * edge under `dir="rtl"`.
 */
function GameweekBand({
  greeting,
  dateLine,
  gameweek,
  deadline,
  live,
  overlap,
}: {
  greeting: string;
  dateLine: string;
  gameweek?: number;
  /** The Fantasy deadline for that gameweek, when Fantasy has one. */
  deadline?: string;
  /** A match is being played: the band shows the crowd celebrating. */
  live: boolean;
  /** A live card rises out of the band's lower edge. */
  overlap: boolean;
}) {
  const { t } = useI18n();
  // The band's own clock, so the deadline pill leaves when the deadline
  // passes rather than sitting at "0h 0min" until something else re-renders
  // Home. One timer, set for the deadline itself; nothing ticks once it has
  // passed.
  const deadlineMs = deadline ? new Date(deadline).getTime() : null;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (deadlineMs === null || deadlineMs <= now) return;
    // setTimeout holds a 32-bit delay; a longer wait just re-arms on wake.
    const id = setTimeout(() => setNow(Date.now()), Math.min(deadlineMs - now + 250, 2 ** 31 - 1));
    return () => clearTimeout(id);
  }, [deadlineMs, now]);
  const deadlineAhead = deadline !== undefined && deadlineMs !== null && deadlineMs > now;
  return (
    <section
      className={cn(
        "relative isolate overflow-hidden",
        // Flush under the bar (and the live strip): UiScreen's `pt-4` is
        // taken back on a phone, where the band runs edge to edge.
        "-mx-[var(--ui-gutter)] -mt-4 px-[var(--ui-gutter)] pt-6",
        overlap ? "pb-24" : "pb-7",
        "sm:mx-0 sm:mt-0 sm:rounded-[var(--ui-radius-sheet)] sm:px-6",
        ui.tone.onInkPlain,
        "bg-[color:var(--ui-ink-deep)]",
        "animate-in fade-in-0 duration-500 ease-out",
      )}
    >
      {/* The night-match photograph: floodlights and crowd on the far side,
          dark sky behind the text. Mirrored in Arabic so the text still
          starts on the calm side. Decorative, so hidden from assistive tech;
          above the fold, so it is fetched eagerly. */}
      <img
        src={live ? liveBand : stadiumBand}
        srcSet={
          live
            ? `${liveBandSmall} 800w, ${liveBand} 1600w`
            : `${stadiumBandSmall} 800w, ${stadiumBand} 1600w`
        }
        sizes="(min-width: 640px) 672px, 100vw"
        alt=""
        aria-hidden
        decoding="async"
        fetchPriority="high"
        className="absolute inset-0 -z-10 h-full w-full object-cover object-[70%_60%] rtl:-scale-x-100"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10"
        style={{
          backgroundImage:
            "linear-gradient(to bottom, color-mix(in oklab, var(--ui-ink-deep) 60%, transparent) 0%, color-mix(in oklab, var(--ui-ink-deep) 88%, transparent) 78%)",
        }}
      />
      <p className={cn("truncate", ui.text.label)}>
        {greeting} · {capitalizeFirst(dateLine)}
      </p>
      {gameweek ? (
        <p className={cn("mt-1 uppercase", ui.display.hero)}>
          {t("home.gameweek")} {gameweek}
        </p>
      ) : null}
      {deadlineAhead ? (
        <div className="mt-3 flex">
          <DeadlineCountdown iso={deadline} label={t("home.deadline_fantasy")} />
        </div>
      ) : null}
    </section>
  );
}
