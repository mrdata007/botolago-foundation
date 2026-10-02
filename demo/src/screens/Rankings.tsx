/**
 * `/fantasy/rankings`, as src/routes/fantasy.rankings.tsx composes it: the
 * Général / Journée / Mes ligues tabs, the "your position" card, search, the
 * standings table with its quiet ▲/▼ column and the pager. The board is the
 * sample managers of data/board.ts with the demo manager merged in by score.
 * The addition is the "Classement présenté par" card at the top.
 */
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
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import {
  ui,
  UiCard,
  UiEmptyState,
  UiHeader,
  UiRankMovement,
  UiStatePanel,
  UiTable,
  UiTabs,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { matchesQuery, pageForRank } from "@/services/fantasy-rankings";
import type { LeagueStanding } from "@/types/fantasy";

import { SponsorBanner } from "../components/Sponsor";
import { useDemoCopy } from "../copy";
import { gameweekBoard, overallBoard } from "../data/board";
import { useMyEntry, useEnsurePlayed } from "./shared";

const PAGE_SIZE = 25;
type RankingsTab = "overall" | "gameweek" | "leagues";

export function RankingsScreen() {
  const { t } = useI18n();
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("fantasy.tab.rankings")} backTo="/fantasy" />
      <RankingsBody />
    </FantasyFrame>
  );
}

function RankingsBody() {
  const { t, lang } = useI18n();
  const copy = useDemoCopy();
  const ready = useEnsurePlayed();
  const me = useMyEntry();
  const nf = useMemo(() => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR"), [lang]);
  const compactNf = useMemo(() => compactMoveFormat(lang === "ar" ? "ar-MA" : "fr-FR"), [lang]);
  const move = (places: number) => formatMove(places, nf, compactNf);

  const [tab, setTab] = useState<RankingsTab>("gameweek");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const board = useMemo(() => {
    if (!me) return [];
    return tab === "gameweek" ? gameweekBoard(true, me) : overallBoard(true, me);
  }, [tab, me]);
  const filtered = useMemo(
    () => (search.trim() ? board.filter((row) => matchesQuery(row, search)) : board),
    [board, search],
  );
  const myRank = board.find((row) => row.managerId === "me");
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const rows = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);
  const rankStep = rankFigure(Math.max(1, ...rows.map((row) => row.rank)));

  useEffect(() => setPage(1), [tab, search]);

  const jumpToMe = () => {
    if (!myRank) return;
    setSearch("");
    setPage(pageForRank(myRank.rank, PAGE_SIZE));
    requestAnimationFrame(() =>
      tableRef.current?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  };

  const movementLabels = {
    up: t("fantasy.rank.up"),
    down: t("fantasy.rank.down"),
    same: t("fantasy.rank.same"),
  };

  const leagues: LeagueListRow[] = [
    {
      key: "colleagues",
      name: lang === "ar" ? "دوري الزملاء" : "Ligue des collègues",
      to: "/fantasy/leagues/colleagues",
      rank: 2,
      members: 12,
    },
    {
      key: "overall",
      name: t("fantasy.rankings.sort_overall"),
      to: "/fantasy/rankings",
      rank: overallBoard(true, me ?? undefined).find((row) => row.managerId === "me")?.rank ?? null,
      members: board.length,
    },
  ];

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
        {!ready || !me ? (
          <UiStatePanel kind="loading" />
        ) : (
          <>
            <SponsorBanner title={copy("rankingPresentedBy")} />
            <MyRankCard
              standing={myRank}
              presence={{ status: "present", teamName: me.teamName }}
              onJump={tab !== "leagues" && myRank ? jumpToMe : undefined}
            />

            {tab !== "leagues" ? (
              <>
                <SearchField
                  value={search}
                  onChange={setSearch}
                  label={t("fantasy.rankings.search")}
                />
                <div ref={tableRef} className="scroll-mt-4">
                  {rows.length === 0 ? (
                    <UiEmptyState
                      title={t("fantasy.players.no_match")}
                      body={t("fantasy.rankings.empty")}
                    />
                  ) : (
                    <UiCard padding="none" className="overflow-hidden">
                      <UiTable caption={t("fantasy.rankings.title")}>
                        <UiTHead className="bg-transparent">
                          <UiTR>
                            <UiTH className={cn("ps-4", STANDINGS_FIGURE_CELL)}>#</UiTH>
                            <UiTH className={STANDINGS_NAME_CELL}>
                              {t("fantasy.rankings.manager")}
                            </UiTH>
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
                          {rows.map((row, index) => (
                            <RankingRow
                              key={row.managerId}
                              row={row}
                              isMe={row.managerId === "me"}
                              isLast={index === rows.length - 1}
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
                  summary={`${nf.format(filtered.length)} ${t("fantasy.rankings.count")}`}
                  onPrevious={() => setPage((current) => Math.max(1, current - 1))}
                  onNext={() => setPage((current) => Math.min(pageCount, current + 1))}
                />
              </>
            ) : (
              <LeagueList rows={leagues} label={t("fantasy.rankings.tab_leagues")} />
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
  rankStep: string;
  formatMove: (places: number) => string;
  movementLabels: { up: string; down: string; same: string };
}) {
  const podium = row.rank <= 3;
  return (
    <UiTR highlighted={isMe} className={cn(isLast && "border-b-0")}>
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
