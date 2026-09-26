import { unavailableHeaders } from "@/lib/page-availability";
import standingsSoonArt from "@/assets/illustrations/standings-soon.webp";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { useAuth } from "@/auth/AuthProvider";
import { SectionHeaderLink } from "@/components/common/SectionHeader";
import { SkeletonList, StandingsRowSkeleton } from "@/components/common/Skeletons";
import { EmptyState, ErrorState } from "@/components/common/States";
import { findClub } from "@/components/fantasy/club-identity";
import { LiveStrip } from "@/components/matches/LiveStrip";
import { MatchesTabs } from "@/components/matches/MatchesTabs";
import { validateMatchesSearch } from "@/components/matches/matches-search";
import { SeasonPicker } from "@/components/matches/SeasonPicker";
import { isSameStandingsQuery } from "@/components/matches/standings-query";
import {
  StandingsLegend,
  StandingsNotes,
  StandingsTable,
  type StandingsView,
} from "@/components/matches/StandingsTable";
import { roundsLabel } from "@/components/matches/standings-copy";
import { YourClubCard } from "@/components/matches/YourClubCard";
import { useOnLiveMatchEnd } from "@/components/matches/use-live-matches";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiButton, UiChip, UiPageTitle } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { clubStanding } from "@/lib/league-table";
import { cn } from "@/lib/utils";
import { ssrAvailability, prefetchForSsr } from "@/lib/ssr-prefetch";
import { footballService, type FootballSeason } from "@/services/football";

const STANDINGS_TITLE = "Classement Botola Pro — points, forme et buts | BotolaGO";
const STANDINGS_DESCRIPTION =
  "Le classement de la Botola Pro Inwi : points, victoires, nuls, défaites, différence de buts et forme des 16 clubs, à domicile et à l'extérieur.";

