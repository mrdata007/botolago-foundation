import { useInfiniteQuery } from "@tanstack/react-query";
import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowDown, ChevronRight } from "lucide-react";
import type { MouseEvent, ReactNode } from "react";

import {
  type PositionGroup,
  type RankingQuery,
  type RankingRow,
  type RankingSort,
} from "@/backend/pepites/contracts";
import { SectionHeaderLink } from "@/components/common/SectionHeader";
import {
  ui,
  UiBadge,
  UiButton,
  UiCard,
  UiChip,
  UiEmptyState,
  UiLinkButton,
  UiSelect,
  UiStatePanel,
  UiTable,
  UiTBody,
  UiTD,
  UiTH,
  UiTHead,
  UiTR,
} from "@/components/ui-kit";
import type { TranslationKey } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { clubStyle } from "@/lib/club-palette";
import { cn } from "@/lib/utils";

import {
  formatCount,
  formatNumber,
  POSITION_GROUPS,
  positionLabel,
  positionShort,
  scoreText,
  teamAsClub,
} from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  PepitesRevealBanner,
} from "./PepitesParts";
import { PepitesChipRow, PepitesPageTitle, PepitesShell } from "./PepitesShell";
import {
  pointerVersion,
  rankingPagesOptions,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";
import { PepitesFeature } from "./PepitesFeature";
import {
  PepitesIdentityDisc,
  PepitesName,
  RankPlate,
  RatingChip,
  Seg10Bar,
} from "./PepitesVisuals";
import { useClubCatalogue } from "./use-club-catalogue";

export const RANKING_PAGE_SIZE = 20;
/** The age chip: 20 and under (Figma 01, "≤ 20 ans"). */
export const RANKING_YOUNG_AGE = 20;
/** The minutes floors the desktop filter offers; the first is the one the band names. */
const MINUTES_FLOORS = [600, 900, 1200] as const;

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

/** Keeps a figure's digits in order inside an Arabic line (plan §9). */
const isolate = (text: string) => `⁨${text}⁩`;

/** The heavy weight on a ramp step that does not carry it (a name in a dense row). */
const HEAVY = "[font-weight:var(--ui-weight-heavy)]";

/**
 * A row's link sits inside a row that is itself tappable (`UiTR onClick`),
 * so a click on the link must not reach the row and navigate a second time.
 */
const keepToLink = (event: MouseEvent) => event.stopPropagation();

/**
 * `/pepites/classement` (Figma 02), on the main kit (BG-0152): the kit's
 * title band with the back pill, the count and the position chips; the
 * featured N°1 on the stadium band while the list is in ranking order
 * (`PepitesFeature`, BG-0156; it replaced a podium of three); then every
 * ranked player of the current version in a table, by position and age,
 * sorted by score or by a column. Twenty at a time.
 *
 * One `<h1>` serves both widths (its words change from 768px), so each
 * breakpoint shows exactly one. The phone table and the desktop table are
 * separate: the phone keeps the six Figma columns, the desktop shows all
 * fourteen. Only the phone rows carry `pepites-ranking-row`.
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
  const teams = first?.available ? (first.teams ?? []) : [];

  const countText = counted
    ? t("pepites.ranking.count_short").replace("{n}", isolate(formatNumber(total, lang)))
    : null;
  const sortedBy = `${t("pepites.ranking.sorted_by")} ${sortLabel(filters.sort, t)}`;
  const setSort = (sort: RankingSort) => onFiltersChange({ ...filters, sort });

  const header = (
    <PepitesPageTitle
      desktop
      backTo="/pepites"
      backTestId="pepites-ranking-back"
      title={
        <>
          <span className="md:hidden">{t("pepites.ranking.title")}</span>
          <span className="hidden md:inline">{t("pepites.ranking.desktop_title")}</span>
        </>
      }
    >
      <div className="flex flex-col gap-3">
        <p
          data-testid="pepites-ranking-count"
          className={cn("md:hidden", ui.text.meta, ui.tone.muted)}
        >
          {[countText, t("pepites.ranking.scope"), sortedBy].filter(Boolean).join(" · ")}
        </p>
        <div className="hidden flex-col gap-1 md:flex">
          <p className={cn(ui.text.meta, ui.tone.muted)}>
            {[
              t("pepites.hero.kicker_short"),
              countText,
              `${isolate(`${formatCount(MINUTES_FLOORS[0], lang)}+`)} ${t("pepites.stats.minutes")}`,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
          <p className={cn("max-w-prose", ui.text.body, ui.tone.muted)}>
            {t("pepites.ranking.desktop_lede")}
          </p>
        </div>
        <PepitesChipRow label={t("pepites.filter.position")} testId="pepites-filters">
          <UiChip
            selected={filters.position === null}
            onClick={() => onFiltersChange({ ...filters, position: null })}
          >
            {t("pepites.filter.all_positions")}
          </UiChip>
          {[...POSITION_GROUPS].reverse().map((group) => (
            <UiChip
              key={group}
              selected={filters.position === group}
              onClick={() =>
                onFiltersChange({
                  ...filters,
                  position: filters.position === group ? null : group,
                })
              }
              data-testid={`pepites-filter-${group}`}
            >
              {positionShort(group, t)}
            </UiChip>
          ))}
          <UiChip
            selected={filters.maxAge === RANKING_YOUNG_AGE}
            onClick={() =>
              onFiltersChange({
                ...filters,
                maxAge: filters.maxAge === RANKING_YOUNG_AGE ? null : RANKING_YOUNG_AGE,
              })
            }
            data-testid="pepites-filter-age"
          >
            {t("pepites.chip.max_age_20")}
          </UiChip>
        </PepitesChipRow>
      </div>
    </PepitesPageTitle>
  );

  const body = (() => {
    if (filters.followed && viewer === "anon") {
      return (
        <UiEmptyState
          testId="pepites-ranking-sign-in"
          title={t("pepites.ranking.followed")}
          body={t("pepites.follow.account_required")}
          action={
            <UiLinkButton
              to="/auth/login"
              search={{ next: "/pepites/classement?suivis=1" }}
              variant="ink"
              size="sm"
              className="mt-4"
            >
              {t("pepites.follow.have_account")}
            </UiLinkButton>
          }
        />
      );
    }
    if (version === null || (first?.available && !first.found)) {
      return (
        <UiEmptyState
          testId="pepites-ranking-none"
          title={t("pepites.state.no_ranking")}
          body={t("pepites.state.no_ranking_body")}
        />
      );
    }
    if (pages.isPending) {
      return <UiStatePanel kind="loading" testId="pepites-ranking-loading" className="py-0" />;
    }
    if (pages.isError && rows.length === 0) {
      return <PepitesErrorState inline onRetry={() => void pages.refetch()} />;
    }
    if (rows.length === 0) {
      return (
        <UiEmptyState
          testId="pepites-ranking-empty"
          title={
            filters.followed ? t("pepites.ranking.followed_empty") : t("pepites.ranking.no_match")
          }
        />
      );
    }
    return (
      <>
        {/* The featured N°1 (BG-0156) while the list is in ranking order:
            sorted by another column, the first row is not the leader. */}
        {filters.sort === "score" && rows[0] ? (
          <PepitesFeature
            testId="pepites-feature"
            player={rows[0]}
            rank={rows[0].rank}
            score={rows[0].score}
            movement={rows[0].movement}
            version={version}
            width="desktop"
          />
        ) : null}
        <RankingTable rows={rows} sort={filters.sort} onSort={setSort} />
        <DesktopRankingTable rows={rows} sort={filters.sort} onSort={setSort} />
        {pages.hasNextPage ? (
          <UiButton
            variant="soft"
            disabled={pages.isFetchingNextPage}
            onClick={() => void pages.fetchNextPage()}
            data-testid="pepites-load-more"
            className="md:w-auto md:self-center md:px-8"
          >
            {t("pepites.ranking.load_more")}
          </UiButton>
        ) : null}
        <SectionHeaderLink to="/pepites/methode" className="gap-1 self-center">
          {t("pepites.home.method_link")}
          <ChevronRight className="size-4" aria-hidden />
        </SectionHeaderLink>
      </>
    );
  })();

  return (
    <PepitesShell pageHeader={header} width="desktop" className="gap-3 md:gap-4">
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div
          className="flex gap-2"
          role="group"
          aria-label={t("pepites.ranking.scope_filter")}
          data-testid="pepites-ranking-scope"
        >
          <UiChip
            selected={!filters.followed}
            onClick={() => onFiltersChange({ ...filters, followed: false })}
            data-testid="pepites-ranking-all"
          >
            {t("pepites.ranking.all")}
          </UiChip>
          <UiChip
            selected={filters.followed}
            onClick={() => onFiltersChange({ ...filters, followed: true })}
            data-testid="pepites-ranking-followed"
          >
            {t("pepites.ranking.followed")}
          </UiChip>
        </div>
        <div
          className="hidden min-w-0 flex-1 flex-wrap items-center gap-2 md:flex"
          data-testid="pepites-desktop-filters"
        >
          <UiSelect
            id="pepites-club-filter"
            aria-label={t("pepites.ranking.club")}
            value={filters.teamId ?? ""}
            onChange={(event) =>
              onFiltersChange({ ...filters, teamId: event.target.value || null })
            }
            className="w-44"
          >
            <option value="">{t("pepites.ranking.club")}</option>
            {teams.map((team) => (
              <option key={team.id} value={team.id}>
                {tr(team.shortName)}
              </option>
            ))}
          </UiSelect>
          <UiSelect
            id="pepites-min-filter"
            aria-label={t("pepites.ranking.min_minutes")}
            value={filters.minMinutes ?? ""}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                minMinutes: event.target.value ? Number(event.target.value) : null,
              })
            }
            className="w-52"
          >
            <option value="">{t("pepites.ranking.min_minutes")}</option>
            {MINUTES_FLOORS.map((minutes) => (
              <option key={minutes} value={minutes}>
                {formatCount(minutes, lang)}+ {t("pepites.stats.minutes")}
              </option>
            ))}
          </UiSelect>
          <span className={cn("ms-auto", ui.text.meta, ui.tone.muted)}>{sortedBy}</span>
        </div>
      </div>
      <div className="flex flex-col gap-3 md:gap-4">{body}</div>
    </PepitesShell>
  );
}

