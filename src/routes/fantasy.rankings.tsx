import rankingEmptyArt from "@/assets/illustrations/ranking-empty.webp";
import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Trophy } from "lucide-react";

import { ClubCrest } from "@/components/common/ClubCrest";
import { MyRankCard } from "@/components/fantasy/MyRankCard";
import { selectTeamPresence } from "@/components/fantasy/my-rank-state";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { RankingsPodium } from "@/components/fantasy/RankingsPodium";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiErrorState,
  UiHeader,
  UiInput,
  UiSegmented,
  UiStatePanel,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useAuth } from "@/auth/AuthProvider";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useFantasyDataSource } from "@/services/fantasy-data-source";
import { pageForRank, type RankingsSort } from "@/services/fantasy-rankings";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { useOwnedTeam } from "@/services/use-owned-team";
import type { Club } from "@/types/domain";
import type { LeagueStanding } from "@/types/fantasy";

const PAGE_SIZE = 25;

export const Route = createFileRoute("/fantasy/rankings")({
  head: () => ({
    meta: [
      { title: "Classement général Fantasy — BotolaGO" },
      {
        name: "description",
        content:
          "Suivez le classement général des managers Fantasy Botola Pro : points de la saison, points de la journée et progression.",
      },
      { property: "og:title", content: "Classement général Fantasy — BotolaGO" },
      {
        property: "og:description",
        content: "Le classement de tous les managers Fantasy Botola Pro, saison et journée.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: RankingsFramed,
});

/**
 * Rankings, on the kit.
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
    <FantasyFrame>
      <UiHeader title={t("fpl.rankings")} tone="gradient" backTo="/fantasy" />
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

  const [sort, setSort] = useState<RankingsSort>("overall");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const summaryQ = useQuery({
    queryKey: key("summary"),
    queryFn: () => fantasyService.getSummary(),
    enabled: source !== "guest",
  });
  const clubsQ = useQuery({
    queryKey: ["clubs", lang],
    queryFn: () => footballService.getClubs(lang),
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
  const clubs = clubsQ.data;

  const jumpToMe = () => {
    if (!data?.myRank) return;
    setSearch("");
    setPage(pageForRank(data.myRank.rank, PAGE_SIZE));
    requestAnimationFrame(() =>
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  return (
    <div className={cn("space-y-4 px-4 pb-8 pt-3", ui.surface.page)}>
      {rankingsQ.isError ? (
        <UiErrorState onRetry={() => void rankingsQ.refetch()} />
      ) : !data ? (
        <UiStatePanel kind="loading" />
      ) : (
        <>
          {data.podium.length === 3 ? (
            <RankingsPodium podium={data.podium} clubs={clubs} meId={data.myRank?.managerId} />
          ) : null}

          <MyRankCard
            standing={data.myRank}
            presence={presence}
            onJump={data.myRank ? jumpToMe : undefined}
          />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <UiSegmented
              value={sort}
              onChange={setSort}
              label={t("fantasy.rankings.title")}
              className="sm:min-w-56"
              options={[
                { value: "overall", label: t("fantasy.rankings.sort_overall") },
                { value: "gameweek", label: t("fantasy.rankings.sort_gameweek") },
              ]}
            />
            <UiInput
              type="search"
              className="flex-1 sm:max-w-xs"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder={t("fantasy.rankings.search")}
              aria-label={t("fantasy.rankings.search")}
            />
          </div>

          <div ref={tableRef}>
            {data.rows.length === 0 ? (
              // "No manager matches your search" is only true if one was typed.
              // With no public league ranked yet it was shown to every visitor,
              // beside an empty search box, blaming them for a query they
              // never made.
              // Never the generic "Aucun contenu disponible.": before the
              // first gameweek is scored this is the expected state of the
              // whole board, and it has to say so. A typed search gets the
              // other sentence, because only then is the reader's query the
              // reason the list is empty.
              <UiEmptyState
                illustration={search.trim() ? undefined : rankingEmptyArt}
                title={
                  search.trim() ? t("fantasy.players.no_match") : t("fantasy.rankings.no_rank_yet")
                }
                body={search.trim() ? t("fantasy.rankings.empty") : t("fantasy.rankings.empty_yet")}
              />
            ) : (
              <UiCard padding="none" className="overflow-hidden">
                {/* `table-fixed`, so the columns are sized by their headers
                    rather than by the longest manager name in the board.
                    Without it the name column takes whatever it wants, the
                    `truncate` on the cell never engages, and the table grows
                    past a 390px viewport (measured: 421px) — which means the
                    total column, the one people came for, sits off-screen
                    behind a sideways scroll. */}
                <UiTable caption={t("fantasy.rankings.title")} tableClassName="table-fixed">
                  <UiTHead>
                    <UiTR>
                      <UiTH numeric className="w-10">
                        #
                      </UiTH>
                      <UiTH>{t("fantasy.rankings.manager")}</UiTH>
                      {/* Both figures are always shown; the sort changes the
                          ORDER, not which column is which. Labelling the total
                          column "Points de la journée" under the gameweek sort
                          named it after the wrong number. */}
                      <UiTH numeric className="w-11" title={t("fantasy.gw_points")}>
                        {t("fantasy.leagues.gw")}
                      </UiTH>
                      <UiTH numeric className="w-14" title={t("fantasy.total_points")}>
                        {t("fantasy.leagues.total")}
                      </UiTH>
                      <UiTH numeric className="w-12">
                        <span className="sr-only">{t("fantasy.leagues.movement")}</span>
                      </UiTH>
                    </UiTR>
                  </UiTHead>
                  <UiTBody>
                    {data.rows.map((row) => (
                      <RankingRow
                        key={row.managerId}
                        row={row}
                        clubs={clubs}
                        isMe={row.managerId === data.myRank?.managerId}
                        nf={nf}
                      />
                    ))}
                  </UiTBody>
                </UiTable>
              </UiCard>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className={cn("min-w-0", ui.text.meta, ui.tone.muted)}>
              {nf.format(data.total)} {t("fantasy.rankings.count")}
            </p>
            <div className="flex shrink-0 items-center gap-2">
              <PagerButton
                label={t("fantasy.rankings.prev")}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4" aria-hidden />
              </PagerButton>
              <span className={cn(ui.stat.sm, ui.tone.default)}>
                {t("fantasy.rankings.page")} {nf.format(page)} / {nf.format(pageCount)}
              </span>
              <PagerButton
                label={t("fantasy.rankings.next")}
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight className="h-4 w-4" aria-hidden />
              </PagerButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function PagerButton({
  label,
  disabled,
  onClick,
  children,
}: {
  label: string;
  disabled: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "grid place-items-center transition-colors disabled:opacity-40",
        ui.space.tap,
        ui.radius.control,
        ui.rule.all,
        ui.tone.default,
        ui.focus,
      )}
    >
      {children}
    </button>
  );
}

function crestFor(row: LeagueStanding, clubs?: Club[]): Club | undefined {
  if (!clubs || clubs.length === 0) return undefined;
  if (row.clubId) return clubs.find((club) => club.id === row.clubId);
  let h = 0;
  for (const ch of row.managerId) h = (h * 31 + ch.charCodeAt(0)) % 100000;
  return clubs[h % clubs.length];
}

function RankingRow({
  row,
  clubs,
  isMe,
  nf,
}: {
  row: LeagueStanding;
  clubs?: Club[];
  isMe: boolean;
  nf: Intl.NumberFormat;
}) {
  const club = crestFor(row, clubs);
  return (
    <UiTR highlighted={isMe}>
      <UiTD numeric strong>
        <span className="inline-flex items-center gap-1">
          {row.rank <= 3 ? (
            <Trophy
              className={cn("h-3.5 w-3.5 shrink-0", row.rank === 1 ? ui.tone.ink : ui.tone.muted)}
              aria-hidden
            />
          ) : null}
          {nf.format(row.rank)}
        </span>
      </UiTD>
      <UiTD>
        <span className="flex items-center gap-2">
          {club ? (
            <ClubCrest club={club} size="sm" />
          ) : (
            <span
              className={cn(
                "grid h-7 w-7 shrink-0 place-items-center",
                ui.radius.control,
                ui.surface.sunken,
                ui.text.micro,
                "[font-weight:var(--ui-weight-hero)]",
              )}
              aria-hidden
            >
              {row.teamName.slice(0, 2).toUpperCase()}
            </span>
          )}
          <span className="min-w-0">
            <span
              dir="auto"
              // Two lines, then an ellipsis: at 360px the column leaves 88px,
              // which `truncate` cut every team name in the board down to.
              className={cn(
                "line-clamp-2 break-words",
                ui.text.secondary,
                "[font-weight:var(--ui-weight-heavy)]",
              )}
            >
              {row.teamName}
            </span>
            {row.managerName && row.managerName !== row.teamName ? (
              <span dir="auto" className={cn("block truncate", ui.text.micro, ui.tone.muted)}>
                {row.managerName}
              </span>
            ) : null}
          </span>
        </span>
      </UiTD>
      <UiTD numeric className={ui.tone.muted}>
        {nf.format(row.gameweekScore)}
      </UiTD>
      <UiTD numeric strong>
        {nf.format(row.totalScore)}
      </UiTD>
      <UiTD numeric>
        <RankChangeIndicator rank={row.rank} previousRank={row.previousRank} />
      </UiTD>
    </UiTR>
  );
}
