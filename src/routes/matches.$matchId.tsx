import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import {
  isMissingContent,
  isUnavailable,
  UNAVAILABLE,
  unavailableHeaders,
} from "@/lib/page-availability";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useMemo, useState, type ComponentProps } from "react";
import {
  footballService,
  hasLeagueTable,
  type FootballSeason,
  type FootballStandings,
  type MatchSeason,
} from "@/services/football";
import { newsService } from "@/services/news";
import { AppShell } from "@/components/shell/AppShell";
import { ArticleCard } from "@/components/common/ArticleCard";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { ErrorState, LoadingState } from "@/components/common/States";
import { EventTimeline } from "@/components/matches/EventTimeline";
import { GoalMoment } from "@/components/matches/GoalMoment";
import { HeadToHead } from "@/components/matches/HeadToHead";
import { LineupsView } from "@/components/matches/LineupsView";
import { MatchScoreHeader } from "@/components/matches/MatchScoreHeader";
import {
  MATCH_PANEL_ID,
  MATCH_TAB_ID_BASE,
  MatchTabs,
  type MatchTabKey,
} from "@/components/matches/MatchTabs";
import { MatchTopBar } from "@/components/matches/MatchTopBar";
import { StatComparison } from "@/components/matches/StatComparison";
import { matchDataPhase } from "@/components/matches/match-empty-states";
import {
  eventsWhenFresh,
  scoreCountsEveryGoal,
  useGoalMoment,
} from "@/components/matches/goal-moment";
import { useScrolledPast } from "@/components/matches/use-scrolled-past";
import { ui, UiCard, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { useBackTo } from "@/lib/back-navigation";
import { clubMatchPalettes } from "@/lib/club-palette";
import { NEWS_ENABLED, PRONOSTICS_PROMOTED } from "@/lib/feature-flags";
import { MatchPredictionCard } from "@/components/predictions/MatchPredictionCard";
import { cn } from "@/lib/utils";
import { PUBLIC_SITE_ORIGIN, serializeJsonLd } from "@/lib/article-meta";
import { breadcrumbJsonLd, sportsEventJsonLd } from "@/lib/structured-data";
import { MATCH_TIME_ZONE } from "@/lib/match-kickoff";
import { matchRefetchInterval, rereadTableOnFinish } from "@/lib/match-refresh";

const TAB_KEYS: MatchTabKey[] = ["summary", "stats", "lineups", "h2h"];

/** A fixture id: the page is addressed by the fixture's UUID only. */
const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/matches/$matchId")({
  // The summary is the page itself, `/matches/<id>`: no `?tab=summary`. Every
  // match link used to add it, so the canonical address answered a 307 to
  // another URL (audit 2026-09-24). The key is always returned, so an unknown
  // `tab` in the address bar is overwritten rather than inherited.
  validateSearch: (search: Record<string, unknown>): { tab?: MatchTabKey } => {
    const raw = search.tab as MatchTabKey;
    return { tab: TAB_KEYS.includes(raw) && raw !== "summary" ? raw : undefined };
  },
  /**
   * The whole French detail, not just the two names the metadata needs.
   *
   * That is the fix for the hydration failure this page threw on every load
   * (React #418, "Hydration failed because the server rendered HTML didn't
   * match the client"), the same one `fantasy.players.$playerId` had:
   * `src/router.tsx` builds a fresh `QueryClient` on each side and wires no
   * SSR dehydrate/hydrate bridge, so the cache this loader warms exists ONLY
   * on the server. The server rendered the full match; the browser's first
   * render — same component, empty cache — rendered the loading state, and
   * React threw the server tree away. Router loader data, unlike query
   * state, IS serialized to the client, so the component seeds its query
   * with it (`initialData`) and both first renders are the same tree.
   *
   * French because the server always renders French (the language is read
   * from storage after mount); an Arabic reader's query is a different key
   * and loads after hydration.
   *
   * An id that is not a fixture's (malformed, or unknown to the database) is
   * a 404; a failed read is a 503 the crawler retries (see
   * `@/lib/page-availability`). Both used to render "Chargement…" with 200.
   */
  loader: async ({ params, context }) => {
    if (!MATCH_ID.test(params.matchId)) throw notFound();
    try {
      const queryKey = ["football", "match-detail", params.matchId, "fr"];
      const detail = await context.queryClient.ensureQueryData({
        queryKey,
        queryFn: () => footballService.getMatchDetailPage(params.matchId, "fr"),
      });
      // When this copy was fetched, so the page's query knows how old its
      // seed is: the router can hand back loader data it cached minutes ago.
      const fetchedAt = context.queryClient.getQueryState(queryKey)?.dataUpdatedAt || Date.now();
      return { detail, fetchedAt };
    } catch (error) {
      if (isMissingContent(error)) throw notFound();
      return UNAVAILABLE;
    }
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: ({ params, loaderData }) => {
    const canonical = `${PUBLIC_SITE_ORIGIN}/matches/${encodeURIComponent(params.matchId)}`;
    const detail = isUnavailable(loaderData) ? undefined : loaderData?.detail;
    const home = detail?.clubs.find((club) => club.id === detail.match.homeClubId)?.name.fr;
    const away = detail?.clubs.find((club) => club.id === detail.match.awayClubId)?.name.fr;
    const named = home && away ? { home, away } : null;
    const title = named
      ? `${named.home} — ${named.away} | BotolaGO`
      : "Match Botola Pro — BotolaGO";
    const description = named
      ? `${named.home} contre ${named.away} : score en direct, composition, statistiques et temps forts sur BotolaGO.`
      : "Score en direct, compositions, statistiques et temps forts du match sur BotolaGO.";
    // The match and the trail to it, only from what the page loaded (see
    // `@/lib/structured-data`); nothing for a page whose read failed.
    const structured =
      detail && named
        ? [
            sportsEventJsonLd({
              canonicalUrl: canonical,
              match: detail.match,
              homeName: named.home,
              awayName: named.away,
            }),
            breadcrumbJsonLd([
              { name: "Accueil", path: "/" },
              { name: "Matchs", path: "/matches" },
              {
                name: `${named.home} – ${named.away}`,
                path: `/matches/${encodeURIComponent(params.matchId)}`,
              },
            ]),
          ]
        : [];
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary_large_image" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonical }],
      ...(structured.length
        ? {
            scripts: structured.map((jsonLd) => ({
              type: "application/ld+json",
              children: serializeJsonLd(jsonLd),
            })),
          }
        : {}),
    };
  },
  component: MatchDetailPage,
});