/**
 * A column heading that sorts: a button on the 44px tap floor, the active
 * one in the brand foreground and underlined (with a down arrow from 768px,
 * where the columns have the room), `aria-pressed` on the button and
 * `aria-sort` on the heading. Every sort is descending.
 */
function SortHeader({
  sort,
  active,
  onSort,
  children,
  className,
}: {
  sort: RankingSort;
  active: RankingSort;
  onSort: (sort: RankingSort) => void;
  children: ReactNode;
  className?: string;
}) {
  const on = sort === active;
  return (
    <UiTH numeric aria-sort={on ? "descending" : undefined} className={cn("px-0 py-0", className)}>
      <button
        type="button"
        onClick={() => onSort(sort)}
        aria-pressed={on}
        data-testid={`pepites-sort-${sort}`}
        className={cn(
          "inline-flex items-center justify-end gap-0.5 px-1 text-end",
          ui.space.tap,
          ui.radius.control,
          ui.text.label,
          on ? cn(ui.tone.ink, "underline decoration-2 underline-offset-4") : ui.tone.muted,
          ui.focus,
        )}
      >
        <span>{children}</span>
        {on ? <ArrowDown className="hidden size-3 md:block" aria-hidden /> : null}
      </button>
    </UiTH>
  );
}

/**
 * The score in a table column: a figure on the stat ramp in the brand
 * foreground, or the "unranked" word in the micro step (the ramp is for
 * digits).
 */
