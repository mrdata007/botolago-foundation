import { useQuery } from "@tanstack/react-query";
import { ChevronRight, Play } from "lucide-react";

import type { MethodologyResponse, PositionGroup } from "@/backend/pepites/contracts";
import { useMemo, useState } from "react";

import { ui, UiChip, UiEmptyState, UiIconLinkButton, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";
import { useManagerCardLive } from "@/services/manager-card-status";

import { editionItems, formatNumber, POSITION_GROUPS, positionShort } from "./pepites-format";
import {
  PepitesBeforeFirstEdition,
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  PepitesRevealBanner,
  UpdatedLine,
} from "./PepitesParts";
import { PepitesShareButton } from "./PepitesShareButton";
import { PepitesChipRow, PepitesPageTitle, PepitesShell } from "./PepitesShell";
import { PepitesFeature } from "./PepitesFeature";
import { TopTenList } from "./TopTenList";
import {
  homeQueryOptions,
  methodologyQueryOptions,
  pointerVersion,
  rankingStatsQueryOptions,
  statsByPlayer,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";
import { WeeklyEmailCard } from "./WeeklyEmailCard";

type HomeFilter = PositionGroup | "young" | null;

/** The round of the first weekly edition, from the methodology (3 by default). */
function firstEditionRound(data: MethodologyResponse | undefined): number {
  const value = data?.available ? data.methodology.params.first_edition_round : undefined;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 3;
}

/**
 * Filter the published Top 10 in place by position or age: `UiChip` toggles
 * (`aria-pressed`) in the shared chip row under the title.
 */
function HomeChips({
  filter,
  onFilterChange,
}: {
  filter: HomeFilter;
  onFilterChange: (next: HomeFilter) => void;
}) {
  const { t } = useI18n();
  return (
    <PepitesChipRow
      label={t("pepites.filter.position")}
      testId="pepites-home-chips"
      className="mt-2"
    >
      <UiChip
        selected={filter === null}
        onClick={() => onFilterChange(null)}
        data-testid="pepites-home-filter-all"
      >
        {t("pepites.tab.top")}
      </UiChip>
      {[...POSITION_GROUPS].reverse().map((group) => (
        <UiChip
          key={group}
          selected={filter === group}
          onClick={() => onFilterChange(group)}
          data-testid={`pepites-home-filter-${group}`}
        >
          {positionShort(group, t)}
        </UiChip>
      ))}
      <UiChip
        selected={filter === "young"}
        onClick={() => onFilterChange("young")}
        data-testid="pepites-home-filter-age"
      >
        {t("pepites.chip.max_age_20")}
      </UiChip>
    </PepitesChipRow>
  );
}

/**
 * `/pepites`: the current weekly Top 10 — the week's title band with the
 * reveal and share buttons and the filter chips, the leader on the featured
 * photo band with its percentile wheel (`PepitesFeature`), the nine others
 * as rows — or last season's final ranking before the first edition, laid
 * out the same way. The page reads the version pointer and keeps it fresh during
 * a reveal; when a new edition is published, the list changes without a
 * reload (architecture §7).
 */
export function PepitesHome() {
  const { t, lang } = useI18n();
  // While Gradins is live, Pépites lives inside Fantasy (plan 3.4): the title band names the way
  // back. Off, the band has no back pill, as before.
  const live = useManagerCardLive();
  const back = live ? { backTo: "/fantasy", backLabel: t("nav.fantasy") } : {};
  const [filter, setFilter] = useState<HomeFilter>(null);
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const open = pointer?.available === true && version !== null;
  const home = useQuery({
    ...homeQueryOptions(viewer, version),
    enabled: open,
    // Keeps the current Top 10 on screen while the next version loads.
    placeholderData: (previous) => previous,
  });
  const ranking = useQuery({
    ...rankingStatsQueryOptions(viewer, version),
    enabled: open,
    placeholderData: (previous) => previous,
  });
  const stats = useMemo(() => statsByPlayer(ranking.data), [ranking.data]);
  const beforeFirst = home.data?.available === true && home.data.source === "previous_season";
  const methodology = useQuery({ ...methodologyQueryOptions(viewer), enabled: beforeFirst });
  const firstRound = firstEditionRound(methodology.data);

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

  const data = home.data;
  const edition = data?.available && data.source === "edition" ? (data.edition ?? null) : null;
  const previous =
    data?.available && data.source === "previous_season" ? (data.previousSeason ?? null) : null;

  if (version !== null && home.isPending) {
    return <PepitesLoadingState onRetry={() => void home.refetch()} />;
  }
  if (home.isError && !data) return <PepitesErrorState onRetry={() => void home.refetch()} />;

  const footer = (
    <>
      <UiLinkButton to="/pepites/classement" variant="ink" data-testid="pepites-full-ranking">
        {t("pepites.home.full_ranking")}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </UiLinkButton>
      <WeeklyEmailCard />
      <div className="flex flex-col gap-1">
        {edition ? <UpdatedLine iso={edition.publishedAt} /> : null}
        <p className={cn(ui.text.secondary, ui.tone.muted)}>{t("pepites.home.about")}</p>
        {/* `-ms-3` lines the label up with the paragraph above; the 44px
            target keeps its own padding. */}
        <UiLinkButton
          to="/pepites/methode"
          size="sm"
          variant="ghost"
          className="-ms-3 self-start"
          data-testid="pepites-method-link"
        >
          {t("pepites.home.method_link")}
        </UiLinkButton>
      </div>
    </>
  );

  if (edition && edition.entries.length > 0) {
    const items = editionItems(edition.entries);
    const filtered = items.filter(
      (item) =>
        filter === null ||
        (filter === "young"
          ? typeof item.player.age === "number" && item.player.age <= 20
          : item.player.positionGroup === filter),
    );
    const [leader, ...rest] = filtered;
    const kicker = t("pepites.hero.kicker").replace("{season}", edition.seasonLabel);
    const title = t("pepites.home.week_title").replace("{n}", formatNumber(edition.week, lang));
    return (
      <PepitesShell
        pageHeader={
          <PepitesPageTitle
            {...back}
            title={
              // The Top 10 below is labelled by this heading.
              <span id="pepites-edition-title" data-testid="pepites-edition-title">
                {title}
              </span>
            }
            trailing={
              <div className="flex items-center gap-2">
                <UiIconLinkButton
                  to="/pepites/revelation"
                  aria-label={t("pepites.reveal.play")}
                  data-testid="pepites-reveal-play"
                >
                  <Play aria-hidden />
                </UiIconLinkButton>
                <PepitesShareButton edition={edition} />
              </div>
            }
          >
            <p className={cn(ui.text.meta, ui.tone.muted)}>{kicker}</p>
            <HomeChips filter={filter} onFilterChange={setFilter} />
          </PepitesPageTitle>
        }
      >
        {pointer.preview ? <PepitesPreviewBanner /> : null}
        <PepitesRevealBanner pointer={pointer} />
        <section aria-labelledby="pepites-edition-title" className="flex flex-col gap-2.5">
          {leader ? (
            <>
              <PepitesFeature
                testId="pepites-hero"
                scoreTestId="pepites-hero-score"
                player={leader.player}
                rank={leader.rank}
                score={leader.score}
                movement={leader.movement ?? null}
                reason={lang === "ar" ? leader.reasonAr : leader.reasonFr}
                facts
                stats={stats.get(leader.player.id)}
                statsPending={ranking.isPending}
                version={version}
              />
              <TopTenList items={rest} stats={stats} testId="pepites-top10" />
            </>
          ) : (
            <UiEmptyState testId="pepites-home-empty" title={t("pepites.home.no_match")} />
          )}
        </section>
        {footer}
      </PepitesShell>
    );
  }

  if (previous && previous.entries.length > 0) {
    return (
      <PepitesBeforeFirstEdition
        previous={previous}
        firstRound={firstRound}
        pointer={pointer}
        stats={stats}
        statsPending={ranking.isPending}
        footer={footer}
        {...back}
      />
    );
  }

  return (
    <PepitesShell>
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <UiEmptyState
        testId="pepites-empty"
        title={t("pepites.state.no_ranking")}
        body={t("pepites.state.no_ranking_body")}
      />
      {footer}
    </PepitesShell>
  );
}
