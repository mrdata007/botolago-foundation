import { useInfiniteQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";

import {
  type PositionGroup,
  type RankingQuery,
  type RankingRow,
  type RankingSort,
} from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import { ui } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp, teamKit } from "./pepites-design";
import {
  formatCount,
  formatNumber,
  POSITION_GROUPS,
  positionLabel,
  positionShort,
  scoreText,
} from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  PepitesRevealBanner,
} from "./PepitesParts";
import { PepitesShell } from "./PepitesShell";
import {
  pointerVersion,
  rankingPagesOptions,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";
import {
  FilterChip,
  GoMark,
  Headshot,
  MonoLine,
  NightBand,
  PepitesShirt,
  RatingChip,
  Seg10Bar,
} from "./PepitesVisuals";

export const RANKING_PAGE_SIZE = 20;
/** The age chip: 20 and under (Figma 01, "≤ 20 ans"). */
export const RANKING_YOUNG_AGE = 20;

export interface RankingFilters {
  readonly position: PositionGroup | null;
  readonly maxAge: number | null;
  readonly sort: RankingSort;
  readonly teamId: string | null;
  readonly minMinutes: number | null;
  readonly followed: boolean;
}

/** The sort's name, one literal key each (the i18n gate reads them). */
function sortLabel(sort: RankingSort, t: (key: TranslationKey) => string): string {
  switch (sort) {
    case "score":
      return t("pepites.sort.score_short");
    case "minutes":
      return t("pepites.sort.minutes");
    case "goals":
      return t("pepites.sort.goals");
    case "assists":
      return t("pepites.sort.assists");
    case "rating":
      return t("pepites.sort.rating");
    case "form":
      return t("pepites.sort.form");
    case "ga90":
      return t("pepites.sort.ga90");
  }
}

/** Figma 02's columns: # · player · MIN · B/PD · NOTE · SCORE. */
const COLUMNS = "grid grid-cols-[18px_minmax(0,1fr)_44px_36px_36px_34px] items-center gap-1";

/**
 * `/pepites/classement` (Figma 02): every ranked player of the current
 * version on one table card, by position and age, sorted by score or by a
 * column. Twenty at a time.
 */
export function PepitesRanking({
  filters,
  onFiltersChange,
}: {
  filters: RankingFilters;
  onFiltersChange: (next: RankingFilters) => void;
}) {
  const { t, tr, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const base: Omit<RankingQuery, "offset"> = {
    version,
    position: filters.position,
    maxAge: filters.maxAge,
    teamId: filters.teamId,
    minMinutes: filters.minMinutes,
    followed: filters.followed,
    sort: filters.sort,
    limit: RANKING_PAGE_SIZE,
  };
  const pages = useInfiniteQuery({
    ...rankingPagesOptions(viewer, base),
    enabled:
      pointer?.available === true && version !== null && (!filters.followed || viewer !== "anon"),
  });

  if (pointerQuery.isPending) {
    return <PepitesLoadingState onRetry={() => void pointerQuery.refetch()} />;
  }
  if (pointerQuery.isError && !pointer) {
    return <PepitesErrorState onRetry={() => void pointerQuery.refetch()} />;
  }
  if (!pointer?.available) {
    return (
      <PepitesShell>
        <PepitesComingSoon />
      </PepitesShell>
    );
  }

  const rows = (pages.data?.pages ?? []).flatMap((page) =>
    page.available && page.rows ? page.rows : [],
  );
  const first = pages.data?.pages[0];
  const total = first?.available ? (first.total ?? 0) : 0;
  const counted = first?.available && first.found;

  const hero = (
    <NightBand cut={26} ghost={counted ? String(total) : null} testId="pepites-ranking-hero" wide>
      <div className="flex flex-col gap-2 pb-12 pt-3 md:hidden">
        <h1 className={cn(pp.display, pp.lean, "text-[30px] leading-[1.1] text-white")}>
          {t("pepites.ranking.title")}
        </h1>
        <MonoLine testId="pepites-ranking-count">
          {[
            counted
              ? t("pepites.ranking.count_short").replace("{n}", `⁨${formatNumber(total, lang)}⁩`)
              : null,
            t("pepites.ranking.scope"),
            `${t("pepites.ranking.sorted_by")} ${sortLabel(filters.sort, t)} ▼`,
          ]
            .filter(Boolean)
            .join(" · ")}
        </MonoLine>
        <div
          className="-mx-4 mt-2 flex gap-1.5 overflow-x-auto px-4 pb-1"
          role="group"
          aria-label={t("pepites.filter.position")}
          data-testid="pepites-filters"
        >
          <FilterChip
            tone="dark"
            selected={filters.position === null}
            onClick={() => onFiltersChange({ ...filters, position: null })}
          >
            {t("pepites.filter.all_positions")}
          </FilterChip>
          {[...POSITION_GROUPS].reverse().map((group) => (
            <FilterChip
              key={group}
              tone="dark"
              selected={filters.position === group}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  position: filters.position === group ? null : group,
                })
              }
              testId={`pepites-filter-${group}`}
            >
              {positionShort(group, t)}
            </FilterChip>
          ))}
          <FilterChip
            tone="dark"
            selected={filters.maxAge === RANKING_YOUNG_AGE}
            onClick={() =>
              onFiltersChange({
                ...filters,
                maxAge: filters.maxAge === RANKING_YOUNG_AGE ? null : RANKING_YOUNG_AGE,
              })
            }
            testId="pepites-filter-age"
          >
            {t("pepites.chip.max_age_20")}
          </FilterChip>
        </div>
      </div>
      <div className="hidden min-h-[360px] items-start justify-between gap-8 py-9 md:flex">
        <div className="max-w-[540px] pt-1">
          <GoMark />
          <h1 className={cn(pp.display, pp.lean, "mt-8 text-[clamp(42px,4vw,56px)] text-white")}>
            {t("pepites.ranking.desktop_title")}
          </h1>
          <MonoLine className="mt-4">
            {t("pepites.hero.kicker_short")} ·{" "}
            {t("pepites.ranking.count_short").replace("{n}", formatNumber(total, lang))} · 600+{" "}
            {t("pepites.stats.minutes")}
          </MonoLine>
          <p
            className={cn(pp.bold, pp.onNightSub, "mt-5 max-w-[500px] text-[15px] leading-relaxed")}
          >
            {t("pepites.ranking.desktop_lede")}
          </p>
          <Link
            to="/pepites/methode"
            className={cn(pp.heavy, pp.spring, "mt-4 inline-block text-[14px]", ui.focusOnMesh)}
          >
            {t("pepites.home.method_link")} →
          </Link>
        </div>
        <div className="flex gap-4" data-testid="pepites-desktop-podium">
          {rows.slice(0, 3).map((row) => (
            <Link
              key={row.id}
              to="/pepites/joueur/$playerId"
              params={{ playerId: row.id }}
              className={cn(
                "relative flex h-[250px] w-[190px] flex-col overflow-hidden rounded-2xl border border-white/15 p-3 text-white",
                ui.focusOnMesh,
              )}
              style={{
                background: `linear-gradient(180deg, ${teamKit(row.team).primary}99, #0d1738)`,
              }}
            >
              <span className={cn(pp.display, "absolute top-3 text-[64px] text-white/15")}>
                {row.rank ?? "–"}
              </span>
              <PepitesShirt
                player={row}
                number={row.rank}
                className="relative mx-auto h-[130px] w-[132px]"
              />
              <span className={cn(pp.display, "mt-2 truncate text-[17px]")}>{row.name}</span>
              <span className={cn(pp.mono, pp.onNightSub, "truncate text-[9px]")}>
                {row.team ? tr(row.team.shortName) : ""} ·{" "}
                {row.positionGroup ? positionShort(row.positionGroup, t) : ""}
              </span>
              <span className={cn(pp.display, pp.energyText, "mt-auto text-[36px]")}>
                {scoreText(row.score, lang, "–")}
              </span>
            </Link>
          ))}
        </div>
      </div>
    </NightBand>
  );

  const body = (() => {
    if (filters.followed && viewer === "anon") {
      return (
        <div className="flex flex-col gap-3">
          <RankingMessage
            testId="pepites-ranking-sign-in"
            title={t("pepites.ranking.followed")}
            body={t("pepites.follow.account_required")}
          />
          <Link
            to="/auth/login"
            search={{ next: "/pepites/classement?suivis=1" }}
            className={cn(pp.heavy, pp.ink, "self-center underline underline-offset-2")}
          >
            {t("pepites.follow.have_account")}
          </Link>
        </div>
      );
    }
    if (version === null || (first?.available && !first.found)) {
      return (
        <RankingMessage
          testId="pepites-ranking-none"
          title={t("pepites.state.no_ranking")}
          body={t("pepites.state.no_ranking_body")}
        />
      );
    }
    if (pages.isPending) return <TableSkeleton />;
    if (pages.isError && rows.length === 0) {
      return <PepitesErrorState inline onRetry={() => void pages.refetch()} />;
    }
    if (rows.length === 0) {
      return (
        <RankingMessage
          testId="pepites-ranking-empty"
          title={
            filters.followed ? t("pepites.ranking.followed_empty") : t("pepites.ranking.no_match")
          }
        />
      );
    }
    return (
      <>
        <RankingTable
          rows={rows}
          sort={filters.sort}
          onSort={(sort) => onFiltersChange({ ...filters, sort })}
        />
        <DesktopRankingTable
          rows={rows}
          sort={filters.sort}
          onSort={(sort) => onFiltersChange({ ...filters, sort })}
        />
        {pages.hasNextPage ? (
          <button
            type="button"
            disabled={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
            data-testid="pepites-load-more"
            className={cn(
              "min-h-[var(--ui-tap-min)] rounded-full border px-5 text-[13px] disabled:opacity-50",
              pp.line,
              pp.ink,
              pp.heavy,
              "bg-[color:var(--pepites-card)]",
              ui.focus,
            )}
          >
            {t("pepites.ranking.load_more")}
          </button>
        ) : null}
        <Link
          to="/pepites/methode"
          className={cn(
            "self-center text-[12px] underline underline-offset-2",
            pp.ink,
            pp.bold,
            ui.focus,
          )}
        >
          {t("pepites.home.method_link")}
        </Link>
      </>
    );
  })();

  return (
    <PepitesShell hero={hero} className="gap-3" wide>
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <div
        className="flex gap-2"
        role="group"
        aria-label={t("pepites.ranking.scope_filter")}
        data-testid="pepites-ranking-scope"
      >
        <FilterChip
          selected={!filters.followed}
          onClick={() => onFiltersChange({ ...filters, followed: false })}
          testId="pepites-ranking-all"
        >
          {t("pepites.ranking.all")}
        </FilterChip>
        <FilterChip
          selected={filters.followed}
          onClick={() => onFiltersChange({ ...filters, followed: true })}
          testId="pepites-ranking-followed"
        >
          {t("pepites.ranking.followed")}
        </FilterChip>
      </div>
      <div
        className="hidden flex-wrap items-center gap-2 md:flex"
        data-testid="pepites-desktop-filters"
      >
        <FilterChip
          selected={filters.position === null}
          onClick={() => onFiltersChange({ ...filters, position: null })}
        >
          {t("pepites.filter.all_positions")}
        </FilterChip>
        {[...POSITION_GROUPS].reverse().map((group) => (
          <FilterChip
            key={group}
            selected={filters.position === group}
            onClick={() => onFiltersChange({ ...filters, position: group })}
          >
            {positionShort(group, t)}
          </FilterChip>
        ))}
        <FilterChip
          selected={filters.maxAge === RANKING_YOUNG_AGE}
          onClick={() =>
            onFiltersChange({
              ...filters,
              maxAge: filters.maxAge === RANKING_YOUNG_AGE ? null : RANKING_YOUNG_AGE,
            })
          }
        >
          {t("pepites.chip.max_age_20")}
        </FilterChip>
        <label className="sr-only" htmlFor="pepites-club-filter">
          {t("pepites.ranking.club")}
        </label>
        <select
          id="pepites-club-filter"
          value={filters.teamId ?? ""}
          onChange={(event) => onFiltersChange({ ...filters, teamId: event.target.value || null })}
          className="min-h-9 rounded-full border bg-white px-3 text-[12px]"
        >
          <option value="">{t("pepites.ranking.club")}</option>
          {(first?.available ? (first.teams ?? []) : []).map((team) => (
            <option key={team.id} value={team.id}>
              {tr(team.shortName)}
            </option>
          ))}
        </select>
        <label className="sr-only" htmlFor="pepites-min-filter">
          {t("pepites.ranking.min_minutes")}
        </label>
        <select
          id="pepites-min-filter"
          value={filters.minMinutes ?? ""}
          onChange={(event) =>
            onFiltersChange({
              ...filters,
              minMinutes: event.target.value ? Number(event.target.value) : null,
            })
          }
          className="min-h-9 rounded-full border bg-white px-3 text-[12px]"
        >
          <option value="">{t("pepites.ranking.min_minutes")}</option>
          {[600, 900, 1200].map((minutes) => (
            <option key={minutes} value={minutes}>
              {formatCount(minutes, lang)}+ {t("pepites.stats.minutes")}
            </option>
          ))}
        </select>
        <span className={cn("ms-auto text-[13px]", pp.ink, pp.bold)}>
          {t("pepites.ranking.sorted_by")} {sortLabel(filters.sort, t)}
        </span>
      </div>
      <div className="flex flex-col gap-3">{body}</div>
    </PepitesShell>
  );
}