function ScoreFigure({ score, unranked }: { score: number | null; unranked: string }) {
  const { lang } = useI18n();
  const ranked = typeof score === "number" && Number.isFinite(score);
  return (
    <bdi className={ranked ? cn(ui.stat.md, ui.tone.ink) : cn(ui.text.micro, ui.tone.muted)}>
      {scoreText(score, lang, unranked)}
    </bdi>
  );
}

/**
 * A row's club colour, as the standings draw a zone: a 4px bar on the start
 * edge of the row's first cell (which is `relative`), in the club's edge
 * colour (`clubStyle`, ≥ 3:1 against the card). Decorative: the club is
 * printed in the row.
 */
function ClubEdge({ row }: { row: RankingRow }) {
  if (!row.team) return null;
  const colours = clubStyle(teamAsClub(row.team));
  return (
    <span
      aria-hidden
      data-club={colours["data-club"]}
      style={colours.style}
      className={cn("absolute inset-y-0 start-0 w-1", ui.club.edgeFill)}
    />
  );
}

/** A tappable table row's hover, on top of `UiTR`'s rule. */
const ROW = cn(
  "h-[var(--ui-row-min)] last:border-b-0",
  "transition-colors duration-[var(--duration-quick)] hover:bg-[color:var(--ui-surface-sunken)]",
);

