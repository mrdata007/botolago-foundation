import { createFileRoute } from "@tanstack/react-router";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Search, Trophy } from "lucide-react";
import { fantasyService } from "@/services/fantasy-runtime";
import { footballService } from "@/services/football";
import { pageForRank, type RankingsSort } from "@/services/fantasy-rankings";
import { RankingsPodium } from "@/components/fantasy/RankingsPodium";
import { MyRankCard } from "@/components/fantasy/MyRankCard";
import { RankChangeIndicator } from "@/components/fantasy/RankChangeIndicator";
import { ClubCrest } from "@/components/common/ClubCrest";
import { SectionHeader } from "@/components/common/SectionHeader";
import { EmptyState, ErrorState, LoadingState } from "@/components/common/States";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import type { LeagueStanding } from "@/types/fantasy";
import type { Club } from "@/types/domain";

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
  component: RankingsPage,
});

function RankingsPage() {
  const { t, lang } = useI18n();
  const nf = useMemo(
    () => new Intl.NumberFormat(lang === "ar" ? "ar-MA" : "fr-FR"),
    [lang],
  );

  const [sort, setSort] = useState<RankingsSort>("overall");
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState("");
  const tableRef = useRef<HTMLDivElement>(null);

  const summaryQ = useQuery({
    queryKey: ["fantasy-summary"],
    queryFn: () => fantasyService.getSummary(),
  });
  const clubsQ = useQuery({ queryKey: ["clubs", lang], queryFn: () => footballService.getClubs(lang) });

  const summary = summaryQ.data ?? null;
  const me: LeagueStanding | undefined = summary
    ? {
        managerId: "me",
        managerName: summary.managerName,
        teamName: summary.teamName,
        rank: summary.overallRank ?? 0,
        previousRank: summary.overallRank ?? 0,
        gameweekScore: summary.gameweekPoints,
        totalScore: summary.totalPoints,
      }
    : undefined;

  const rankingsQ = useQuery({
    queryKey: ["fantasy-rankings", sort, page, search, me?.totalScore ?? null],
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
    <div className="space-y-5 pb-8">
      <SectionHeader
        eyebrow={t("fantasy.tab.rankings")}
        title={t("fantasy.rankings.title")}
        subtitle={t("fantasy.rankings.subtitle")}
      />

      {rankingsQ.isError ? (
        <ErrorState onRetry={() => rankingsQ.refetch()} />
      ) : !data ? (
        <LoadingState />
      ) : (
        <>
          {data.podium.length === 3 && (
            <RankingsPodium podium={data.podium} clubs={clubs} meId={data.myRank?.managerId} />
          )}

          <MyRankCard standing={data.myRank} onJump={data.myRank ? jumpToMe : undefined} />

          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <div
              role="tablist"
              aria-label={t("fantasy.rankings.title")}
              className="inline-flex rounded-2xl border border-[var(--border-subtle)] bg-card p-1"
            >
              {(["overall", "gameweek"] as RankingsSort[]).map((key) => (
                <button
                  key={key}
                  role="tab"
                  aria-selected={sort === key}
                  onClick={() => setSort(key)}
                  className={cn(
                    "min-h-11 rounded-xl px-4 text-sm font-bold transition-colors",
                    sort === key
                      ? "cta-brand"
                      : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  {t(
                    key === "overall"
                      ? "fantasy.rankings.sort_overall"
                      : "fantasy.rankings.sort_gameweek",
                  )}
                </button>
              ))}
            </div>

            <label className="relative flex-1 sm:max-w-xs">
              <span className="sr-only">{t("fantasy.rankings.search")}</span>
              <Search
                className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={t("fantasy.rankings.search")}
                className="min-h-11 w-full rounded-2xl border border-[var(--border-subtle)] bg-card ps-9 pe-3 text-sm text-foreground outline-none transition-shadow placeholder:text-muted-foreground focus:ring-2 focus:ring-[color:var(--brand-accent)]/40"
              />
            </label>
          </div>

          <div
            ref={tableRef}
            className="glass-surface glass-regular overflow-hidden rounded-2xl border border-[var(--glass-border)]"
            style={{ boxShadow: "var(--shadow-card)" }}
          >
            <div className="flex items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2.5 text-[10px] font-black uppercase tracking-[0.12em] text-muted-foreground">
              <span className="w-9">#</span>
              <span className="flex-1">{t("fantasy.rankings.manager")}</span>
              <span className="w-12 text-end">{t("fantasy.points.abbr")}</span>
              <span className="w-14 text-end">
                {sort === "gameweek" ? t("fantasy.gw_points") : t("fantasy.total_points")}
              </span>
            </div>

            {data.rows.length === 0 ? (
              <EmptyState>{t("fantasy.rankings.empty")}</EmptyState>
            ) : (
              <ul>
                {data.rows.map((row) => (
                  <RankingRow
                    key={row.managerId}
                    row={row}
                    clubs={clubs}
                    isMe={row.managerId === data.myRank?.managerId}
                    nf={nf}
                  />
                ))}
              </ul>
            )}
          </div>

          <div className="flex items-center justify-between gap-3">
            <p className="text-xs font-semibold text-muted-foreground">
              {nf.format(data.total)} {t("fantasy.rankings.count")}
            </p>
            <div className="flex items-center gap-2">
              <PagerButton
                label={t("fantasy.rankings.prev")}
                disabled={page <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                <ChevronLeft className="h-4 w-4 rtl:rotate-180" aria-hidden />
              </PagerButton>
              <span className="text-xs font-black tabular-nums text-foreground">
                {t("fantasy.rankings.page")} {nf.format(page)} / {nf.format(pageCount)}
              </span>
              <PagerButton
                label={t("fantasy.rankings.next")}
                disabled={page >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                <ChevronRight className="h-4 w-4 rtl:rotate-180" aria-hidden />
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
      className="grid h-11 w-11 place-items-center rounded-2xl border border-[var(--border-subtle)] bg-card text-foreground transition-colors hover:bg-muted disabled:opacity-40"
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
    <li
      className={cn(
        "flex min-h-14 items-center gap-2 border-b border-[var(--border-subtle)] px-4 py-2 last:border-0",
        isMe && "bg-[color:var(--brand-accent)]/8",
      )}
    >
      <span className="flex w-9 items-center gap-1 text-sm font-black tabular-nums text-foreground">
        {row.rank <= 3 ? (
          <Trophy
            className={cn(
              "h-3.5 w-3.5",
              row.rank === 1 && "text-amber-500",
              row.rank === 2 && "text-slate-400",
              row.rank === 3 && "text-orange-500",
            )}
            aria-hidden
          />
        ) : null}
        {nf.format(row.rank)}
      </span>
      {club ? (
        <ClubCrest club={club} size="sm" />
      ) : (
        <span className="grid h-7 w-7 place-items-center rounded-lg bg-muted text-[10px] font-black text-muted-foreground">
          {row.teamName.slice(0, 2).toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <div className="truncate text-sm font-bold text-foreground">{row.teamName}</div>
        <div className="truncate text-[11px] text-muted-foreground">{row.managerName}</div>
      </div>
      <RankChangeIndicator rank={row.rank} previousRank={row.previousRank} />
      <span className="w-12 text-end text-xs font-bold tabular-nums text-muted-foreground">
        {nf.format(row.gameweekScore)}
      </span>
      <span className="w-14 text-end text-sm font-black tabular-nums text-foreground">
        {nf.format(row.totalScore)}
      </span>
    </li>
  );
}