function MatchDetailPage() {
  const { matchId } = Route.useParams();
  const { tab = "summary" } = Route.useSearch();
  const loaded = Route.useLoaderData();
  const loaderData = isUnavailable(loaded) ? undefined : loaded;
  const navigate = useNavigate({ from: Route.fullPath });
  const { t, tr, lang } = useI18n();
  // Articles and matches are the pages most often opened from a shared link,
  // where there is no in-app entry to go back to; fall back to the listing.
  const goBack = useBackTo("/matches");
  const [copied, setCopied] = useState(false);
  const headingId = useId();
  // The split header's element, which the bar watches to go compact.
  const [headerEl, setHeaderEl] = useState<HTMLElement | null>(null);
  const scrolledPast = useScrolledPast(headerEl);

  const serverDetail =
    lang === "fr" && loaderData?.detail.match.id === matchId ? loaderData.detail : undefined;
  const detailQ = useQuery({
    queryKey: ["football", "match-detail", matchId, lang],
    queryFn: () => footballService.getMatchDetailPage(matchId, lang),
    // Identical on the server and in the browser's first render — see the
    // loader. Without it the two trees disagree. With its real age, so a seed
    // the router kept from an earlier visit is refetched, not trusted as new.
    initialData: serverDetail,
    initialDataUpdatedAt: serverDetail ? loaderData?.fetchedAt : undefined,
    // Live matches refresh on a calm cadence, and so does a match about to
    // start, so a reader waiting on the page sees it kick off. Paused while
    // the tab is hidden.
    refetchInterval: (query) => matchRefetchInterval(query.state.data?.match, Date.now()),
    refetchIntervalInBackground: false,
    // Back on the tab, a match that is moving is asked for at once.
    refetchOnWindowFocus: (query) =>
      matchRefetchInterval(query.state.data?.match, Date.now()) !== false,
  });
  // Related news is a News surface, so it is gated on the same flag as every
  // other one. `enabled` rather than a conditional hook: the query still has to
  // be declared unconditionally, and with the flag off it never runs, so a
  // match page makes no News request at all.
  const articlesQ = useQuery({
    queryKey: ["news", "feed", lang],
    queryFn: () => newsService.getArticles(lang),
    enabled: NEWS_ENABLED,
  });

  const match = detailQ.data?.match;
  const season = detailQ.data?.season;

  // The final whistle moves the "Face à face" tab's table. This page shows no
  // live strip, so it hears the whistle from its own reads of the match, in
  // either language (`rereadTableOnFinish`).
  const queryClient = useQueryClient();
  useEffect(
    () => rereadTableOnFinish(queryClient, ["football", "match-detail", matchId]),
    [queryClient, matchId],
  );

  const clubById = (id?: string) => detailQ.data?.clubs.find((club) => club.id === id);
  const home = clubById(match?.homeClubId);
  const away = clubById(match?.awayClubId);
  const h2h = detailQ.data?.headToHead ?? [];
  const live = detailQ.data?.live;
  const lineups = detailQ.data?.lineups ?? [];
  const pressure = detailQ.data?.pressure ?? [];
  const absences = detailQ.data?.absences ?? [];

  // Above the early returns (Rules of Hooks), and fed the events whether or
  // not they are loaded yet: it seeds from the first FRESH list it sees, so a
  // goal already on the sheet — or scored while the reader was elsewhere,
  // still missing from the cached copy they come back to — never plays.
  const { goal, dismiss } = useGoalMoment(matchId, eventsWhenFresh(detailQ, live?.events), match);

  // Both sides together, with the clash rule: a split header, a stat bar or
  // an H2H bar must never paint two independent (and possibly equal) reds.
  const palettes = useMemo(
    () => (home && away ? clubMatchPalettes(home, away) : null),
    [home, away],
  );

  const related = useMemo(() => {
    if (!match || !articlesQ.data) return [];
    return articlesQ.data
      .filter((a) => a.clubIds.includes(match.homeClubId) || a.clubIds.includes(match.awayClubId))
      .slice(0, 3);
  }, [match, articlesQ.data]);

  // Loading, failed or missing: the same bar, with the way back and nothing
  // to share yet.
  const plainBar = <MatchTopBar onBack={goBack} compact={false} />;

  if (detailQ.isLoading) {
    return (
      <AppShell backgroundVariant="matches" topBar={plainBar}>
        <LoadingState />
      </AppShell>
    );
  }

  if (detailQ.isError) {
    return (
      <AppShell backgroundVariant="matches" topBar={plainBar}>
        <div className="mt-8">
          <ErrorState onRetry={() => void detailQ.refetch()} />
        </div>
      </AppShell>
    );
  }

  if (!match || !home || !away || !live || !palettes) {
    return (
      <AppShell backgroundVariant="matches" topBar={plainBar}>
        <UiCard padding="lg" className="mt-8 text-center">
          <h1 className={cn(ui.display.section, ui.tone.default)}>
            {t("matches.detail.not_found_title")}
          </h1>
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>
            {t("matches.detail.not_found_desc")}
          </p>
          <UiLinkButton to="/matches" variant="ink" className="mt-4">
            {t("article.back")}
          </UiLinkButton>
        </UiCard>
      </AppShell>
    );
  }

  const isLive = match.status === "live";
  // What an empty panel says: a finished match's missing data is not promised.
  // As of the query's own read, which the server and the first render share.
  const phase = matchDataPhase(match, detailQ.dataUpdatedAt);
  const locale = lang === "ar" ? "ar-MA" : "fr-FR";
  // Pinned to the competition zone so this names the same day the card, the
  // strip and the fixture list name (BG-0100).
  const dateFmt = new Intl.DateTimeFormat(locale, {
    timeZone: MATCH_TIME_ZONE,
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(new Date(match.kickoff));
  const kicker =
    match.gameweek > 0
      ? `${t("matches.competition.botola")} · ${t("matches.gameweek")} ${match.gameweek}`
      : t("matches.competition.botola");

  const share = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    try {
      if (typeof navigator !== "undefined" && "share" in navigator) {
        await (navigator as unknown as { share: (d: ShareData) => Promise<void> }).share({
          title: `${tr(home.shortName)} ${t("matches.vs")} ${tr(away.shortName)}`,
          text: `${t("matches.competition.botola")} · ${dateFmt}`,
          url,
        });
        return;
      }
    } catch {
      /* user cancelled or blocked */
    }
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      /* ignore */
    }
  };

  const names = new Map(
    lineups.flatMap((lineup) =>
      lineup.players.map((player) => [player.id, player.displayName] as const),
    ),
  );
  const goalClub = goal?.side === "home" ? home : goal?.side === "away" ? away : undefined;

  return (
    <AppShell
      backgroundVariant="matches"
      topBar={
        <MatchTopBar
          kicker={kicker}
          onBack={goBack}
          onShare={share}
          compact={scrolledPast}
          fixture={{ match, home, away, palettes, elapsed: live.elapsed }}
        />
      }
    >
      {/* "Lien copié", under the bar, where the share button is. */}
      <div
        role="status"
        className="pointer-events-none fixed inset-x-0 top-[calc(var(--topbar-h)+0.75rem)] z-40 flex justify-center px-4"
      >
        {copied ? (
          <span
            className={cn(
              "px-4 py-2",
              ui.radius.full,
              ui.surface.inkPlain,
              ui.shadow.lifted,
              ui.text.meta,
              "[font-weight:var(--ui-weight-heavy)]",
            )}
          >
            {t("article.share_copied")}
          </span>
        ) : null}
      </div>

      <MatchScoreHeader
        ref={setHeaderEl}
        headingId={headingId}
        match={match}
        home={home}
        away={away}
        palettes={palettes}
        elapsed={live.elapsed}
        events={live.events}
        lineups={lineups}
      />

      {/* Pronostics (BG-0146): the same prediction as /pronostics. A card, not
          a fifth tab (the four tabs are pinned). Shown once promoted. */}
      {PRONOSTICS_PROMOTED && (
        <MatchPredictionCard
          fixtureId={match.id}
          roundNumber={match.gameweek > 0 ? match.gameweek : null}
        />
      )}

      <MatchTabs
        active={tab}
        onChange={(key) =>
          navigate({ search: { tab: key === "summary" ? undefined : key }, replace: true })
        }
        homePalette={palettes.home}
      />

      {/* Keyed on the tab so every switch remounts the panel and replays a
          quick fade — the swap is still instant, just no longer invisible. */}
      <div
        key={tab}
        id={MATCH_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${MATCH_TAB_ID_BASE}-tab-${tab}`}
        className="mt-4 animate-in fade-in-0 slide-in-from-bottom-1 duration-[var(--duration-quick)] ease-[var(--ease-standard)]"
      >
        {tab === "summary" && (
          <>
            <h2 className="sr-only">{t("matches.detail.summary")}</h2>
            <EventTimeline
              events={live.events}
              home={home}
              away={away}
              palettes={palettes}
              lineups={lineups}
              isLive={isLive}
              phase={phase}
              halfTime={
                match.halfTimeHomeScore !== undefined && match.halfTimeAwayScore !== undefined
                  ? { home: match.halfTimeHomeScore, away: match.halfTimeAwayScore }
                  : undefined
              }
            />
          </>
        )}

        {tab === "stats" && (
          <StatComparison
            stats={live.stats}
            home={home}
            away={away}
            palettes={palettes}
            isLive={isLive}
            phase={phase}
            pressure={pressure}
          />
        )}

        {tab === "lineups" && (
          <LineupsView
            lineups={lineups}
            home={home}
            away={away}
            palettes={palettes}
            phase={phase}
            absences={absences}
          />
        )}

        {tab === "h2h" && season && (
          <HeadToHeadTab
            season={season}
            home={home}
            away={away}
            palettes={palettes}
            meetings={h2h}
          />
        )}
      </div>

      {/* Related news — hidden at launch (NEWS_ENABLED). The cards link to
          /news/$articleId, whose beforeLoad redirects Home while the flag is
          false, so without this gate an approved article puts a dead card on
          the match page of every fixture involving either club. */}
      {NEWS_ENABLED && related.length > 0 && (
        <Section>
          <SectionHeader title={t("matches.detail.related_news")} eyebrow={t("news.title")} />
          <div className="grid gap-2.5">
            {related.map((a) => (
              <ArticleCard
                key={a.id}
                article={a}
                variant="horizontal"
                clubs={detailQ.data?.clubs ?? []}
              />
            ))}
          </div>
        </Section>
      )}

      <div className="h-6" aria-hidden />

      {/* A new goal while the page is open: the one-shot takeover. Keyed on
          the goal, so a second goal restarts it rather than extending it. */}
      {goal && goalClub ? (
        <GoalMoment
          key={goal.id}
          event={goal}
          club={goalClub}
          palette={goal.side === "home" ? palettes.home : palettes.away}
          scorer={goal.playerId ? names.get(goal.playerId) : undefined}
          assist={goal.relatedPlayerId ? names.get(goal.relatedPlayerId) : undefined}
          score={
            scoreCountsEveryGoal(match, live.events)
              ? { home: match.homeScore ?? 0, away: match.awayScore ?? 0 }
              : undefined
          }
          onDone={dismiss}
        />
      ) : null}
    </AppShell>
  );
}

type HeadToHeadTabProps = { season: MatchSeason } & Pick<
  ComponentProps<typeof HeadToHead>,
  "home" | "away" | "palettes" | "meetings"
>;

/**
 * The "Face à face" tab, with the season's table where the two clubs stand.
 *
 * Only a league's match has one (`hasLeagueTable`). A cup, super cup,
 * international or friendly fixture has results in its season too, and the
 * tab used to draw them as a merged points table under a "provisoire" note:
 * its tab is the meetings alone, and reads neither a table nor the seasons.
 */
function HeadToHeadTab({ season, ...rest }: HeadToHeadTabProps) {
  if (!hasLeagueTable(season)) return <HeadToHead {...rest} standings={[]} />;
  return <LeagueHeadToHeadTab season={season} {...rest} />;
}

/**
 * A league match's "Face à face" tab. The table is the Classement tab's
 * query, with its key and its function, so the two share one cache entry and
 * one ranking: the same tie order, shared ranks and provisional note. Only
 * this tab reads it, as it is mounted only while the tab is open; the detail
 * query, refetched every 30 seconds through a live match, carries no table.
 * Nothing reads it on the server either, so the server and the browser's
 * first render both hold its place (`standingsPending`), and agree.
 */
function LeagueHeadToHeadTab({ season, home, away, palettes, meetings }: HeadToHeadTabProps) {
  const { lang } = useI18n();
  const queryClient = useQueryClient();
  // A switch of language puts the whole page back to loading (the detail is
  // read again), so this tab comes back new, with no previous read of its
  // own to show. Until this language's table and season list are in, the
  // other language's copies of the same ones stand in, from the cache: the
  // ranks are the same in both (`buildStandings`), the clubs' names on the
  // rows are the match's, and the key never names another season.
  const other = lang === "ar" ? "fr" : "ar";
  const standingsQ = useQuery({
    queryKey: ["football", "standings", season.id, lang],
    queryFn: () => footballService.getStandings(season, lang),
    placeholderData: () =>
      queryClient.getQueryData<FootballStandings>(["football", "standings", season.id, other]),
  });
  // The season's status says whether a table worked out from the results is
  // provisional or, the season over, unofficial. The detail cannot say it
  // (`MatchSeason`), so it comes from the season list; when that read fails,
  // or the list does not reach back to the season, the note says neither and
  // only that the table is worked out from the results (`StandingsNotes`).
  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
    placeholderData: () =>
      queryClient.getQueryData<FootballSeason[]>(["football", "seasons", other]),
  });
  const table = standingsQ.data;
  return (
    <HeadToHead
      home={home}
      away={away}
      palettes={palettes}
      standings={table?.overall ?? []}
      standingsComputed={table?.computed ?? false}
      seasonStatus={seasonsQ.data?.find((candidate) => candidate.id === season.id)?.status}
      standingsPending={standingsQ.isPending || seasonsQ.isPending}
      // A failed read with no table in hand is said as one, not taken for a
      // season with no table yet.
      standingsFailed={standingsQ.isError && !table}
      onRetryStandings={() => {
        void standingsQ.refetch();
        if (seasonsQ.isError) void seasonsQ.refetch();
      }}
      meetings={meetings}
    />
  );
}
