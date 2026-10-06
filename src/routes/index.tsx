import { unavailableHeaders } from "@/lib/page-availability";
import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandedText } from "@/components/brand/BrandedText";
import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useState,
  type ComponentType,
  type ReactNode,
} from "react";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  CircleDot,
  Bell,
  Gem,
  Newspaper,
  Shield,
  Target,
  Trophy,
  UserRound,
} from "lucide-react";

import { newsService } from "@/services/news";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { HOME_DEADLINE_FIRST, PEPITES_PROMOTED, PRONOSTICS_PROMOTED } from "@/lib/feature-flags";
import { PredictionsHomeCard } from "@/components/predictions/PredictionsHomeCard";
import { MyClubsRow } from "@/components/home/MyClubsRow";
import { homeClubs } from "@/components/home/my-clubs";
import { findClub } from "@/components/fantasy/club-identity";
import { footballService, HOME_LIST_SIZE, type FootballSeason } from "@/services/football";
import { ssrAvailability, prefetchForSsr } from "@/lib/ssr-prefetch";
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
import { fantasyNextAction } from "@/services/fantasy-next-action";
import { useFantasyAvailability } from "@/services/use-fantasy-availability";
import { FantasyAlertList } from "@/components/common/FantasyAlertList";
import { ArticleCard } from "@/components/common/ArticleCard";
import { MatchCard } from "@/components/common/MatchCard";
import { useOnLiveMatchEnd } from "@/components/matches/use-live-matches";
import {
  FormChips,
  StandingsLegend,
  StandingsNotes,
  ZONE_BAR,
} from "@/components/matches/StandingsTable";
import { zoneLabel } from "@/components/matches/standings-copy";
import { tableZones } from "@/lib/league-table";
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
import { ui, UiCard, UiChip } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { bandGameweek } from "@/lib/band-gameweek";
import { followedTeamIdsQuery } from "@/services/follows";
import { deadlineStripTime, deadlineWithinHours } from "@/lib/deadline-strip";
import { FantasyRuleChips } from "@/components/home/FantasyRuleChips";
import { NextMatchPick } from "@/components/home/NextMatchPick";
import { HomeMatchCarousel, type BandCard } from "@/components/home/HomeMatchCarousel";
import { bandMatches } from "@/components/home/band-matches";
import { DeadlineStrip } from "@/components/fantasy/DeadlineStrip";
import { useDeadlineCountdown } from "@/components/fpl/deadline";
import { useAuth } from "@/auth/AuthProvider";
import { hasWelcomed, markWelcomeDone } from "@/lib/welcome";
import { useSplashDone } from "@/lib/launch-sequence";
import { cn } from "@/lib/utils";
import { matchesRefetchInterval } from "@/lib/match-refresh";
import { PUBLIC_SITE_ORIGIN, serializeJsonLd } from "@/lib/article-meta";
import { siteJsonLd } from "@/lib/structured-data";
import { matchDayFromKey, matchDayKey } from "@/lib/match-kickoff";
import { advanceGreetingClock, greetingPart } from "@/lib/greeting";
import {
  capitalizeFirst,
  groupByMatchDay,
  latestResultDayBefore,
  onlyFollowedClubs,
} from "@/lib/match-days";
import type { Match } from "@/types/domain";
import stadiumBand from "@/assets/brand/home-band-stadium.webp";
import stadiumBandSmall from "@/assets/brand/home-band-stadium-800.webp";
import liveBand from "@/assets/photos/home-band-live.webp";
import liveBandSmall from "@/assets/photos/home-band-live-800.webp";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { staggerStyle } from "@/lib/motion";
import { useDarkStatusBand } from "@/lib/system-bars";

const HOME_TITLE = "BotolaGO — Actualité, matchs et Fantasy du football marocain";
const HOME_DESCRIPTION =
  "Suivez la Botola Pro sur BotolaGO : résultats en direct, actualités, classement et votre équipe Fantasy.";