function RankingMessage({ title, body, testId }: { title: string; body?: string; testId: string }) {
  return (
    <div data-testid={testId} className={cn("flex flex-col gap-1 rounded-[14px] p-4", pp.table)}>
      <p className={cn(pp.heavy, pp.text, "text-[15px]")}>{title}</p>
      {body ? <p className={cn(pp.muted, "text-[13px]")}>{body}</p> : null}
    </div>
  );
}

function TableSkeleton() {
  return (
    <div
      className={cn("flex flex-col gap-3 rounded-[14px] px-2.5 py-3", pp.table)}
      aria-busy="true"
      data-testid="pepites-ranking-loading"
    >
      {Array.from({ length: 8 }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <span className="size-5 rounded-full bg-[color:var(--pepites-seg-empty)]" />
          <span className="h-2.5 flex-1 rounded-full bg-[color:var(--pepites-seg-empty)]" />
          <span className="h-2.5 w-10 rounded-full bg-[color:var(--pepites-seg-empty)]" />
        </div>
      ))}
    </div>
  );
}

/** A column heading that sorts: the active one is ink, with ▼. */
function SortHeading({
  sort,
  active,
  onSort,
  children,
}: {
  sort: RankingSort;
  active: RankingSort;
  onSort: (sort: RankingSort) => void;
  children: string;
}) {
  const on = sort === active;
  return (
    <button
      type="button"
      onClick={() => onSort(sort)}
      aria-pressed={on}
      data-testid={`pepites-sort-${sort}`}
      className={cn(
        "min-h-[28px] text-end text-[8px] leading-none ltr:tracking-[0.08em]",
        pp.monoStrong,
        on ? pp.ink : pp.muted,
        ui.focus,
      )}
    >
      {children}
      {on ? <span aria-hidden> ▼</span> : null}
    </button>
  );
}

function RankingTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly RankingRow[];
  sort: RankingSort;
  onSort: (sort: RankingSort) => void;
}) {
  const { t, lang } = useI18n();
  return (
    <div className={cn("rounded-[14px] px-2.5 py-1 md:hidden", pp.table)}>
      <div className={cn(COLUMNS, "border-b py-1", pp.divider)}>
        <span className={cn(pp.monoStrong, pp.muted, "text-[8px]")} aria-hidden>
          #
        </span>
        <span className={cn(pp.monoStrong, pp.muted, "text-[8px] ltr:tracking-[0.08em]")}>
          {t("pepites.table.player")}
        </span>
        <SortHeading sort="minutes" active={sort} onSort={onSort}>
          {t("pepites.table.minutes")}
        </SortHeading>
        <SortHeading sort="goals" active={sort} onSort={onSort}>
          {t("pepites.table.goals_assists")}
        </SortHeading>
        <SortHeading sort="rating" active={sort} onSort={onSort}>
          {t("pepites.table.rating")}
        </SortHeading>
        <SortHeading sort="score" active={sort} onSort={onSort}>
          {t("pepites.table.score")}
        </SortHeading>
      </div>
      <ol data-testid="pepites-ranking">
        {rows.map((row) => (
          <li
            key={row.id}
            data-testid="pepites-ranking-row"
            className={cn("border-b last:border-b-0", pp.divider)}
          >
            <Link
              to="/pepites/joueur/$playerId"
              params={{ playerId: row.id }}
              className={cn(COLUMNS, "py-1.5", ui.focus)}
            >
              <bdi className={cn(pp.mono, pp.muted, "text-[10px]")}>
                {row.rank === null ? "–" : formatNumber(row.rank, lang)}
              </bdi>
              <span className="flex min-w-0 items-center gap-1.5">
                <Headshot player={row} size={20} />
                <span className={cn(pp.bold, pp.text, "truncate text-[11px]")}>
                  <bdi>{row.name}</bdi>
                </span>
                {row.positionGroup ? (
                  <span className="sr-only">{positionLabel(row.positionGroup, t)}</span>
                ) : null}
              </span>
              <bdi className={cn(pp.bold, pp.text, "text-end text-[11px]")}>
                <span className="sr-only">{t("pepites.sort.minutes")} </span>
                {formatCount(row.minutes, lang)}
              </bdi>
              <bdi dir="ltr" className={cn(pp.bold, pp.text, "text-end text-[11px]")}>
                <span className="sr-only">{t("pepites.table.goals_assists_long")} </span>
                {`${formatNumber(row.goals, lang)}/${formatNumber(row.assists, lang)}`}
              </bdi>
              <span className="flex justify-end">
                <RatingChip rating={row.ratingAvg} />
              </span>
              <bdi className={cn(pp.display, pp.ink, "text-end text-[14px]")}>
                {scoreText(row.score, lang, t("pepites.unranked"))}
              </bdi>
            </Link>
          </li>
        ))}
      </ol>
    </div>
  );
}

