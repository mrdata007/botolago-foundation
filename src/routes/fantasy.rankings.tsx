import emptyLeaguesArt from "@/assets/illustrations/empty-leagues.webp";
import rankingEmptyArt from "@/assets/illustrations/ranking-empty.webp";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { LogIn, UserPlus } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";

import { LeagueList, type LeagueListRow } from "@/components/fantasy-lists/LeagueList";
import { ListPager } from "@/components/fantasy-lists/ListPager";
import { SearchField } from "@/components/fantasy-lists/SearchField";
import {
  compactMoveFormat,
  formatMove,
  rankFigure,
  STANDINGS_FIGURE_CELL,
  STANDINGS_NAME_CELL,
} from "@/components/fantasy-lists/standings";
import { MyRankCard } from "@/components/fantasy/MyRankCard";
import { selectTeamPresence } from "@/components/fantasy/my-rank-state";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiLinkButton,
  UiRankMovement,
  UiSkeleton,
  UiStatePanel,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { pageForRank, type RankingsSort } from "@/services/fantasy-rankings";
import { fantasyService } from "@/services/fantasy-runtime";
import { useOwnedTeam } from "@/services/use-owned-team";
import type { LeagueStanding } from "@/types/fantasy";

const PAGE_SIZE = 25;

export const Route = createFileRoute("/fantasy/rankings")({
  head: () => fantasyHead("rankings"),
  component: RankingsFramed,
});

type RankingsTab = RankingsSort | "leagues";

/**
 * Rankings (A-Rankings, the approved minimal layout): the "your position"
 * line with its gradient edge, one standings table with a quiet ▲/▼ movement
 * column, and underline tabs — Général, Journée, Mes ligues. No podium: the
 * owner's final board dropped it, and with it the per-manager crest that was a
 * hash of the manager id — once colour means a club, a hashed crest paints a
 * manager in a club they never chose.
 *
 * The one behaviour this screen must never lose: before any gameweek has
 * scored there are no ranking rows, and that is an EMPTY STATE — not a
 * spinner and not an error. The board legitimately returns an empty page
 * (contract: `items: []`, `total: 0`, `myRank: null`, HTTP 200, anonymous
 * callers included), so the branch below distinguishes three things that used
 * to be collapsed: a failed fetch (error), a fetch still in flight (loading),
 * and a successful fetch with nothing in it (empty). The empty copy also still
 * distinguishes "nothing matches your search" from "nobody is ranked yet" —
 * blaming a visitor for a query they never typed was the original defect.
 */
function RankingsFramed() {
  const { t } = useI18n();
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("fantasy.tab.rankings")} backTo="/fantasy" />
      <RankingsPage />
    </FantasyFrame>
  );
}

