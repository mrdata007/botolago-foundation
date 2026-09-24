import standingsSoonArt from "@/assets/illustrations/standings-soon.webp";
import { createFileRoute, notFound, useNavigate } from "@tanstack/react-router";
import {
  isMissingContent,
  isUnavailable,
  UNAVAILABLE,
  unavailableHeaders,
} from "@/lib/page-availability";
import { useQuery } from "@tanstack/react-query";
import { useId, useMemo } from "react";
import { FootballError } from "@/backend/football/errors";
import { ClubFollowButton } from "@/components/clubs/ClubFollowButton";
import { ClubHero } from "@/components/clubs/ClubHero";
import { ClubMatchList } from "@/components/clubs/ClubMatchList";
import { ClubOverview } from "@/components/clubs/ClubOverview";
import { ClubSquad } from "@/components/clubs/ClubSquad";
import {
  CLUB_PANEL_ID,
  CLUB_TAB_ID_BASE,
  CLUB_TAB_KEYS,
  ClubTabs,
  type ClubTabKey,
} from "@/components/clubs/ClubTabs";
import { Section } from "@/components/common/Section";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { ShareButton } from "@/components/fantasy-lists/ShareButton";
import { SeasonPicker } from "@/components/matches/SeasonPicker";
import { StandingsLegend, StandingsTable } from "@/components/matches/StandingsTable";
import { AppShell } from "@/components/shell/AppShell";
import { ui, UiCard, UiHeader, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN, serializeJsonLd } from "@/lib/article-meta";
import { breadcrumbJsonLd } from "@/lib/structured-data";
import { useBackTo } from "@/lib/back-navigation";
import {
  clubSeasonAbsent,
  clubSeasonStats,
  lastSeasonPlayed,
  officialRecord,
} from "@/lib/club-season";
import { NEWS_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";
import { defaultSeason, footballService, type FootballSeason } from "@/services/football";
import { newsArticlesForCategory, newsService } from "@/services/news";
import type { Club } from "@/types/domain";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMPTY_SEASONS: readonly FootballSeason[] = [];

/** How many of the club's stories the overview shows. */
const CLUB_NEWS_COUNT = 3;

interface ClubSearch {
  /** Absent: the overview. */
  tab?: Exclude<ClubTabKey, "overview">;
  /** Absent: the current season. */
  season?: string;
}

const isNotFound = (error: unknown) =>
  error instanceof FootballError && error.code === "team_not_found";

export const Route = createFileRoute("/clubs/$clubId")({
  validateSearch: (search: Record<string, unknown>): ClubSearch => {
    const tab = CLUB_TAB_KEYS.find((key) => key !== "overview" && key === search.tab);
    const season =
      typeof search.season === "string" && UUID.test(search.season) ? search.season : undefined;
    return {
      ...(tab && tab !== "overview" ? { tab } : {}),
      ...(season ? { season } : {}),
    };
  },
  /**
   * The club itself, in French, for the page title and so the server renders
   * the hero rather than a spinner. As on the match page, loader data is
   * serialized to the browser and the query cache is not, so the page seeds
   * its query with it (`initialData`) and both first renders agree.
   *
   * An unknown or malformed club id is a 404 and a failed read a 503 (see
   * `@/lib/page-availability`); both used to answer 200, the first with an
   * indexable "Club introuvable".
   */
  loader: async ({ params, context }) => {
    if (!UUID.test(params.clubId)) throw notFound();
    try {
      const queryKey = ["football", "club", params.clubId, "fr"];
      const club = await context.queryClient.ensureQueryData({
        queryKey,
        queryFn: () => footballService.getClub(params.clubId, "fr"),
      });
      const fetchedAt = context.queryClient.getQueryState(queryKey)?.dataUpdatedAt || Date.now();
      return { club, fetchedAt };
    } catch (error) {
      if (isMissingContent(error)) throw notFound();
      return UNAVAILABLE;
    }
  },
  headers: ({ loaderData }) => unavailableHeaders(loaderData),
  head: ({ params, loaderData }) => {
    const canonical = `${PUBLIC_SITE_ORIGIN}/clubs/${encodeURIComponent(params.clubId)}`;
    const name = isUnavailable(loaderData) ? undefined : loaderData?.club.name.fr;
    const title = name
      ? `${name} — matchs, classement et effectif | BotolaGO`
      : "Club de Botola Pro — BotolaGO";
    const description = name
      ? `${name} en Botola Pro : prochain match, résultats, classement, statistiques et effectif sur BotolaGO.`
      : "Prochain match, résultats, classement, statistiques et effectif d'un club de Botola Pro sur BotolaGO.";
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:url", content: canonical },
        { name: "twitter:card", content: "summary" },
        { name: "twitter:title", content: title },
        { name: "twitter:description", content: description },
      ],
      links: [{ rel: "canonical", href: canonical }],
      // The trail to the club, only when its name loaded.
      ...(name
        ? {
            scripts: [
              {
                type: "application/ld+json",
                children: serializeJsonLd(
                  breadcrumbJsonLd([
                    { name: "Accueil", path: "/" },
                    { name: "Clubs", path: "/clubs" },
                    { name, path: `/clubs/${encodeURIComponent(params.clubId)}` },
                  ]),
                ),
              },
            ],
          }
        : {}),
    };
  },
  component: ClubPage,
});