const DESKTOP_COLUMNS =
  "grid grid-cols-[30px_minmax(170px,2fr)_60px_42px_42px_42px_62px_45px_40px_65px_62px_62px_72px_minmax(125px,1fr)] items-center gap-2";

function DesktopRankingTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly RankingRow[];
  sort: RankingSort;
  onSort: (sort: RankingSort) => void;
}) {
  const { t, tr, lang } = useI18n();
  return (
    <div
      className={cn("hidden overflow-x-auto rounded-2xl px-5 py-2 md:block", pp.table)}
      data-testid="pepites-desktop-table"
    >
      <div className="min-w-[1120px]">
        <div
          className={cn(
            DESKTOP_COLUMNS,
            "border-b py-3",
            pp.divider,
            pp.monoStrong,
            pp.muted,
            "text-[10px]",
          )}
        >
          <span>#</span>
          <span>{t("pepites.table.player")}</span>
          <span>{t("pepites.player.position")}</span>
          <span>{t("pepites.player.age")}</span>
          <span>{t("pepites.fact.apps")}</span>
          <span>{t("pepites.fact.starts")}</span>
          <SortHeading sort="minutes" active={sort} onSort={onSort}>
            {t("pepites.table.minutes")}
          </SortHeading>
          <SortHeading sort="goals" active={sort} onSort={onSort}>
            {t("pepites.stats.goals")}
          </SortHeading>
          <SortHeading sort="assists" active={sort} onSort={onSort}>
            {t("pepites.stats.assists")}
          </SortHeading>
          <SortHeading sort="ga90" active={sort} onSort={onSort}>
            {t("pepites.fact.ga90")}
          </SortHeading>
          <SortHeading sort="rating" active={sort} onSort={onSort}>
            {t("pepites.table.rating")}
          </SortHeading>
          <SortHeading sort="form" active={sort} onSort={onSort}>
            {t("pepites.sort.form")}
          </SortHeading>
          <span>{t("pepites.ranking.second_half")}</span>
          <SortHeading sort="score" active={sort} onSort={onSort}>
            {t("pepites.table.score")}
          </SortHeading>
        </div>
        <ol>
          {rows.map((row) => (
            <li key={row.id} className={cn("border-b last:border-0", pp.divider)}>
              <Link
                to="/pepites/joueur/$playerId"
                params={{ playerId: row.id }}
                className={cn(DESKTOP_COLUMNS, "min-h-[55px] py-2 text-[12px]", ui.focus)}
              >
                <bdi className={cn(pp.display, pp.ink, "text-[18px]")}>{row.rank ?? "–"}</bdi>
                <span className="flex min-w-0 items-center gap-2">
                  <Headshot player={row} size={36} />
                  <span className="min-w-0">
                    <span className={cn(pp.heavy, pp.text, "block truncate text-[13px]")}>
                      {row.name}
                    </span>
                    <span className={cn(pp.muted, "block truncate text-[11px]")}>
                      {row.team ? tr(row.team.name) : ""}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    "w-fit rounded bg-[#e8ecfb] px-2 py-1 text-[10px]",
                    pp.monoStrong,
                    pp.ink,
                  )}
                >
                  {row.positionGroup ? positionShort(row.positionGroup, t) : "–"}
                </span>
                <bdi>{row.age ?? "–"}</bdi>
                <bdi>{formatNumber(row.apps, lang)}</bdi>
                <bdi>{formatNumber(row.starts, lang)}</bdi>
                <bdi>{formatCount(row.minutes, lang)}</bdi>
                <bdi>{formatNumber(row.goals, lang)}</bdi>
                <bdi>{formatNumber(row.assists, lang)}</bdi>
                <bdi>{row.ga90 === null ? "–" : formatNumber(row.ga90, lang, 2)}</bdi>
                <RatingChip rating={row.ratingAvg} />
                <bdi>{row.formAvg === null ? "–" : formatNumber(row.formAvg, lang, 2)}</bdi>
                <bdi>
                  {row.secondHalfMinutes === null ||
                  row.secondHalfMinutes === undefined ||
                  row.minutes <= 0
                    ? "–"
                    : `${formatNumber(Math.round((row.secondHalfMinutes / row.minutes) * 100), lang)}%`}
                </bdi>
                <span className="flex items-center gap-2">
                  <Seg10Bar value={row.score} className="w-[96px]" />
                  <bdi className={cn(pp.display, pp.ink, "text-[21px]")}>
                    {scoreText(row.score, lang, "–")}
                  </bdi>
                </span>
              </Link>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}
