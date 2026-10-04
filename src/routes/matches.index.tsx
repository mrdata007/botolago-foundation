import noMatchesArt from "@/assets/illustrations/empty-matches.webp";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, type ReactNode } from "react";
import { defaultSeason, footballService, type FootballSeason } from "@/services/football";
import { AppShell } from "@/components/shell/AppShell";
import { MatchCard } from "@/components/common/MatchCard";
import { SectionHeader } from "@/components/common/SectionHeader";
import { Section } from "@/components/common/Section";
import { DateStrip } from "@/components/matches/DateStrip";
import { LiveStrip } from "@/components/matches/LiveStrip";
import { MatchesTabs } from "@/components/matches/MatchesTabs";
import {
  clampMatchDay,
  isSameMatchDayQuery,
  matchDayQuery,
  matchDayRefetchInterval,
  openingMatchDay,
  settleEndedMatches,
  withLiveReadings,
} from "@/components/matches/match-day-query";
import { validateCalendarSearch, type CalendarSearch } from "@/components/matches/matches-search";
import { SeasonPicker } from "@/components/matches/SeasonPicker";
import { useLiveMatches, useOnLiveMatchEnd } from "@/components/matches/use-live-matches";
import { EmptyState, ErrorState } from "@/components/common/States";
import { MatchCardSkeleton } from "@/components/common/Skeletons";
import { ui, UiCard, UiChip, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { isSameMatchDay, matchDayFromKey, matchDayKey } from "@/lib/match-kickoff";
import { moroccoDateTimeFormat } from "@/lib/morocco-time";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { latestResultDayBefore, matchRounds, nextMatchDayAfter } from "@/lib/match-days";
import { unavailableHeaders } from "@/lib/page-availability";
import { prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";
import type { TranslationKey } from "@/i18n/dictionaries";
import type { Match } from "@/types/domain";
import { staggerStyle } from "@/lib/motion";

const MATCHES_TITLE = "Matches Botola Pro — scores en direct | BotolaGO";
const MATCHES_DESCRIPTION =
  "Suivez tous les matchs de la Botola Pro : scores en direct, calendrier, résultats et classement.";

export const Route = createFileRoute("/matches/")({
  // `?season=<id>`: the season the Classement tab was showing; `?date=` and
  // `?status=`: the day and the chip the reader chose, so a match opened from
  // the list and left with Retour comes back to the same list (matches-search.ts).
  validateSearch: validateCalendarSearch,
  // The day's fixtures are in the server's HTML (see `@/lib/ssr-prefetch`):
  // the season the page opens on, then its opening day, within the render's
  // one deadline. The list used to wait for the browser to pick the season
  // in an effect before it even asked, so the HTML never held a match (audit
  // 2026-09-25, A10). A read that fails or runs late is left to the browser,
  // and the response says so: 503 with Retry-After (`ssrAvailability`,
  // `@/lib/page-availability`), never a 200 whose list is empty.
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: {
    // A reader coming back to the page runs the loader again before it
    // shows, not behind a render of its last visit: that render would open
    // on yesterday after midnight, then jump. In the browser the loader
    // fetches nothing (`prefetchForSsr` is server-only), so waiting on it
    // costs a navigation nothing.
    staleReloadMode: "blocking",
    handler: async ({ context, deps }) => {
      // Today by the competition's calendar, whatever the server's zone
      // (UTC), decided here once: the browser's first render reads this day
      // back from the loader data rather than its own clock, so it opens on
      // the day the server rendered even when midnight falls between the two.
      const today = matchDayKey(new Date());
      const { queryClient } = context;
      await prefetchForSsr(queryClient, [
        {
          queryKey: ["football", "seasons", "fr"],
          queryFn: ({ signal }) => footballService.getSeasons("fr", signal),
        },
      ]);
      const seasons = queryClient.getQueryData<FootballSeason[]>(["football", "seasons", "fr"]);
      if (seasons) {
        const season = openingSeason(seasons, deps.season);
        await prefetchForSsr(queryClient, [
          matchDayQuery(openingMatchDay(season, today), "fr", season?.id),
        ]);
      }
      // Both reads above count: every key `prefetchForSsr` was handed, the
      // day's `matchDayQuery` key included, has to have loaded. A season
      // list that failed never asks for the day, and counts as failed itself.
      return { ...ssrAvailability(queryClient), today };
    },
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: () => ({
    meta: [
      { title: MATCHES_TITLE },
      { name: "description", content: MATCHES_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: MATCHES_TITLE },
      { property: "og:description", content: MATCHES_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/matches` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: MATCHES_TITLE },
      { name: "twitter:description", content: MATCHES_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/matches` }],
  }),
  component: MatchesPage,
});

type StatusFilter = "all" | "live" | "upcoming" | "finished";

const filterTabs: { key: StatusFilter; label: TranslationKey }[] = [
  { key: "all", label: "matches.tab.all" },
  { key: "live", label: "matches.tab.live" },
  { key: "upcoming", label: "matches.tab.upcoming" },
  { key: "finished", label: "matches.tab.results" },
];

const EMPTY_SEASONS: readonly FootballSeason[] = [];

/** Groups a match into a display bucket driven purely by domain status. */
function bucketOf(m: Match): "live" | "upcoming" | "finished" | "other" {
  if (m.status === "live") return "live";
  if (m.status === "scheduled") return "upcoming";
  if (m.status === "finished") return "finished";
  return "other"; // postponed etc. — rendered under upcoming for the selected date
}

/**
 * Day identity on this page is the competition's, not the viewer's
 * (BG-0100). The backend is already asked for a Casablanca day; filtering
 * the answer back through the browser's calendar is what made a 20:00
 * kickoff vanish from, or land on the wrong side of, the day the strip above
 * it was highlighting.
 */
const sameDay = isSameMatchDay;
const dateFromKey = matchDayFromKey;

/**
 * The season the page opens on: the one the other tab was on, else the
 * current one. The loader and the page both ask this, so the season the
 * server rendered is the one the browser's first render shows.
 */
function openingSeason(
  seasons: readonly FootballSeason[],
  requestedSeasonId: string | undefined,
): FootballSeason | undefined {
  return seasons.find((season) => season.id === requestedSeasonId) ?? defaultSeason(seasons);
}

/**
 * Matches (Option A, A-Matches).
 *
 * Under the global bar, a white title band: "Matches" in the display face
 * with the season as a soft pill, then the live strip while anything is live,
 * then the status chips, which stick under the bar (and under the strip,
 * through `--livestrip-h`) as the page scrolls. The page itself opens on the
 * date band — the day, its round, the previous / next day — and lists that
 * day's matches as club-colour rows: live and upcoming together, then the
 * results. The league table is the other tab, `/matches/standings`: the
 * Calendrier | Classement tabs sit between the title band and the live strip.
 *
 * The title band, the strip and the chips are the shell's `pageHeader`, so
 * all three run edge to edge and the chips can stick for the whole page: a
 * sticky element only sticks inside its parent, and the content column ends
 * where it does. The strip is rendered here, between the title and the
 * chips, rather than by `AppShell` after the whole header, so that on scroll
 * the strip sits directly under the bar and the chips directly under it.
 *
 * The board's "Botola Pro ▾" and "Tous les clubs ▾" chips are not drawn:
 * there is one competition, and no club filter behind the second.
 */
function MatchesPage() {
  const { t, lang } = useI18n();
  // The router hands on the URL's own keys beside the validated ones, so a
  // `?date=2026-02-31` it dropped from the validated search is still in what
  // `useSearch` returns: validated again here, where the values are used.
  const search = validateCalendarSearch(Route.useSearch());
  const navigate = useNavigate({ from: Route.fullPath });
  const { today } = Route.useLoaderData();
  // The season, the day and the chip are the URL's, not this page's state: a
  // match opened from the list is a new history entry, and Retour has to land
  // on the list as it was left. Each is derived during render, so the server's
  // render has them too. A choice replaces the entry (Retour leaves the page
  // rather than stepping back through every day tapped) and keeps the scroll
  // where it is.
  const requestedSeasonId = search.season;
  const filter: StatusFilter = search.status ?? "all";

  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
    // The same seasons in the other language while it loads: an Arabic
    // reader's page switches language right after hydration, and without
    // them the opening day would jump to today and back.
    placeholderData: keepPreviousData,
  });

  const seasons = seasonsQ.data ?? EMPTY_SEASONS;
  const selectedSeason = openingSeason(seasons, requestedSeasonId);
  const openingDay = openingMatchDay(selectedSeason, today);
  const matchDay = search.date ? clampMatchDay(search.date, selectedSeason) : openingDay;
  const selectedDate = useMemo(() => dateFromKey(matchDay), [matchDay]);
  // The date band's "today" is the loader's too, not this device's clock, so
  // the band names the day the server rendered as the server named it.
  const todayDate = useMemo(() => dateFromKey(today), [today]);

  // The fixtures still to come (the Home page's own query, so one request
  // serves both): they say which day to open on and what to point an empty
  // day at.
  const upcomingQ = useQuery({
    queryKey: ["football", "home-matches", lang],
    queryFn: () => footballService.getHomeMatches(lang),
    enabled: seasonsQ.isSuccess,
  });
  const nextDay = nextMatchDayAfter(upcomingQ.data?.matches ?? [], matchDay);

  const dayQuery = matchDayQuery(matchDay, lang, selectedSeason?.id);
  const matchesQ = useQuery({
    ...dayQuery,
    enabled: seasonsQ.isSuccess,
    // The same day in the language the page was just showing, while the new
    // one loads (`isSameMatchDayQuery`): the rows the server rendered stay
    // up through an Arabic reader's switch instead of flashing a skeleton.
    // A new function each render, so it is asked again for every key rather
    // than handing on the placeholder it gave the last one.
    placeholderData: (previous, previousQuery) =>
      previousQuery && isSameMatchDayQuery(previousQuery.queryKey, dayQuery.queryKey)
        ? previous
        : undefined,
    // While something on the day is moving (a match about to start, in play,
    // just finished), the list follows it; a past or later day never polls,
    // and nor does a hidden tab. See `matchDayRefetchInterval`.
    refetchInterval: (query) => matchDayRefetchInterval(query.state.data?.matches, Date.now()),
    refetchIntervalInBackground: false,
  });

  // The live strip above the list reads the matches in play on its own
  // query. Its newer reading of a match is the one the row shows, so the two
  // never disagree about a score; and when a match leaves the strip, the day
  // it was on reads its final state at once instead of at its next refresh
  // (`settleEndedMatches`).
  const liveQ = useLiveMatches();
  const queryClient = useQueryClient();
  useOnLiveMatchEnd((ended, lastReading) => {
    settleEndedMatches(queryClient, dayQuery.queryKey, ended, lastReading);
  });
  const matches = useMemo(
    () =>
      withLiveReadings(
        { matches: matchesQ.data?.matches ?? [], updatedAt: matchesQ.dataUpdatedAt },
        liveQ.data ? { matches: liveQ.data.matches, updatedAt: liveQ.dataUpdatedAt } : undefined,
      ),
    [matchesQ.data, matchesQ.dataUpdatedAt, liveQ.data, liveQ.dataUpdatedAt],
  );

  const seasonBounds = useMemo(
    () =>
      selectedSeason
        ? {
            minDate: dateFromKey(selectedSeason.startsOn),
            maxDate: dateFromKey(selectedSeason.endsOn),
          }
        : undefined,
    [selectedSeason],
  );

  const updateSearch = (change: Partial<CalendarSearch>) =>
    void navigate({
      search: (previous) => {
        const next = { ...previous, ...change };
        // What is only a default stays out of the URL, so its links stay clean.
        return {
          ...(next.season ? { season: next.season } : {}),
          ...(next.date ? { date: next.date } : {}),
          ...(next.status ? { status: next.status } : {}),
        };
      },
      replace: true,
      resetScroll: false,
    });

  const handleSeasonChange = (seasonId: string) => {
    const season = seasons.find((item) => item.id === seasonId);
    if (!season) return;
    // The new season opens on its own day, with every chip off.
    updateSearch({
      season: season.isCurrent ? undefined : season.id,
      date: undefined,
      status: undefined,
    });
  };

  const selectDay = (day: string) => {
    const clamped = clampMatchDay(day, selectedSeason);
    updateSearch({ date: clamped === openingDay ? undefined : clamped });
  };

  const handleDateChange = (date: Date) => selectDay(matchDayKey(date));

  const setFilter = (next: StatusFilter) =>
    updateSearch({ status: next === "all" ? undefined : next });

  const clubById = (id: string) => matchesQ.data?.clubs.find((club) => club.id === id);

  // Matches happening on the selected day (all statuses).
  const dayMatches = useMemo(
    () => matches.filter((m) => sameDay(new Date(m.kickoff), selectedDate)),
    [matches, selectedDate],
  );

  // Overall counts for the currently selected day, used by the filter chips.
  const dayCounts = useMemo(() => {
    return dayMatches.reduce(
      (acc, m) => {
        const b = bucketOf(m);
        if (b === "live") acc.live++;
        else if (b === "upcoming" || b === "other") acc.upcoming++;
        else if (b === "finished") acc.finished++;
        return acc;
      },
      { live: 0, upcoming: 0, finished: 0 },
    );
  }, [dayMatches]);

  const totalDay = dayCounts.live + dayCounts.upcoming + dayCounts.finished;

  // `isPending`, not `isLoading`: the day's query waits for the seasons, and
  // a query that is waiting has no data but is not loading either.
  const loading = seasonsQ.isPending || matchesQ.isPending;
  // A read that failed with nothing to show for it. A refresh that fails (a
  // poll during a live match, a return to the tab) keeps the rows it had and
  // the next one tries again: an error card over rows that still stand would
  // say they are wrong.
  const failed = seasonsQ.isLoadingError || matchesQ.isLoadingError;

  // From a day with nothing on it, the way on: the next fixtures (the Home
  // page's own query, above) and the latest results. The results come from the
  // season's fixture list, read only for a day that is empty.
  const resultDaysQ = useQuery({
    queryKey: ["football", "season-result-days", selectedSeason?.id ?? "none", lang],
    queryFn: ({ signal }) => footballService.getSeasonResultDays(selectedSeason!, lang, signal),
    enabled: !loading && !failed && totalDay === 0 && selectedSeason !== undefined,
    staleTime: 5 * 60_000,
  });
  const resultsDay = latestResultDayBefore(resultDaysQ.data ?? [], matchDay);

  const dayLabel = (day: string) =>
    moroccoDateTimeFormat(lang === "ar" ? "ar-MA" : "fr-FR", {
      weekday: "short",
      day: "numeric",
      month: "short",
    }).format(matchDayFromKey(day));
  const nextDayLabel = nextDay ? dayLabel(nextDay) : null;
  const resultsDayLabel = resultsDay ? dayLabel(resultsDay) : null;

  const visibleByBucket = useMemo(() => {
    const buckets: Record<"live" | "upcoming" | "finished", Match[]> = {
      live: [],
      upcoming: [],
      finished: [],
    };
    for (const m of dayMatches) {
      const b = bucketOf(m);
      if (b === "live") buckets.live.push(m);
      else if (b === "finished") buckets.finished.push(m);
      else buckets.upcoming.push(m);
    }
    // Sort each bucket for deterministic, editorial order.
    buckets.live.sort((a, b) => (a.minute ?? 0) - (b.minute ?? 0));
    buckets.upcoming.sort((a, b) => a.kickoff.localeCompare(b.kickoff));
    buckets.finished.sort((a, b) => b.kickoff.localeCompare(a.kickoff));
    return buckets;
  }, [dayMatches]);

  // The round(s) the day's matches belong to: the band names them, and a row
  // from another round carries its own "J. n" tag.
  const dayGameweeks = useMemo(() => matchRounds(dayMatches), [dayMatches]);
  const dayGameweek = dayGameweeks.length === 1 ? dayGameweeks[0] : undefined;

  // Live first, then what is still to come: one card of rows, as the board
  // stacks a match day. The results follow under their own heading.
  const fixtures = [
    ...(filter === "all" || filter === "live" ? visibleByBucket.live : []),
    ...(filter === "all" || filter === "upcoming" ? visibleByBucket.upcoming : []),
  ];
  const results = filter === "all" || filter === "finished" ? visibleByBucket.finished : [];

  const rows = (list: readonly Match[]) =>
    list.map((m, index) => {
      const home = clubById(m.homeClubId);
      const away = clubById(m.awayClubId);
      if (!home || !away) return null;
      return (
        <div key={m.id} className="enter-rise stagger min-w-0" style={staggerStyle(index)}>
          <MatchCard match={m} home={home} away={away} variant="list" listGameweek={dayGameweek} />
        </div>
      );
    });

  return (
    <AppShell
      backgroundVariant="matches"
      pageHeader={
        <>
          <UiPageTitle
            title={t("matches.title")}
            trailing={
              <SeasonPicker
                seasons={seasons}
                selected={selectedSeason}
                loading={seasonsQ.isLoading}
                onChange={handleSeasonChange}
              />
            }
            // The tabs draw the rule under the band.
            className="border-b-0"
          />
          <MatchesTabs active="calendar" season={selectedSeason} />
          <LiveStrip />
          <StatusFilters value={filter} onChange={setFilter} liveCount={dayCounts.live} />
        </>
      }
    >
      {/* Date navigation, flush under the chips on a phone. */}
      <DateStrip
        selected={selectedDate}
        onSelect={handleDateChange}
        today={todayDate}
        minDate={seasonBounds?.minDate}
        maxDate={seasonBounds?.maxDate}
        gameweeks={dayGameweeks}
        className="-mt-4 sm:mt-0"
      />

      {/* Loading / error / empty */}
      {loading && (
        <UiCard
          padding="none"
          className="mt-4 divide-y divide-[color:var(--ui-rule)] overflow-hidden"
        >
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
          <MatchCardSkeleton flat />
        </UiCard>
      )}
      {failed && (
        <div className="mt-4">
          <ErrorState
            message={t("state.error_matches")}
            onRetry={() => {
              void seasonsQ.refetch();
              if (seasonsQ.isSuccess) void matchesQ.refetch();
            }}
          />
        </div>
      )}
      {!loading && !failed && totalDay === 0 && (
        <div className="mt-4">
          {/* Nothing is scheduled that day: not a failure, so no retry. The
              way on is to what does exist: the next fixtures and the latest
              results, each only when there is one. */}
          <EmptyState
            compact
            illustration={noMatchesArt}
            action={
              <>
                {nextDay && nextDayLabel ? (
                  <DayLink onClick={() => selectDay(nextDay)}>
                    {t("matches.empty.next").replace("{date}", nextDayLabel)}
                  </DayLink>
                ) : null}
                {resultsDay && resultsDayLabel ? (
                  <DayLink onClick={() => selectDay(resultsDay)}>
                    {t("matches.empty.results").replace("{date}", resultsDayLabel)}
                  </DayLink>
                ) : null}
              </>
            }
          >
            {t("matches.section.no_matches_today")}
          </EmptyState>
        </div>
      )}

      {/* The day's live and upcoming matches. The card clips the rows' club
          edge bars to its corners. */}
      {!loading && fixtures.length > 0 && (
        <UiCard
          padding="none"
          className="mt-4 divide-y divide-[color:var(--ui-rule)] overflow-hidden"
        >
          {rows(fixtures)}
        </UiCard>
      )}

      {/* The day's results. */}
      {!loading && results.length > 0 && (
        <Section>
          <SectionHeader as="h3" title={t("matches.section.finished")} />
          <UiCard padding="none" className="divide-y divide-[color:var(--ui-rule)] overflow-hidden">
            {rows(results)}
          </UiCard>
        </Section>
      )}

      {/* Per-filter empty states — only when the day itself has content in
          other buckets, so the message is informative rather than redundant. */}
      {!loading && filter === "live" && visibleByBucket.live.length === 0 && totalDay > 0 && (
        <div className="mt-4">
          <EmptyState compact>{t("matches.section.no_live")}</EmptyState>
        </div>
      )}
      {!loading &&
        filter === "upcoming" &&
        visibleByBucket.upcoming.length === 0 &&
        totalDay > 0 && (
          <div className="mt-4">
            <EmptyState compact>{t("matches.section.no_upcoming")}</EmptyState>
          </div>
        )}
      {!loading &&
        filter === "finished" &&
        visibleByBucket.finished.length === 0 &&
        totalDay > 0 && (
          <div className="mt-4">
            <EmptyState compact>{t("matches.section.no_finished")}</EmptyState>
          </div>
        )}

      {/* An intentional spacer so the last card clears the bottom nav shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}

/** A way on from an empty day: the day it names, as a text button with an arrow. */
function DayLink({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(ui.text.bodyStrong, ui.tone.ink, ui.focus, "min-h-[var(--ui-tap-min)]")}
    >
      {children} →
    </button>
  );
}

/**
 * The status filters (Tous · En direct · À venir · Résultats) as Option A's
 * round chips, in a white band that sticks under the top bar — and under the
 * live strip while it shows, moving up with it when it slides away.
 *
 * The four chips share one line at every width. At 390px they fit as drawn;
 * narrower, each gives ground and its label truncates rather than the row
 * scrolling a filter off-screen with nothing to say it is there (BG-0111).
 * "En direct" carries the breathing dot and the day's live count while a
 * match is on, as the board draws it.
 */
function StatusFilters({
  value,
  onChange,
  liveCount,
}: {
  value: StatusFilter;
  onChange: (next: StatusFilter) => void;
  liveCount: number;
}) {
  const { t } = useI18n();
  return (
    <div
      className={cn(
        "sticky top-[calc(var(--topbar-h)+var(--livestrip-h))] z-20",
        "transition-[top] duration-[var(--duration-sheet)] ease-[var(--ease-standard)]",
        ui.surface.bar,
        ui.rule.block,
      )}
    >
      <div
        role="group"
        aria-label={t("matches.a11y.status_filters")}
        className={cn(
          "mx-auto flex min-w-0 items-center gap-1.5 pb-2.5 pt-1 max-[359px]:gap-1 md:max-w-[var(--ui-content-max)]",
          ui.space.gutter,
        )}
      >
        {filterTabs.map((it) => {
          const active = value === it.key;
          const live = it.key === "live" && liveCount > 0;
          return (
            <UiChip
              key={it.key}
              selected={active}
              onClick={() => onChange(it.key)}
              // Measured in French, the longest set: 348px of chips at 390
              // with the live count. Under 390 the count badge steps out
              // (the chip still says it, for assistive tech) and under 360
              // the chips tighten; shrinking with an ellipsis is only the
              // last resort, for text zoomed past all of that.
              className="min-w-0 shrink max-[359px]:px-2"
            >
              {live ? (
                <span
                  aria-hidden
                  className={cn(
                    "live-breathe h-2 w-2 shrink-0 bg-[color:var(--ui-live)]",
                    ui.radius.full,
                  )}
                />
              ) : null}
              <span className="min-w-0 truncate">{t(it.label)}</span>
              {live ? <span className="sr-only">{liveCount}</span> : null}
              {live ? (
                <span
                  aria-hidden
                  className={cn(
                    "inline-grid h-6 min-w-6 shrink-0 place-items-center px-1.5 max-[389px]:hidden",
                    ui.radius.full,
                    ui.text.micro,
                    "[font-weight:var(--ui-weight-heavy)]",
                    ui.text.tabular,
                    active
                      ? "bg-[color:var(--ui-surface)] text-[color:var(--ui-ink-fg)]"
                      : ui.surface.inkPlain,
                  )}
                >
                  {liveCount}
                </span>
              ) : null}
            </UiChip>
          );
        })}
      </div>
    </div>
  );
}