/**
 * The phone table (Figma 02's columns: # · player · MIN · B/PD · NOTE ·
 * SCORE), `table-fixed` so a long name cannot push the score off a 390px
 * screen. The four figure columns are the 44px their sort buttons need and
 * the score column only what "SCORE" needs, so the name keeps the rest.
 *
 * Each row carries (BG-0156) the club's colour on its start edge, the rank
 * (1 to 3 on the white plate), the player's photo or the club's crest, the
 * name over "position · club", and the ten-segment bar under the score. On
 * a table under 384px (phones up to 414px) the disc gives its width to the
 * name, as before: with it, names and clubs wrapped to two or three lines
 * and the rows grew by half (measured, BG-0156); the club's edge and name
 * still say whose row it is. A name that does not fit wraps, balanced, onto
 * a second line (the row grows past its 48px floor), and only a fourth line
 * would be cut. The
 * name takes its own direction (`PepitesName`), so a Latin name in an Arabic
 * table keeps its first name and loses its end, never its start. The whole
 * row opens the player; the link around the disc and name is the row's
 * keyboard and screen-reader target, and carries `pepites-ranking-row` (the
 * position is read inside it).
 */
function RankingTable({
  rows,
  sort,
  onSort,
}: {
  rows: readonly RankingRow[];
  sort: RankingSort;
  onSort: (sort: RankingSort) => void;
}) {
  const { t, tr, lang } = useI18n();
  const navigate = useNavigate();
  const catalogue = useClubCatalogue();
  return (
    <UiCard
      padding="none"
      testId="pepites-ranking"
      className="@container overflow-hidden md:hidden"
    >
      <UiTable caption={t("pepites.ranking.title")} tableClassName="table-fixed">
        <UiTHead>
          <UiTR>
            <UiTH numeric className="w-10 pe-1 ps-2">
              #
            </UiTH>
            <UiTH className="px-1">{t("pepites.table.player")}</UiTH>
            <SortHeader sort="minutes" active={sort} onSort={onSort} className="w-11">
              {t("pepites.table.minutes")}
            </SortHeader>
            <SortHeader sort="goals" active={sort} onSort={onSort} className="w-11">
              {t("pepites.table.goals_assists")}
            </SortHeader>
            <SortHeader sort="rating" active={sort} onSort={onSort} className="w-11">
              {t("pepites.table.rating")}
            </SortHeader>
            <SortHeader sort="score" active={sort} onSort={onSort} className="w-14 pe-2">
              {t("pepites.table.score")}
            </SortHeader>
          </UiTR>
        </UiTHead>
        <UiTBody>
          {rows.map((row) => (
            <UiTR
              key={row.id}
              className={ROW}
              onClick={() =>
                void navigate({ to: "/pepites/joueur/$playerId", params: { playerId: row.id } })
              }
            >
              <UiTD numeric className="relative pe-1 ps-2">
                <ClubEdge row={row} />
                <RankPlate rank={row.rank} size="sm" />
              </UiTD>
              <UiTD className="px-1">
                <Link
                  to="/pepites/joueur/$playerId"
                  params={{ playerId: row.id }}
                  onClick={keepToLink}
                  data-testid="pepites-ranking-row"
                  className={cn("flex min-w-0 items-center gap-1.5", ui.radius.control, ui.focus)}
                >
                  {/* Under a 384px table (phones to 414px) the disc gives its width to the name. */}
                  <PepitesIdentityDisc
                    player={row}
                    listed={row.team ? catalogue.get(row.team.id) : undefined}
                    size="xs"
                    className="@max-[24rem]:hidden"
                  />
                  <span className="flex min-w-0 flex-1 flex-col">
                    <PepitesName
                      name={row.name}
                      className={cn(
                        "line-clamp-3 min-w-0 text-balance break-words",
                        ui.text.meta,
                        HEAVY,
                        ui.tone.default,
                      )}
                    />
                    {/* Wraps (two lines at most) rather than cutting the club's name. */}
                    <span
                      className={cn(
                        "line-clamp-2 text-balance break-words",
                        ui.text.micro,
                        ui.tone.muted,
                      )}
                    >
                      {/* The short position is seen; the full one is heard, below. */}
                      {row.positionGroup ? (
                        <span aria-hidden>{positionShort(row.positionGroup, t)} · </span>
                      ) : null}
                      {row.team ? tr(row.team.shortName) : null}
                    </span>
                  </span>
                  {row.positionGroup ? (
                    <span className="sr-only">{positionLabel(row.positionGroup, t)}</span>
                  ) : null}
                </Link>
              </UiTD>
              <UiTD numeric className="px-1">
                <span className="sr-only">{t("pepites.sort.minutes")} </span>
                <bdi>{formatCount(row.minutes, lang)}</bdi>
              </UiTD>
              <UiTD numeric className="px-1">
                <span className="sr-only">{t("pepites.table.goals_assists_long")} </span>
                {/* Three children in the page's direction, never one "3/2" string. */}
                <span className="inline-flex items-center gap-0.5">
                  <bdi>{formatNumber(row.goals, lang)}</bdi>
                  <span aria-hidden className={ui.tone.faint}>
                    /
                  </span>
                  <bdi>{formatNumber(row.assists, lang)}</bdi>
                </span>
              </UiTD>
              <UiTD numeric className="px-1">
                <RatingChip rating={row.ratingAvg} />
              </UiTD>
              <UiTD numeric className="pe-3 ps-1">
                <span className="inline-flex flex-col items-end gap-1">
                  <ScoreFigure score={row.score} unranked={t("pepites.unranked")} />
                  <Seg10Bar value={row.score} className="w-10 gap-px" />
                </span>
              </UiTD>
            </UiTR>
          ))}
        </UiTBody>
      </UiTable>
    </UiCard>
  );
}