function RankingsPage() {
  const { t, lang } = useI18n();
  const { user } = useAuth();
  const { source, key } = useFantasyDataSource();
  const owned = useOwnedTeam();
  const nf = useMemo(() => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR"), [lang]);
  // On the overall board a manager can climb thousands of places in a week;
  // the table writes such a move compactly ("▲ 12 k"), the "your position"
  // line above has the room and prints it in full.
  const compactNf = useMemo(() => compactMoveFormat(lang === "ar" ? "ar-MA" : "fr-FR"), [lang]);
  const move = (places: number) => formatMove(places, nf, compactNf);

  const [tab, setTab] = useState<RankingsTab>("overall");
  // "Mes ligues" reads the overall board: the position line above the
  // leagues is the manager's season rank, not whichever order the last tab
  // happened to sort by, since its kicker does not say which.
  const sort: RankingsSort = tab === "gameweek" ? "gameweek" : "overall";
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: source !== "guest",
  });

  const summary = source === "guest" ? null : (summaryQ.data ?? null);
  const me: LeagueStanding | undefined = summary
    ? {
        managerId: "me",
        managerName: user?.displayName?.trim() || summary.managerName,
        teamName: summary.teamName,
        rank: summary.overallRank ?? 0,
        previousRank: summary.overallRank ?? 0,
        gameweekScore: summary.gameweekPoints,
        totalScore: summary.totalPoints,
      }
    : undefined;

  // Team ownership is read from the owned snapshot, never inferred from the
  // standing: before the first gameweek is scored nobody has a standing, and
  // that must not be reported as "you have no team".
  const presence = selectTeamPresence({
    source: owned.source,
    squadSize: owned.team?.squad.length ?? 0,
    teamName: owned.team?.teamName ?? summary?.teamName ?? null,
    isLoading: owned.isLoading,
    errored: !!owned.error,
  });

  const rankingsQ = useQuery({
    queryKey: key("rankings", sort, page, search, me?.totalScore ?? null),
    queryFn: () =>
      fantasyService.getGlobalRankings({
        page,
        pageSize: PAGE_SIZE,
        sort,
        query: search,
        me,
      }),
    placeholderData: keepPreviousData,
  });

  // Keep the page in range whenever the filter or sort shrinks the board.
  useEffect(() => {
    setPage(1);
  }, [sort, search]);

  const data = rankingsQ.data;
  const pageCount = data ? Math.max(1, Math.ceil(data.total / PAGE_SIZE)) : 1;
  const onBoard = tab !== "leagues";
  const rankStep = rankFigure(Math.max(1, ...(data?.rows ?? []).map((row) => row.rank)));

  const jumpToMe = () => {
    if (!data?.myRank) return;
    setSearch("");
    setPage(pageForRank(data.myRank.rank, PAGE_SIZE));
    requestAnimationFrame(() =>
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const movementLabels = {
    up: t("fantasy.rank.up"),
    down: t("fantasy.rank.down"),
    same: t("fantasy.rank.same"),
  };

  return (
    <>
      <UiTabs
        value={tab}
        onChange={setTab}
        label={t("fantasy.rankings.title")}
        idBase="rankings"
        className="px-2"
        options={[
          {
            value: "overall",
            label: t("fantasy.rankings.sort_overall"),
            panelId: "rankings-panel-overall",
          },
          {
            value: "gameweek",
            label: t("fantasy.rankings.sort_gameweek"),
            panelId: "rankings-panel-gameweek",
          },
          {
            value: "leagues",
            label: t("fantasy.rankings.tab_leagues"),
            panelId: "rankings-panel-leagues",
          },
        ]}
      />

      <section
        role="tabpanel"
        id={`rankings-panel-${tab}`}
        aria-labelledby={`rankings-tab-${tab}`}
        className={cn("space-y-5 px-4 pb-8 pt-6", ui.surface.page)}
      >
        {rankingsQ.isError ? (
          <UiErrorState onRetry={() => void rankingsQ.refetch()} />
        ) : !data ? (
          <UiStatePanel kind="loading" />
        ) : (
          <>
            <MyRankCard
              standing={data.myRank}
              presence={presence}
              onJump={onBoard && data.myRank ? jumpToMe : undefined}
            />

            {onBoard ? (
              <>
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label={t("fantasy.rankings.search")}
                />

                <div ref={tableRef} className="scroll-mt-4">
                  {data.rows.length === 0 ? (
                    // "No manager matches your search" is only true if one was
                    // typed. Never the generic "Aucun contenu disponible.":
                    // before the first gameweek is scored this is the expected
                    // state of the whole board, and it has to say so.
                    <UiEmptyState
                      illustration={search.trim() ? undefined : rankingEmptyArt}
                      title={
                        search.trim()
                          ? t("fantasy.players.no_match")
                          : t("fantasy.rankings.no_rank_yet")
                      }
                      body={
                        search.trim()
                          ? t("fantasy.rankings.empty")
                          : t("fantasy.rankings.empty_yet")
                      }
                    />
                  ) : (
                    <UiCard padding="none" className="overflow-hidden">
                      {/* The figure columns size to their content and the name
                          column takes the rest without being able to widen the
                          table (see `standings.ts`): a long manager name once
                          grew this table past a 390px viewport (421px), with
                          the total — the column people came for — off-screen. */}
                      <UiTable caption={t("fantasy.rankings.title")}>
                        <UiTHead className="bg-transparent">
                          <UiTR>
                            <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>#</UiTH>
                            <UiTH className={STANDINGS_NAME_CELL}>
                              {t("fantasy.rankings.manager")}
                            </UiTH>
                            {/* Both figures are always shown; the tab changes
                                the ORDER, not which column is which. */}
                            <UiTH
                              numeric
                              className={STANDINGS_FIGURE_CELL}
                              title={t("fantasy.gw_points")}
                            >
                              {t("fantasy.leagues.gw")}
                            </UiTH>
                            <UiTH
                              numeric
                              className={STANDINGS_FIGURE_CELL}
                              title={t("fantasy.total_points")}
                            >
                              {t("fantasy.leagues.total")}
                            </UiTH>
                            <UiTH numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
                              <span aria-hidden>+/−</span>
                              <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                            </UiTH>
                          </UiTR>
                        </UiTHead>
                        <UiTBody>
                          {data.rows.map((row, index) => (
                            <RankingRow
                              key={row.managerId}
                              row={row}
                              isMe={row.managerId === data.myRank?.managerId}
                              isLast={index === data.rows.length - 1}
                              nf={nf}
                              rankStep={rankStep}
                              formatMove={move}
                              movementLabels={movementLabels}
                            />
                          ))}
                        </UiTBody>
                      </UiTable>
                    </UiCard>
                  )}
                </div>

                <ListPager
                  page={page}
                  pageCount={pageCount}
                  summary={`${nf.format(data.total)} ${t("fantasy.rankings.count")}`}
                  onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
                />
              </>
            ) : (
              <MyLeagues />
            )}
          </>
        )}
      </section>
    </>
  );
}

function RankingRow({
  row,
  isMe,
  isLast,
  nf,
  rankStep,
  formatMove,
  movementLabels,
}: {
  row: LeagueStanding;
  isMe: boolean;
  isLast: boolean;
  nf: Intl.NumberFormat;
  /** The rank's stat step, chosen for the widest rank on the page (`rankFigure`). */
  rankStep: string;
  formatMove: (places: number) => string;
  movementLabels: { up: string; down: string; same: string };
}) {
  const podium = row.rank <= 3;
  return (
    <UiTR highlighted={isMe} className={cn(isLast && "border-b-0")}>
      {/* A column of figures: the tabular stat ramp, never the display face.
          The top three read in full strength, the rest muted, as the board
          sets them. */}
      <UiTD
        className={cn(
          "ps-4",
          STANDINGS_FIGURE_CELL,
          rankStep,
          podium ? ui.tone.default : ui.tone.muted,
        )}
      >
        <bdi>{nf.format(row.rank)}</bdi>
      </UiTD>
      <UiTD className={cn("py-2.5", STANDINGS_NAME_CELL)}>
        <span
          dir="auto"
          // Two lines, then an ellipsis: on a narrow phone the column is
          // ~120px, which a one-line `truncate` cut every long name down to.
          className={cn(
            "line-clamp-2 break-words",
            ui.text.secondary,
            "[font-weight:var(--ui-weight-strong)]",
            ui.tone.default,
          )}
        >
          {row.teamName}
        </span>
        {row.managerName && row.managerName !== row.teamName ? (
          <span dir="auto" className={cn("block truncate", ui.text.meta, ui.tone.muted)}>
            {row.managerName}
          </span>
        ) : null}
      </UiTD>
      <UiTD numeric className={cn(STANDINGS_FIGURE_CELL, ui.tone.muted)}>
        {nf.format(row.gameweekScore)}
      </UiTD>
      <UiTD numeric strong className={cn(STANDINGS_FIGURE_CELL, ui.stat.md, ui.tone.default)}>
        {nf.format(row.totalScore)}
      </UiTD>
      <UiTD numeric className={cn("pe-4", STANDINGS_FIGURE_CELL)}>
        <UiRankMovement
          variant="quiet"
          rank={row.rank}
          previousRank={row.previousRank}
          labels={movementLabels}
          formatDelta={formatMove}
        />
      </UiTD>
    </UiTR>
  );
}

/**
 * "Mes ligues": the manager's own leagues, as the hub lists them — private
 * leagues, and the public ones they are ranked in — each linking to its
 * standings. Same queries and cache keys as /fantasy/leagues, so switching
 * between the two never refetches. A signed-out visitor has no leagues to
 * show, so they get the sign-in invitation every Fantasy screen uses.
 */
function MyLeagues() {
  const { t } = useI18n();
  const { source, key } = useFantasyDataSource();
  const guest = source === "guest";

  const privateQ = useQuery({
    queryKey: key("leagues", "private"),
    queryFn: () => fantasyService.getLeagues("private"),
    enabled: !guest,
  });
  const publicQ = useQuery({
    queryKey: key("leagues", "public"),
    queryFn: () => fantasyService.getLeagues("public"),
    enabled: !guest,
  });

  if (guest) {
    return (
      <UiCard padding="lg" className="text-center">
        <h2 className={cn(ui.display.section, ui.tone.default)}>{t("auth.prompt.title")}</h2>
        <p className={cn("mt-1", ui.text.secondary, ui.tone.muted)}>{t("auth.prompt.body")}</p>
        <div className="mt-4 grid gap-2">
          <UiLinkButton to="/auth/login" search={{ next: "/fantasy/rankings" }}>
            <LogIn className="h-4 w-4" aria-hidden />
            {t("auth.prompt.login")}
          </UiLinkButton>
          <UiLinkButton to="/auth/register" search={{ next: "/fantasy/rankings" }} variant="ink">
            <UserPlus className="h-4 w-4" aria-hidden />
            {t("auth.prompt.register")}
          </UiLinkButton>
        </div>
      </UiCard>
    );
  }

  if (privateQ.isError || publicQ.isError) {
    return (
      <UiErrorState
        onRetry={() => {
          void privateQ.refetch();
          void publicQ.refetch();
        }}
      />
    );
  }

  if (privateQ.isPending || publicQ.isPending) {
    return (
      <div role="status" aria-label={t("state.loading")} className="space-y-2">
        <UiSkeleton className="h-12" />
        <UiSkeleton className="h-12" />
      </div>
    );
  }

  const rows: LeagueListRow[] = [
    ...(privateQ.data ?? []),
    ...(publicQ.data ?? []).filter((league) => league.rank !== null),
  ].map((league) => ({
    key: league.id,
    name: league.name,
    to: `/fantasy/leagues/${league.id}`,
    rank: league.rank,
    members: league.members,
  }));

  return (
    <div className="space-y-4">
      {rows.length === 0 ? (
        <UiEmptyState
          illustration={emptyLeaguesArt}
          title={t("fantasy.leagues.empty_title")}
          body={t("fpl.no_leagues")}
        />
      ) : (
        <LeagueList rows={rows} label={t("fantasy.rankings.tab_leagues")} />
      )}
      <UiLinkButton to="/fantasy/leagues" variant="soft">
        {t("fpl.leagues_cups")}
      </UiLinkButton>
    </div>
  );
}