export const Route = createFileRoute("/matches/standings")({
  // `?season=<id>`: the season the Calendrier tab was showing (matches-search.ts).
  validateSearch: validateMatchesSearch,
  // The table itself is in the server's HTML (see `@/lib/ssr-prefetch`), for
  // the season the page opens on: the one asked for, else the current one.
  loaderDeps: ({ search }) => ({ season: search.season }),
  loader: async ({ context, deps }) => {
    const { queryClient } = context;
    await prefetchForSsr(queryClient, [
      {
        queryKey: ["football", "seasons", "fr"],
        queryFn: ({ signal }) => footballService.getSeasons("fr", signal),
      },
    ]);
    const seasons = queryClient.getQueryData<FootballSeason[]>(["football", "seasons", "fr"]);
    const season =
      seasons?.find((candidate) => candidate.id === deps.season) ??
      seasons?.find((candidate) => candidate.isCurrent) ??
      seasons?.[0];
    if (season) {
      await prefetchForSsr(queryClient, [
        {
          queryKey: ["football", "standings", season.id, "fr"],
          queryFn: ({ signal }) => footballService.getStandings(season, "fr", signal),
        },
      ]);
    }
    return ssrAvailability(queryClient);
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: () => ({
    meta: [
      { title: STANDINGS_TITLE },
      { name: "description", content: STANDINGS_DESCRIPTION },
      { property: "og:type", content: "website" },
      { property: "og:title", content: STANDINGS_TITLE },
      { property: "og:description", content: STANDINGS_DESCRIPTION },
      { property: "og:url", content: `${PUBLIC_SITE_ORIGIN}/matches/standings` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: STANDINGS_TITLE },
      { name: "twitter:description", content: STANDINGS_DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/matches/standings` }],
  }),
  component: StandingsPage,
});

const EMPTY_SEASONS: readonly FootballSeason[] = [];

/**
 * Classement (A-Standings: "Classique", with the "Votre club" card of
 * "Les enjeux").
 *
 * The second tab of Matches. Under the same title band and season pill as the
 * calendar: where the table stands ("après 5 journées", "classement final"),
 * the reader's own club, then the table — overall, home or away, or the form
 * guide — with its zone bars and their key.
 *
 * The table is worked out from the season's results (`getStandings`), so it
 * fills in as the matches are played. Before the first result there is none:
 * the page says so and offers last season's final table instead. A worked-out
 * table says so under it, and is never called final: only the provider's
 * table is (`FootballStandings.computed`).
 */
function StandingsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { season: requestedSeasonId } = Route.useSearch();
  // The season the other tab was on, else (below) the current one.
  const [seasonId, setSeasonId] = useState<string | null>(() => requestedSeasonId ?? null);
  const [view, setView] = useState<StandingsView>("overall");

  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
    // The same seasons in the other language while it loads, as on the
    // calendar: without them a switch of language drops the season, and the
    // table with it, back to the skeleton.
    placeholderData: keepPreviousData,
  });
  const seasons = seasonsQ.data ?? EMPTY_SEASONS;
  const season =
    seasons.find((candidate) => candidate.id === seasonId) ??
    seasons.find((candidate) => candidate.isCurrent) ??
    seasons[0];
  // The season before the one shown, for the "no table yet" state.
  const previous = useMemo(
    () =>
      season
        ? seasons
            .filter((candidate) => candidate.startsOn < season.startsOn)
            .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0]
        : undefined,
    [seasons, season],
  );

  const standingsQ = useQuery({
    queryKey: ["football", "standings", season?.id, lang],
    queryFn: () => footballService.getStandings(season!, lang),
    enabled: season != null,
    // The same season's table in the language the page was just showing,
    // while the new one loads (`isSameStandingsQuery`): the ranks do not
    // depend on the language. Another season's never: picking one shows the
    // skeleton until its own table is in. A new function each render, as on
    // the calendar, so it is asked again for every key.
    placeholderData: (previous, previousQuery) =>
      previousQuery &&
      isSameStandingsQuery(previousQuery.queryKey, ["football", "standings", season?.id, lang])
        ? previous
        : undefined,
  });
  const data = standingsQ.data;
  // A match that finishes while the page is open changes the table: the live
  // strip sees it leave, and every table worked out from the results refetches.
  const queryClient = useQueryClient();
  useOnLiveMatchEnd(() => {
    void queryClient.invalidateQueries({ queryKey: ["football", "standings"] });
  });

  const loading = seasonsQ.isPending || (season != null && standingsQ.isPending);
  const failed = seasonsQ.isError || standingsQ.isError;

  const clubById = (id: string) => data?.clubs.find((club) => club.id === id);
  const favourite = findClub(data?.clubs, user?.favoriteClubId);
  const favouriteStanding = favourite && data ? clubStanding(data.overall, favourite.id) : null;

  // Home, away and form come from the results; a season known only from a
  // stored table has the overall one alone.
  const hasViews = (data?.home.length ?? 0) > 0;
  const shown: StandingsView = hasViews ? view : "overall";
  const rows = shown === "home" ? data?.home : shown === "away" ? data?.away : data?.overall;

  const views: { value: StandingsView; label: string }[] = [
    { value: "overall", label: t("standings.view.overall") },
    { value: "home", label: t("standings.view.home") },
    { value: "away", label: t("standings.view.away") },
    { value: "form", label: t("matches.table.form") },
  ];
  const shownLabel = views.find((option) => option.value === shown)!.label;

  const nf = new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR");
  const rounds = data ? roundsLabel(data.rounds, lang, t, (value) => nf.format(value)) : "";
  const status = [
    t("matches.competition.botola"),
    season?.status === "completed" && !data?.computed
      ? `${t("standings.final")} ${rounds}`
      : rounds,
  ].join(" · ");

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
                selected={season}
                loading={seasonsQ.isLoading}
                onChange={setSeasonId}
              />
            }
            // The tabs draw the rule under the band.
            className="border-b-0"
          />
          <MatchesTabs active="standings" season={season} />
          <LiveStrip />
        </>
      }
    >
      {loading ? (
        <div aria-busy="true">
          <SkeletonList count={8}>{() => <StandingsRowSkeleton />}</SkeletonList>
        </div>
      ) : failed ? (
        <ErrorState
          onRetry={() => {
            void seasonsQ.refetch();
            if (season) void standingsQ.refetch();
          }}
        />
      ) : !data || data.overall.length === 0 ? (
        <div className="grid gap-3">
          <EmptyState illustration={standingsSoonArt}>{t("matches.table.empty")}</EmptyState>
          {previous ? (
            <UiButton variant="soft" onClick={() => setSeasonId(previous.id)}>
              {t("standings.previous_season").replace("{season}", previous.label)}
            </UiButton>
          ) : null}
        </div>
      ) : (
        <div className="grid min-w-0 gap-4">
          {/* Every club in the table opens its page; "all clubs" lists them. */}
          <div className="flex min-w-0 items-center justify-between gap-3">
            <p className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>{status}</p>
            <SectionHeaderLink to="/clubs" className="-me-2 shrink-0">
              {t("club.all_clubs")}
            </SectionHeaderLink>
          </div>

          {favourite && favouriteStanding ? (
            <YourClubCard club={favourite} standing={favouriteStanding} />
          ) : null}

          <section aria-labelledby="standings-heading" className="grid min-w-0 gap-3">
            <h2 id="standings-heading" className="sr-only">
              {t("matches.table_preview")}
            </h2>
            {hasViews ? (
              <div
                role="group"
                aria-label={t("standings.a11y.views")}
                className="flex min-w-0 items-center gap-1.5 max-[359px]:gap-1"
              >
                {views.map((option) => (
                  <UiChip
                    key={option.value}
                    selected={shown === option.value}
                    onClick={() => setView(option.value)}
                    // Four chips share one line; narrower than 360px each gives
                    // ground and truncates rather than scrolling one away.
                    className="min-w-0 shrink max-[359px]:px-2"
                  >
                    <span className="min-w-0 truncate">{option.label}</span>
                  </UiChip>
                ))}
              </div>
            ) : null}
            <StandingsTable
              rows={rows ?? []}
              clubById={clubById}
              view={shown}
              caption={`${t("matches.table_preview")} · ${shownLabel}`}
              highlightClubId={favourite?.id}
            />
            {shown === "overall" || shown === "form" ? <StandingsLegend /> : null}
            {/* Home and away are always worked out from the results. */}
            <StandingsNotes
              rows={rows ?? []}
              computed={shown === "home" || shown === "away" || data.computed}
              seasonStatus={season?.status}
            />
          </section>
        </div>
      )}

      {/* An intentional spacer so the last card clears the bottom nav shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}
