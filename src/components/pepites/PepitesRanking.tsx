import { useInfiniteQuery } from "@tanstack/react-query";

import {
  RANKING_SORTS,
  type PositionGroup,
  type RankingQuery,
  type RankingRow,
  type RankingSort,
} from "@/backend/pepites/contracts";
import type { TranslationKey } from "@/i18n/dictionaries";
import {
  ui,
  UiButton,
  UiChip,
  UiEmptyState,
  UiErrorState,
  UiSelect,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { formatNumber, POSITION_GROUPS, positionLabel } from "./pepites-format";
import {
  MovementBadge,
  PepitesComingSoon,
  PepitesPlayerLine,
  PepitesPreviewBanner,
  PepitesRevealBanner,
  PlayerLink,
  ScoreFigure,
} from "./PepitesParts";
import { PepitesShell } from "./PepitesShell";
import {
  pointerVersion,
  rankingPagesOptions,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";

export const RANKING_PAGE_SIZE = 20;
export const RANKING_AGES = [23, 21, 19] as const;

export interface RankingFilters {
  readonly position: PositionGroup | null;
  readonly maxAge: number | null;
  readonly sort: RankingSort;
}

/** The sort's name, one literal key each (the i18n gate reads them). */
function sortLabel(sort: RankingSort, t: (key: TranslationKey) => string): string {
  switch (sort) {
    case "score":
      return t("pepites.sort.score");
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

/** The figure a row shows beside the score when sorted by something else. */
function sortValue(row: RankingRow, sort: RankingSort, lang: "fr" | "ar"): string | null {
  switch (sort) {
    case "score":
      return null;
    case "minutes":
      return `${formatNumber(row.minutes, lang)}′`;
    case "goals":
      return formatNumber(row.goals, lang);
    case "assists":
      return formatNumber(row.assists, lang);
    case "rating":
      return row.ratingAvg === null ? "–" : formatNumber(row.ratingAvg, lang, 2);
    case "form":
      return row.formAvg === null ? "–" : formatNumber(row.formAvg, lang, 2);
    case "ga90":
      return row.ga90 === null ? "–" : formatNumber(row.ga90, lang, 2);
  }
}

/**
 * `/pepites/classement`: every ranked player of the current version, by
 * position and age, sorted by score or one of the ranking's inputs. Twenty
 * at a time.
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

  const filtersBar = (
    <div className="flex flex-col gap-3" data-testid="pepites-filters">
      <div
        className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1"
        role="group"
        aria-label={t("pepites.filter.position")}
      >
        <UiChip
          selected={filters.position === null}
          onClick={() => onFiltersChange({ ...filters, position: null })}
        >
          {t("pepites.filter.all_positions")}
        </UiChip>
        {POSITION_GROUPS.map((group) => (
          <UiChip
            key={group}
            selected={filters.position === group}
            onClick={() => onFiltersChange({ ...filters, position: group })}
            data-testid={`pepites-filter-${group}`}
          >
            {positionLabel(group, t)}
          </UiChip>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-3">
        <UiSelect
          label={t("pepites.filter.age")}
          value={String(filters.maxAge ?? 23)}
          onChange={(event) => {
            const age = Number(event.target.value);
            onFiltersChange({ ...filters, maxAge: age >= 23 ? null : age });
          }}
          options={RANKING_AGES.map((age) => ({
            value: String(age),
            label:
              age === 23
                ? t("pepites.filter.all_ages")
                : t("pepites.filter.max_age").replace("{n}", formatNumber(age, lang)),
          }))}
          data-testid="pepites-filter-age"
        />
        <UiSelect
          label={t("pepites.filter.sort")}
          value={filters.sort}
          onChange={(event) =>
            onFiltersChange({ ...filters, sort: event.target.value as RankingSort })
          }
          options={RANKING_SORTS.map((sort) => ({ value: sort, label: sortLabel(sort, t) }))}
          data-testid="pepites-filter-sort"
        />
      </div>
    </div>
  );

  if (pointerQuery.isPending) {
    return (
      <PepitesShell view="ranking">
        <UiStatePanel kind="loading" />
      </PepitesShell>
    );
  }
  if (pointerQuery.isError && !pointer) {
    return (
      <PepitesShell view="ranking">
        <UiErrorState
          title={t("pepites.state.error")}
          onRetry={() => void pointerQuery.refetch()}
        />
      </PepitesShell>
    );
  }
  if (!pointer?.available) {
    return (
      <PepitesShell view="ranking">
        <PepitesComingSoon />
      </PepitesShell>
    );
  }

  const rows = (pages.data?.pages ?? []).flatMap((page) =>
    page.available && page.rows ? page.rows : [],
  );
  const first = pages.data?.pages[0];
  const total = first?.available ? (first.total ?? 0) : 0;

  const list = (() => {
    if (version === null || (first?.available && !first.found)) {
      return (
        <UiEmptyState
          title={t("pepites.state.no_ranking")}
          body={t("pepites.state.no_ranking_body")}
        />
      );
    }
    if (pages.isPending) return <UiStatePanel kind="loading" />;
    if (pages.isError && rows.length === 0) {
      return <UiErrorState title={t("pepites.state.error")} onRetry={() => void pages.refetch()} />;
    }
    if (rows.length === 0) {
      return <UiEmptyState testId="pepites-ranking-empty" title={t("pepites.ranking.no_match")} />;
    }
    return (
      <>
        <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="pepites-ranking-count">
          {t("pepites.ranking.count").replace("{n}", formatNumber(total, lang))}
        </p>
        <ol className="flex flex-col gap-2" data-testid="pepites-ranking">
          {rows.map((row) => {
            const extra = sortValue(row, filters.sort, lang);
            return (
              <li key={row.id} data-testid="pepites-ranking-row">
                <PlayerLink playerId={row.id}>
                  <div className={cn("flex items-center gap-3 p-3", ui.surface.card)}>
                    <bdi
                      className={cn(
                        ui.score.row,
                        "w-8 shrink-0 text-center tabular-nums",
                        ui.tone.muted,
                      )}
                    >
                      {row.rank === null ? "–" : formatNumber(row.rank, lang)}
                    </bdi>
                    <div className="min-w-0 flex-1">
                      <PepitesPlayerLine
                        player={row}
                        size="sm"
                        trailing={
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <ScoreFigure score={row.score} />
                            {extra ? (
                              <span className={cn(ui.text.micro, ui.tone.muted)}>
                                {sortLabel(filters.sort, t)} <bdi>{extra}</bdi>
                              </span>
                            ) : (
                              <MovementBadge movement={row.movement} />
                            )}
                          </div>
                        }
                      />
                    </div>
                  </div>
                </PlayerLink>
              </li>
            );
          })}
        </ol>
        {pages.hasNextPage ? (
          <UiButton
            variant="soft"
            disabled={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
            data-testid="pepites-load-more"
          >
            {t("pepites.ranking.load_more")}
          </UiButton>
        ) : null}
      </>
    );
  })();

  return (
    <PepitesShell view="ranking">
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      {filtersBar}
      {list}
    </PepitesShell>
  );
}