/**
 * The desktop table, from 768px: every column the data has. It scrolls
 * sideways inside its card where the screen is narrower than the columns
 * (the kit table's own wrapper), never the page.
 */
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
  const navigate = useNavigate();
  const catalogue = useClubCatalogue();
  const dash = <span className={ui.tone.faint}>–</span>;
  return (
    <UiCard
      padding="none"
      testId="pepites-desktop-table"
      className="hidden overflow-hidden md:block"
    >
      <UiTable caption={t("pepites.ranking.desktop_title")}>
        <UiTHead>
          <UiTR>
            <UiTH numeric className="w-12 ps-4">
              #
            </UiTH>
            <UiTH>{t("pepites.table.player")}</UiTH>
            <UiTH>{t("pepites.player.position")}</UiTH>
            <UiTH numeric>{t("pepites.player.age")}</UiTH>
            <UiTH numeric>{t("pepites.fact.apps")}</UiTH>
            <UiTH numeric>{t("pepites.fact.starts")}</UiTH>
            <SortHeader sort="minutes" active={sort} onSort={onSort}>
              {t("pepites.table.minutes")}
            </SortHeader>
            <SortHeader sort="goals" active={sort} onSort={onSort}>
              {t("pepites.stats.goals")}
            </SortHeader>
            <SortHeader sort="assists" active={sort} onSort={onSort}>
              {t("pepites.stats.assists")}
            </SortHeader>
            <SortHeader sort="ga90" active={sort} onSort={onSort}>
              {t("pepites.fact.ga90")}
            </SortHeader>
            <SortHeader sort="rating" active={sort} onSort={onSort}>
              {t("pepites.table.rating")}
            </SortHeader>
            <SortHeader sort="form" active={sort} onSort={onSort}>
              {t("pepites.sort.form")}
            </SortHeader>
            <UiTH numeric>{t("pepites.ranking.second_half")}</UiTH>
            <SortHeader sort="score" active={sort} onSort={onSort} className="pe-3">
              {t("pepites.table.score")}
            </SortHeader>
          </UiTR>
        </UiTHead>
        <UiTBody>
          {rows.map((row) => (
            <UiTR
              key={row.id}
              className={ROW}
              onClick={() =>
                void navigate({ to: "/pepites/joueur/$playerId", params: { playerId: row.id } })
              }
            >
              <UiTD numeric className="relative ps-4">
                <ClubEdge row={row} />
                <RankPlate rank={row.rank} size="sm" />
              </UiTD>
              <UiTD>
                <Link
                  to="/pepites/joueur/$playerId"
                  params={{ playerId: row.id }}
                  onClick={keepToLink}
                  className={cn("flex min-w-0 items-center gap-2", ui.radius.control, ui.focus)}
                >
                  <PepitesIdentityDisc
                    player={row}
                    listed={row.team ? catalogue.get(row.team.id) : undefined}
                    size="xs"
                  />
                  <span className="min-w-0 max-w-56">
                    <PepitesName
                      name={row.name}
                      className={cn("block truncate", ui.text.meta, HEAVY, ui.tone.default)}
                    />
                    {row.team ? (
                      <span className={cn("block truncate", ui.text.micro, ui.tone.muted)}>
                        {tr(row.team.name)}
                      </span>
                    ) : null}
                  </span>
                </Link>
              </UiTD>
              <UiTD>
                {row.positionGroup ? (
                  <UiBadge>{positionShort(row.positionGroup, t)}</UiBadge>
                ) : (
                  dash
                )}
              </UiTD>
              <UiTD numeric>
                {typeof row.age === "number" ? <bdi>{formatNumber(row.age, lang)}</bdi> : dash}
              </UiTD>
              <UiTD numeric>
                <bdi>{formatNumber(row.apps, lang)}</bdi>
              </UiTD>
              <UiTD numeric>
                <bdi>{formatNumber(row.starts, lang)}</bdi>
              </UiTD>
              <UiTD numeric>
                <bdi>{formatCount(row.minutes, lang)}</bdi>
              </UiTD>
              <UiTD numeric>
                <bdi>{formatNumber(row.goals, lang)}</bdi>
              </UiTD>
              <UiTD numeric>
                <bdi>{formatNumber(row.assists, lang)}</bdi>
              </UiTD>
              <UiTD numeric>
                {row.ga90 === null ? dash : <bdi>{formatNumber(row.ga90, lang, 2)}</bdi>}
              </UiTD>
              <UiTD numeric>
                <RatingChip rating={row.ratingAvg} />
              </UiTD>
              <UiTD numeric>
                {row.formAvg === null ? dash : <bdi>{formatNumber(row.formAvg, lang, 2)}</bdi>}
              </UiTD>
              <UiTD numeric>
                {row.secondHalfMinutes === null ||
                row.secondHalfMinutes === undefined ||
                row.minutes <= 0 ? (
                  dash
                ) : (
                  <bdi>
                    {`${formatNumber(Math.round((row.secondHalfMinutes / row.minutes) * 100), lang)}%`}
                  </bdi>
                )}
              </UiTD>
              <UiTD numeric className="pe-4">
                <span className="flex items-center justify-end gap-2">
                  <Seg10Bar value={row.score} className="w-20" />
                  <span className="min-w-7 text-end">
                    <ScoreFigure score={row.score} unranked="–" />
                  </span>
                </span>
              </UiTD>
            </UiTR>
          ))}
        </UiTBody>
      </UiTable>
    </UiCard>
  );
}
