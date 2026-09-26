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

import { pp } from "./pepites-design";
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
import { FilterChip, Headshot, MonoLine, NightBand, RatingChip } from "./PepitesVisuals";

export const RANKING_PAGE_SIZE = 20;
/** The age chip: 20 and under (Figma 01, "≤ 20 ans"). */
export const RANKING_YOUNG_AGE = 20;

export interface RankingFilters {
  readonly position: PositionGroup | null;
  readonly maxAge: number | null;
  readonly sort: RankingSort;
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
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const base: Omit<RankingQuery, "offset"> = {
    version,
    position: filters.position,
    maxAge: filters.maxAge,
    teamId: null,
    sort: filters.sort,
    limit: RANKING_PAGE_SIZE,
  };
  const pages = useInfiniteQuery({
    ...rankingPagesOptions(viewer, base),
    enabled: pointer?.available === true && version !== null,
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
    <NightBand cut={26} ghost={counted ? String(total) : null} testId="pepites-ranking-hero">
      <div className="flex flex-col gap-2 pb-12 pt-3">
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
    </NightBand>
  );

  const body = (() => {
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
        <RankingMessage testId="pepites-ranking-empty" title={t("pepites.ranking.no_match")} />
      );
    }
    return (
      <>
        <RankingTable
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
    <PepitesShell hero={hero} className="gap-3">
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <div className="-mt-12 flex flex-col gap-3">{body}</div>
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
    <div className={cn("rounded-[14px] px-2.5 py-1", pp.table)}>
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