export const Route = createFileRoute("/")({
  // The server renders the home page with its matches, clubs, news and table
  // (see `@/lib/ssr-prefetch`); the Fantasy blocks are the visitor's own and
  // load in the browser.
  loader: async ({ context }) => {
    const { queryClient } = context;
    await prefetchForSsr(queryClient, [
      {
        queryKey: ["football", "home-matches", "fr"],
        queryFn: ({ signal }) => footballService.getHomeMatches("fr", signal),
      },
      {
        queryKey: ["football", "clubs", "fr"],
        queryFn: ({ signal }) => footballService.getClubs("fr", signal),
      },
      {
        queryKey: ["football", "seasons", "fr"],
        queryFn: ({ signal }) => footballService.getSeasons("fr", signal),
      },
      ...(NEWS_ENABLED
        ? [
            {
              queryKey: ["news", "edition", "fr", "auto"],
              queryFn: () => newsService.getEdition("fr", "auto"),
            },
          ]
        : []),
    ]);
    const seasons = queryClient.getQueryData<FootballSeason[]>(["football", "seasons", "fr"]);
    const current = seasons?.find((season) => season.isCurrent) ?? seasons?.[0];
    if (current) {
      await prefetchForSsr(queryClient, [
        {
          queryKey: ["football", "standings", current.id, "fr"],
          queryFn: ({ signal }) => footballService.getStandings(current, "fr", signal),
        },
      ]);
    }
    // The moment the greeting and its date are read at, decided here once:
    // the browser's first render reads it back from the loader data rather
    // than its own clock, so both render the same words (as /matches does
    // with its day).
    return { ...ssrAvailability(queryClient), renderedAt: Date.now() };
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
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
    // Who publishes the site, and the site itself (see `@/lib/structured-data`).
    scripts: [{ type: "application/ld+json", children: serializeJsonLd(siteJsonLd()) }],
  }),
  component: HomePage,
});

/**
 * The moment the greeting and its date read: the loader's for the first
 * render, so the server and the hydrating browser agree, then the browser's
 * own clock, checked every minute, so a page left open greets the afternoon
 * after noon. It changes only when the words would.
 */