/**
 * A club page (A-Club): one screen per Botola Pro club.
 *
 * Under the page's own bar (back, "Clubs", share) the club's colour band
 * names it and says where it stands, with the follow control and the season
 * picker on it. Four tabs follow, sticky under the bar: the overview (next
 * match, the club's news, recent results, the season's statistics and the
 * table around it), every match of the season, the whole table with the club
 * marked, and the squad.
 *
 * The tab and the season are in the URL (`?tab=matches&season=…`), so a
 * shared link opens where it was shared from, and the back button leaves the
 * page instead of walking back through its tabs.
 *
 * Every section reads real data and degrades on its own. Before the first
 * round of a season there is no table and nothing played, so the figures say
 * so and offer the season before; the squad is only read when its tab is
 * opened.
 */
function ClubPage() {
  const { clubId } = Route.useParams();
  const search = Route.useSearch();
  const tab: ClubTabKey = search.tab ?? "overview";
  const loaded = Route.useLoaderData();
  const loaderData = isUnavailable(loaded) ? undefined : loaded;
  const navigate = useNavigate({ from: Route.fullPath });
  const { t, tr, lang } = useI18n();
  const goBack = useBackTo("/clubs");
  const headingId = useId();
  const validId = UUID.test(clubId);

  const serverClub = lang === "fr" && loaderData?.club.id === clubId ? loaderData.club : undefined;
  const clubQ = useQuery({
    queryKey: ["football", "club", clubId, lang],
    queryFn: () => footballService.getClub(clubId, lang),
    // Identical on the server and in the browser's first render — see the
    // loader — with its real age, so an old seed is refetched.
    initialData: serverClub,
    initialDataUpdatedAt: serverClub ? loaderData?.fetchedAt : undefined,
    // Switching language keeps the club on screen while its other name loads.
    // Only the same club: opening another club's page from this one (the
    // route stays mounted) must not show, or let anyone follow, the last one.
    placeholderData: (previous) => (previous?.id === clubId ? previous : undefined),
    enabled: validId,
    retry: (count, error) => !isNotFound(error) && count < 2,
  });

  const seasonsQ = useQuery({
    queryKey: ["football", "seasons", lang],
    queryFn: () => footballService.getSeasons(lang),
  });
  const seasons = seasonsQ.data ?? EMPTY_SEASONS;
  const season =
    seasons.find((candidate) => candidate.id === search.season) ?? defaultSeason(seasons);

  const matchesQ = useQuery({
    queryKey: ["football", "club-matches", clubId, season?.id ?? "none", lang],
    queryFn: () => footballService.getClubSeasonMatches(clubId, season ?? null, lang),
    enabled: validId && seasonsQ.isSuccess,
  });
  // The season's table, worked out from its results: the Classement tab's
  // query, so the two pages share one cache entry.
  const standingsQ = useQuery({
    queryKey: ["football", "standings", season?.id, lang],
    queryFn: () => footballService.getStandings(season!, lang),
    enabled: season !== undefined,
  });
  // The current squad is the club's active memberships; a past season's is
  // the squad stored for it.
  const squadSeason = season && !season.isCurrent ? season.id : null;
  const squadQ = useQuery({
    queryKey: ["football", "club-squad", clubId, squadSeason ?? "current", lang],
    queryFn: () => footballService.getClubSquad(clubId, squadSeason, lang),
    enabled: validId && seasonsQ.isSuccess && tab === "squad",
  });
  // The club's latest stories. A News surface, so it is gated on the same
  // flag as every other: with the flag off this query never runs.
  const newsQ = useQuery({
    queryKey: ["news", "club", clubId, lang],
    queryFn: async () =>
      newsArticlesForCategory(
        await newsService.getArticles(lang, { teamId: clubId }),
        "latest",
      ).slice(0, CLUB_NEWS_COUNT),
    enabled: NEWS_ENABLED && validId,
  });

  const club = clubQ.data;
  const clubs = useMemo(() => {
    const byId = new Map<string, Club>();
    for (const item of [...(matchesQ.data?.clubs ?? []), ...(standingsQ.data?.clubs ?? [])]) {
      byId.set(item.id, item);
    }
    if (club) byId.set(club.id, club);
    return byId;
  }, [club, matchesQ.data?.clubs, standingsQ.data?.clubs]);
  const clubById = (id: string) => clubs.get(id);

  const matches = matchesQ.data?.matches;
  const standings = standingsQ.data?.overall ?? [];
  const row = standings.find((line) => line.clubId === clubId);
  const stats = useMemo(() => clubSeasonStats(matches ?? [], clubId), [matches, clubId]);
  const record = officialRecord(row, stats.overall);
  // A season with nothing played: over, with no fixture for the club, it is
  // one the club was not in. Either way, "see last season" offers the latest
  // season the club has a result in, read only when it is needed.
  const seasonAbsent = clubSeasonAbsent(season, matches);
  const nothingPlayed = matchesQ.isSuccess && record.played === 0;
  const playedQ = useQuery({
    queryKey: ["football", "club-seasons-played", clubId, lang],
    queryFn: () => footballService.getClubSeasonsPlayed(clubId, lang),
    enabled: validId && nothingPlayed && tab === "overview",
  });
  const before = playedQ.data ? lastSeasonPlayed(seasons, season?.id, playedQ.data) : undefined;

  // Seasons failing leaves nothing to read the matches for: say so on the
  // matches, and retry the seasons.
  const matchesSection = {
    data: matches,
    isPending: seasonsQ.isPending || (seasonsQ.isSuccess && matchesQ.isPending),
    isError: seasonsQ.isError || matchesQ.isError,
    refetch: () => (seasonsQ.isError ? seasonsQ.refetch() : matchesQ.refetch()),
  };

  const bar = (
    <UiHeader
      sticky
      kicker={t("clubs.title")}
      onBack={goBack}
      trailing={club ? <ShareButton title={tr(club.name)} /> : undefined}
      // One step under the header's default, so the bar is exactly the
      // global bar's height and the tabs stick at `--topbar-h`.
      className="pb-2"
    />
  );

  if (!validId || (clubQ.isError && isNotFound(clubQ.error))) {
    return (
      <AppShell backgroundVariant="matches" topBar={bar}>
        <UiCard padding="lg" className="mt-8 text-center">
          <h1 className={cn(ui.display.section, ui.tone.default)}>{t("club.not_found_title")}</h1>
          <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("club.not_found_desc")}</p>
          <UiLinkButton to="/clubs" variant="ink" className="mt-4">
            {t("club.all_clubs")}
          </UiLinkButton>
        </UiCard>
      </AppShell>
    );
  }

  if (!club) {
    return (
      <AppShell backgroundVariant="matches" topBar={bar}>
        {clubQ.isError ? (
          <div className="mt-8">
            <ErrorState onRetry={() => void clubQ.refetch()} />
          </div>
        ) : (
          <LoadingState />
        )}
      </AppShell>
    );
  }

  const competition = t("matches.competition.botola");
  const seasonLine = season ? `${competition} · ${season.label}` : competition;

  const selectSeason = (seasonId: string) => {
    const chosen = seasons.find((candidate) => candidate.id === seasonId);
    if (!chosen) return;
    void navigate({
      search: (previous) => ({ ...previous, season: chosen.isCurrent ? undefined : chosen.id }),
      replace: true,
    });
  };

  return (
    <AppShell backgroundVariant="matches" topBar={bar}>
      <ClubHero
        club={club}
        headingId={headingId}
        kicker={seasonLine}
        row={row}
        actions={
          <>
            <ClubFollowButton club={club} />
            <SeasonPicker
              seasons={seasons}
              selected={season}
              loading={seasonsQ.isPending}
              onChange={selectSeason}
              // The surface fill with its shadow: a control ON the club
              // colour, not a sunken hole in it.
              className={cn(ui.surface.bar, ui.shadow.card)}
            />
          </>
        }
      />

      <ClubTabs
        club={club}
        flush={!row}
        active={tab}
        onChange={(key) =>
          void navigate({
            search: (previous) => ({ ...previous, tab: key === "overview" ? undefined : key }),
            replace: true,
          })
        }
      />

      {/* Keyed on the tab, so each switch replays a quick fade, as the match
          page's panel does. */}
      <div
        key={tab}
        id={CLUB_PANEL_ID}
        role="tabpanel"
        aria-labelledby={`${CLUB_TAB_ID_BASE}-tab-${tab}`}
        className="animate-in fade-in-0 slide-in-from-bottom-1 duration-[var(--duration-quick)] ease-[var(--ease-standard)]"
      >
        {tab === "overview" && (
          <ClubOverview
            club={club}
            matches={matchesSection}
            news={newsQ}
            clubs={[...clubs.values()]}
            clubById={clubById}
            standings={standings}
            stats={stats}
            record={record}
            seasonLabel={season?.label}
            seasonAbsent={seasonAbsent}
            previousSeason={
              before ? { label: before.label, onSelect: () => selectSeason(before.id) } : undefined
            }
            standingsLink={{
              to: "/clubs/$clubId",
              params: { clubId },
              search: { ...search, tab: "standings" },
            }}
          />
        )}

        {tab === "matches" && (
          <ClubMatchList clubId={clubId} matches={matchesSection} clubById={clubById} />
        )}

        {tab === "standings" && (
          <Section>
            <SectionHeader title={t("matches.table_preview")} eyebrow={seasonLine} />
            {seasonsQ.isError || standingsQ.isError ? (
              <ErrorState
                onRetry={() => void (seasonsQ.isError ? seasonsQ.refetch() : standingsQ.refetch())}
              />
            ) : seasonsQ.isPending || (season !== undefined && standingsQ.isPending) ? (
              <LoadingState />
            ) : standings.length === 0 ? (
              <EmptyState compact illustration={standingsSoonArt}>
                {t("matches.table.empty")}
              </EmptyState>
            ) : (
              <div className="grid min-w-0 gap-3">
                <StandingsTable
                  rows={standings}
                  clubById={clubById}
                  view="overall"
                  caption={`${t("matches.table_preview")} · ${seasonLine}`}
                  currentClubId={clubId}
                />
                <StandingsLegend />
              </div>
            )}
          </Section>
        )}

        {tab === "squad" && (
          <ClubSquad
            club={club}
            squad={{
              data: squadQ.data,
              isPending: seasonsQ.isPending || squadQ.isPending,
              isError: seasonsQ.isError || squadQ.isError,
              refetch: () => (seasonsQ.isError ? seasonsQ.refetch() : squadQ.refetch()),
            }}
          />
        )}
      </div>

      {/* Clears the bottom navigation's shadow. */}
      <div className="h-6" aria-hidden />
    </AppShell>
  );
}