function useGreetingClock(renderedAt: number): Date {
  const [now, setNow] = useState(() => new Date(renderedAt));
  useEffect(() => {
    const follow = () => setNow((current) => advanceGreetingClock(current, new Date()));
    follow();
    const timer = setInterval(follow, 60_000);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function useGreeting(now: Date) {
  const { t } = useI18n();
  const part = greetingPart(now);
  if (part === "morning") return t("home.greeting_morning");
  if (part === "afternoon") return t("home.greeting_afternoon");
  return t("home.greeting_evening");
}

/**
 * The landing page, as its own chunk: most readers of `/` are signed in or
 * returning and never see it, so they no longer download it (about 33 KB of
 * script before compression: the page, the demonstration pitch's shirts, the
 * prize catalog's client). One loader, so the preload below and `lazy` share
 * the same request.
 */
const loadLanding = () => import("@/components/landing/LandingPage");
const LandingPage = lazy(() =>
  loadLanding().then(
    (module) => ({ default: module.LandingPage }),
    // A chunk that fails to load (a deploy mid-visit, a dropped connection)
    // leaves the newcomer on Home rather than on an error page.
    () => ({ default: (_: { onLeave?: () => void }) => <HomeContent /> }),
  ),
);

/**
 * While the chunk arrives: the landing hero's own ground, nothing else. Home
 * in its place went on loading and moving under the splash (CLS 0.10 measured
 * with it as the fallback, against 0.006 without); an empty dark screen has
 * nothing to move, and the hero paints over it in the same colour. Being
 * dark in both themes, it holds light status-bar icons too, so a slow chunk
 * does not leave dark icons over it until the landing page mounts (the hand
 * over between the two holds is settled in one go, so nothing flicks).
 */
function LandingFallback() {
  useDarkStatusBand();
  return <div aria-busy className="min-h-[100dvh] bg-[color:var(--ui-ink-deep)]" />;
}

function HomePage() {
  const { status } = useAuth();
  const { isHydrated } = useI18n();
  const splashDone = useSplashDone();

  // Read localStorage only after mount so SSR and first client render match.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  // Leaving the landing page by any of its links is the welcome: from then on
  // `/` opens on Home, also when that link was the logo, back to `/`.
  const [left, setLeft] = useState(false);
  const leave = () => {
    markWelcomeDone();
    setLeft(true);
  };

  // A first visit without an account gets the landing page in Home's place:
  // what the game is, why play, and one way in. It used to be a welcome
  // dialog of three buttons, two of which did the same thing, over a Home
  // that a newcomer could not yet read.
  //
  // It waits for the splash (src/lib/launch-sequence.ts), under which nothing
  // is seen, and not for the language chooser: the chooser opens over the
  // landing page rather than over a Home that is about to be replaced.
  // The server always renders Home — it knows no session — so a crawler, and
  // every returning reader, gets Home's content and links (audit 2026-09-24,
  // P1-2). A signed-in reader, a guest and anyone who has been welcomed
  // before never see the landing page here; `/jouer` is its own address.
  const showLanding =
    mounted && splashDone && isHydrated && status === "anonymous" && !left && !hasWelcomed();

  // Fetched as soon as the session says this is a first visit without an
  // account — while the splash still plays — so the page is ready when the
  // splash leaves.
  const firstVisit = mounted && status === "anonymous" && !left && !hasWelcomed();
  useEffect(() => {
    if (firstVisit) void loadLanding();
  }, [firstVisit]);

  return showLanding ? (
    <Suspense fallback={<LandingFallback />}>
      <LandingPage onLeave={leave} />
    </Suspense>
  ) : (
    <HomeContent />
  );
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
 *                           "JOURNÉE 14" in the display face, the Fantasy
 *                           deadline as a gradient pill, and the round's
 *                           matches at its foot: one card, or a carousel of
 *                           the live ones (split club-colour cards) and those
 *                           to come (pick cards) — BG-0155
 *   2. Live & upcoming    — a live match alone rising out of the band as the
 *                           split card; then "À venir", day by day, as
 *                           club-colour rows
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
  const { status, user } = useAuth();
  const { source, key } = useFantasyDataSource();
  const { renderedAt } = Route.useLoaderData();
  const now = useGreetingClock(renderedAt);
  const greeting = useGreeting(now);
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
    // The matches in the language the page was just showing, while the new
    // one loads: an Arabic reader's page switches language right after
    // hydration, and without them the band's cards (a whole round since
    // BG-0155) would vanish and come back, moving everything under them.
    placeholderData: keepPreviousData,
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
    const fmt = moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      weekday: "long",
      day: "numeric",
      month: "long",
    });
    return fmt.format(now);
  }, [lang, now]);

  const homeMatches = useMemo(() => matchesQ.data?.matches ?? [], [matchesQ.data]);
  const liveMatches = useMemo(() => homeMatches.filter(isInPlay), [homeMatches]);
  // "À venir" lists the first fixtures of the payload, as many as it carried
  // before the band's carousel needed the whole round (BG-0155).
  const listMatches = useMemo(() => homeMatches.slice(0, HOME_LIST_SIZE), [homeMatches]);
  // "Aujourd'hui" and "Demain" rather than the date the band already shows.
  const upcomingDays = useMemo(
    () =>
      groupByMatchDay(
        listMatches.filter((match) => !isInPlay(match)),
        {
          locale: lang === "ar" ? "ar-MA" : "fr-FR",
          today: t("matches.date.today"),
          tomorrow: t("matches.date.tomorrow"),
        },
      ),
    [listMatches, lang, t],
  );
  // With no match to come, "À venir" points at the latest results instead of
  // saying nothing: the season's fixture list, read only in that case.
  const resultDaysQ = useQuery({
    queryKey: ["football", "season-result-days", currentSeason?.id ?? "none", lang],
    queryFn: ({ signal }) => footballService.getSeasonResultDays(currentSeason!, lang, signal),
    enabled: matchesQ.isSuccess && upcomingDays.length === 0 && currentSeason != null,
    staleTime: 5 * 60_000,
  });
  const lastResultDay = latestResultDayBefore(resultDaysQ.data ?? [], matchDayKey(now), {
    inclusive: true,
  });
  // The band names the Fantasy gameweek; before Fantasy has one (or for a
  // visitor it is not open to), the league round of the next fixture.
  const bandGameweekNumber = bandGameweek(
    gwQ.data,
    homeMatches.find((match) => match.gameweek > 0)?.gameweek,
    now.getTime(),
  );
  // Day chips over "À venir": every day, or just one. A day that has left the
  // list (its matches began) drops the choice back to every day.
  const [dayFilter, setDayFilter] = useState("all");
  // "Mes clubs": only matches of the clubs this reader follows. The chip is
  // there only for a signed-in reader who follows at least one club.
  const followedQ = useQuery(followedTeamIdsQuery(user?.id ?? null));
  const followedIds = followedQ.data ?? [];
  // "Mes clubs" cards: the favourite, then the followed clubs. Nothing for a
  // reader signed out or with neither.
  const myClubs = useMemo(() => {
    const byId = new Map((clubsQ.data ?? []).map((club) => [club.id, club] as const));
    const followed = (followedQ.data ?? []).flatMap((id) => byId.get(id) ?? []);
    return homeClubs(findClub(clubsQ.data, user?.favoriteClubId), followed);
  }, [clubsQ.data, followedQ.data, user?.favoriteClubId]);
  const [mineOnly, setMineOnly] = useState(false);
  const listDays = mineOnly ? onlyFollowedClubs(upcomingDays, followedIds) : upcomingDays;
  const activeDay = listDays.some((day) => day.key === dayFilter) ? dayFilter : "all";
  const shownDays =
    activeDay === "all" ? listDays : listDays.filter((day) => day.key === activeDay);
  const dayChipLabel = (key: string) =>
    capitalizeFirst(
      moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
        weekday: "short",
        day: "numeric",
      }).format(matchDayFromKey(key)),
    );

  // What the band shows (BG-0155): every live match, then the next match to
  // be played and the rest of its round, by kick-off. From the payload alone,
  // which the server has too, so the cards do not change shape when Fantasy's
  // gameweek loads in the browser. A match whose clubs are not known yet is
  // left out.
  const bandCards: BandCard[] = bandMatches(homeMatches).flatMap((match) => {
    const home = clubById(match.homeClubId);
    const away = clubById(match.awayClubId);
    return home && away ? [{ match, home, away }] : [];
  });
  // A live match with nothing else to show still rises out of the band's
  // lower edge; anything else sits at the band's foot: one pick card as
  // before, or the carousel when there are more.
  const liveAlone = bandCards.length === 1 && isInPlay(bandCards[0]!.match);
  // The strip under the header in the 72 hours before a Fantasy deadline.
  const deadlineLeft = useDeadlineCountdown(gwQ.data?.deadline);
  // Flag off by default: the Fantasy card leads the phone layout only inside
  // the last 24 hours before the deadline.
  const fantasyFirst =
    HOME_DEADLINE_FIRST && gwQ.data?.isCurrent !== false && deadlineWithinHours(deadlineLeft, 24);
  const stripTime = gwQ.data?.isCurrent === false ? null : deadlineStripTime(deadlineLeft);

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
  const standingsRows = useMemo(() => standingsQ.data?.overall ?? [], [standingsQ.data]);
  const standingsTop = standingsRows.slice(0, 5);
  // Zones are decided on the whole table (a tie may run past the top five).
  const standingsZones = useMemo(() => tableZones(standingsRows), [standingsRows]);
  const showStandings = standingsLoading || standingsFailed || standingsRows.length > 0;

  return (
    <AppShell liveStrip matchdayStrip contentWidth="desktop">
      {/* -------------------------------------------------------- */}
      {/* 1. Gameweek band — the page's anchor                     */}
      {/* -------------------------------------------------------- */}
      {/* The page's only H1, and deliberately sr-only: the band names the
          gameweek, which is what a reader needs, but the document still owes
          crawlers and screen-reader users a descriptive title. It is read in
          the reader's language; `HOME_TITLE`, the <title>, is French for all. */}
      <h1 className="sr-only">{t("home.sr_title")}</h1>
      {stripTime && gwQ.data ? (
        <DeadlineStrip gameweek={gwQ.data.number} deadline={gwQ.data.deadline} time={stripTime} />
      ) : null}
      {/* Phone: one column, in the order the order-N classes give. From 768px
          the three columns below are real columns (`contents` on a phone lets
          their children join the one list): tablet is the hero across the
          top and two columns under it, desktop is 340 / fluid / 340. */}
      <div className="flex flex-col md:grid md:grid-cols-2 md:items-start md:gap-x-6 lg:grid-cols-[340px_minmax(0,1fr)_340px]">
        <div className="contents md:flex md:flex-col lg:min-w-0 md:col-span-2 lg:order-2 lg:col-span-1">
          <div className="order-1 lg:min-w-0">
            <GameweekBand
              afterStrip={stripTime !== null}
              greeting={greeting}
              dateLine={dateLine}
              gameweek={bandGameweekNumber}
              // The strip above says the deadline inside 72 hours; the band's own
              // pill would repeat it.
              deadline={stripTime ? undefined : gwQ.data?.deadline}
              live={liveMatches.length > 0}
              overlap={liveAlone}
            >
              {liveAlone || bandCards.length === 0 ? null : bandCards.length === 1 ? (
                <NextMatchPick
                  match={bandCards[0]!.match}
                  home={bandCards[0]!.home}
                  away={bandCards[0]!.away}
                  withVote={PRONOSTICS_PROMOTED}
                />
              ) : (
                <HomeMatchCarousel cards={bandCards} withVote={PRONOSTICS_PROMOTED} />
              )}
            </GameweekBand>
          </div>
          {/* -------------------------------------------------------- */}
          {/* 2. Live & upcoming                                        */}
          {/* -------------------------------------------------------- */}
          <h2 className="sr-only">{plain(t("home.live_upcoming"))}</h2>
          {/* A live match on its own: the split club-colour card rising out of
          the band, so the gameweek and its live match read as one moment.
          With other matches to show, live matches are cards of the band's
          carousel (BG-0155). */}
          {liveAlone && (
            <div className="relative order-2 -mt-16 grid gap-3">
              {bandCards.map(({ match, home, away }) => (
                <MatchCard key={match.id} match={match} home={home} away={away} variant="hero" />
              ))}
            </div>
          )}
          {/* -------------------------------------------------------- */}
          {/* 4. News preview — hidden at launch (NEWS_ENABLED)         */}
          {/* -------------------------------------------------------- */}
          {NEWS_ENABLED && (
            <Section className="order-6">
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
                  newsPreview.map((a, index) => (
                    <div
                      key={a.id}
                      className="enter-rise stagger min-w-0"
                      style={staggerStyle(index)}
                    >
                      <ArticleCard article={a} variant="compact" clubs={clubsQ.data ?? []} />
                    </div>
                  ))
                )}
              </div>
            </Section>
          )}
        </div>
        <div className="contents md:flex md:flex-col lg:min-w-0 md:order-2 lg:order-1">
          {(matchesQ.isError ||
            upcomingDays.length > 0 ||
            homeMatches.length === 0 ||
            myClubs.length > 0) && (
            <Section className="order-3 lg:mt-0">
              <SectionHeader
                as="h3"
                title={t("matches.section.upcoming")}
                action={<ViewAllLink to="/matches" />}
              />
              <MyClubsRow
                tiles={myClubs}
                season={currentSeason}
                seasonReady={seasonsQ.isSuccess}
                standings={standingsQ.data?.overall ?? []}
                clubById={clubById}
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
                // Nothing scheduled, which is not a failure: say so in the
                // competition's words, and lead on to the results.
                <EmptyState
                  compact
                  action={
                    <Link
                      to="/matches"
                      search={lastResultDay ? { date: lastResultDay } : {}}
                      className={cn(
                        ui.text.bodyStrong,
                        ui.tone.ink,
                        ui.focus,
                        "inline-flex min-h-[var(--ui-tap-min)] items-center gap-1.5",
                      )}
                    >
                      {lastResultDay ? t("home.results_link") : t("home.calendar_link")}
                      {/* A drawn arrow, not a typed "→": the glyph does not turn
                          round in Arabic, where it pointed back at the label.
                          `lucide-arrow-right` is mirrored in styles.css. */}
                      <ArrowRight className="h-4 w-4 shrink-0" aria-hidden />
                    </Link>
                  }
                >
                  {t("home.upcoming_empty")}
                </EmptyState>
              ) : (
                <div className="grid gap-4">
                  {upcomingDays.length > 1 || followedIds.length > 0 ? (
                    <div
                      role="group"
                      aria-label={t("matches.section.upcoming")}
                      className="flex flex-wrap gap-1.5"
                    >
                      <UiChip selected={activeDay === "all"} onClick={() => setDayFilter("all")}>
                        {t("matches.tab.all")}
                      </UiChip>
                      {followedIds.length > 0 ? (
                        <UiChip selected={mineOnly} onClick={() => setMineOnly((on) => !on)}>
                          {t("profile.clubs.title")}
                        </UiChip>
                      ) : null}
                      {listDays.slice(0, 4).map((day) => (
                        <UiChip
                          key={day.key}
                          selected={activeDay === day.key}
                          onClick={() => setDayFilter(day.key)}
                        >
                          {dayChipLabel(day.key)}
                        </UiChip>
                      ))}
                    </div>
                  ) : null}
                  {shownDays.length === 0 ? (
                    <EmptyState compact>{t("home.mine_empty")}</EmptyState>
                  ) : null}
                  {shownDays.map((day) => (
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
                              listGameweek={bandGameweekNumber}
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
          {/* 6. Discovery links                                        */}
          {/* -------------------------------------------------------- */}
          <Section className="order-8 pb-2">
            <SectionHeader title={<BrandedText text={t("home.explore")} />} />
            {/* Four across; with News on, five tiles do not fit a 390px row
            ("Actualités" is wider than a fifth of it), so they wrap in threes. */}
            <div className={cn("grid gap-2", NEWS_ENABLED ? "grid-cols-3" : "grid-cols-4")}>
              <DiscoveryLink to="/matches" icon={CircleDot} label={t("nav.matches")} />
              <DiscoveryLink to="/clubs" icon={Shield} label={t("clubs.title")} />
              <DiscoveryLink to="/fantasy" icon={Trophy} label={t("nav.fantasy")} />
              {/* News discovery tile — hidden at launch (NEWS_ENABLED). */}
              {NEWS_ENABLED && <DiscoveryLink to="/news" icon={Newspaper} label={t("nav.news")} />}
              {/* Pépites, once promoted, takes Profil's tile as it takes its slot in the bar. */}
              {PEPITES_PROMOTED ? (
                <DiscoveryLink to="/pepites" icon={Gem} label={t("nav.pepites")} />
              ) : (
                <DiscoveryLink to="/profile" icon={UserRound} label={t("nav.profile")} />
              )}
              {/* A sixth tile makes two rows of three (BG-0146): shown once promoted. */}
              {PRONOSTICS_PROMOTED && (
                <DiscoveryLink
                  to="/pronostics"
                  icon={Target}
                  label={t("home.discover.predictions")}
                />
              )}
            </div>
          </Section>
        </div>
        <div className="contents md:flex md:flex-col lg:min-w-0 md:order-3 lg:order-3">
          {/* -------------------------------------------------------- */}
          {/* 3. Fantasy — the manager's card / team entry              */}
          {/* -------------------------------------------------------- */}
          {/* The card names itself ("VOTRE FANTASY · ATLAS XI"), as the board
          draws it; the heading is for the document outline. */}
          <Section
            className={cn("lg:order-4 lg:mt-0", fantasyFirst ? "-order-1 sm:mt-0" : "order-5")}
          >
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
              <FantasySummaryCard
                summary={summaryQ.data}
                action={fantasyNextAction({
                  availability: availability.view,
                  hasTeam: true,
                  gameweek: gwQ.data,
                  now: Date.now(),
                })}
              />
            ) : summaryQ.isSuccess && summaryQ.data === null ? (
              <FantasyCreateCard canCreate={canCreate} />
            ) : (
              <HeroSkeleton />
            )}

            {fantasyReady ? <FantasyRuleChips deadline={gwQ.data?.deadline} /> : null}

            {/* Only when there is something to show: an empty wrapper still
            carried its margin, a stray gap above the Pronostics card. */}
            {fantasyReady &&
              source !== "guest" &&
              !alertsQ.isError &&
              !playersQ.isError &&
              !(alertsQ.data && playersQ.data && alertsQ.data.length === 0) && (
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
          {/* Pronostics (BG-0146), right after the matches: shown once promoted,
          and it hides itself while the game is off in the database. */}
          {PRONOSTICS_PROMOTED && (
            <Section className="order-4 lg:order-5">
              <PredictionsHomeCard />
            </Section>
          )}
          {/* -------------------------------------------------------- */}
          {/* 5. Standings snapshot — only when the backend has one     */}
          {/* -------------------------------------------------------- */}
          {showStandings && (
            <Section className="order-7">
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
                  {standingsTop.map((row) => {
                    const club = clubById(row.clubId);
                    if (!club) return null;
                    const zone = standingsZones.get(row.clubId) ?? null;
                    // Each club opens its club page. The name is the link and its
                    // ::after stretches over the row, so the whole row is the
                    // target while the link is named by the club alone and the
                    // figures are still read as figures.
                    return (
                      <div
                        key={row.clubId}
                        className="relative flex items-center gap-2.5 px-3.5 py-2 transition-colors hover:bg-[color:var(--ui-surface-sunken)] active:bg-[color:var(--ui-surface-sunken)]"
                      >
                        {zone ? (
                          <span
                            aria-hidden
                            className={cn("absolute inset-y-0 start-0 w-1", ZONE_BAR[zone])}
                          />
                        ) : null}
                        <span className={cn("w-5 shrink-0 text-center", ui.stat.sm, ui.tone.muted)}>
                          <span aria-hidden>{row.position}</span>
                          <span className="sr-only">
                            {row.position}
                            {zone ? `, ${zoneLabel(zone, t)}` : ""}
                          </span>
                        </span>
                        <ClubCrest club={club} size="sm" />
                        {/* Wraps rather than ending in an ellipsis. */}
                        <Link
                          to="/clubs/$clubId"
                          params={{ clubId: club.id }}
                          className={cn(
                            "min-w-0 flex-1",
                            ui.text.body,
                            "[font-weight:var(--ui-weight-heavy)]",
                            ui.tone.default,
                            STRETCHED_LINK,
                          )}
                        >
                          {rowClubName(tr(club.shortName), tr(club.name))}
                        </Link>
                        <FormChips form={row.form} className="shrink-0" />
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
              {!standingsLoading && !standingsFailed && standingsTop.length > 0 ? (
                <StandingsLegend className="mt-3" />
              ) : null}
              {/* Worked out from the results, and a tie the top five may cut
              through: said here as the Classement tab says it. */}
              {standingsQ.data && !standingsLoading && !standingsFailed ? (
                <StandingsNotes
                  rows={standingsRows}
                  shown={standingsTop}
                  computed={standingsQ.data.computed}
                  seasonStatus={currentSeason?.status}
                  className="mt-2"
                />
              ) : null}
            </Section>
          )}
        </div>
      </div>
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
  to: "/matches" | "/clubs" | "/fantasy" | "/news" | "/profile" | "/pronostics" | "/pepites";
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
        "press-tile",
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
  afterStrip = false,
  children,
}: {
  /** What sits at the foot of the band: the next match, or the round's carousel. */
  children?: ReactNode;
  /** The deadline strip sits above: it has already cancelled the screen's top padding. */
  afterStrip?: boolean;
  greeting: string;
  dateLine: string;
  gameweek?: number;
  /** The Fantasy deadline for that gameweek, when Fantasy has one. */
  deadline?: string;
  /** A match is being played: the band shows the crowd celebrating. */
  live: boolean;
  /** A live card (a live match on its own) rises out of the band's lower edge. */
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
        "-mx-[var(--ui-gutter)] px-[var(--ui-gutter)] pt-6",
        afterStrip ? "mt-0" : "-mt-4",
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
      {children}
    </section>
  );
}
