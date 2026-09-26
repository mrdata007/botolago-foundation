import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { ChevronRight, Play } from "lucide-react";

import type { MethodologyResponse } from "@/backend/pepites/contracts";
import { useMemo } from "react";

import { ui, UiIconLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { pp } from "./pepites-design";
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
import { PepitesShell } from "./PepitesShell";
import { TopTenHero, TopTenList } from "./TopTenList";
import {
  homeQueryOptions,
  methodologyQueryOptions,
  pointerVersion,
  rankingStatsQueryOptions,
  statsByPlayer,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";
import { FilterChip } from "./PepitesVisuals";
import { WeeklyEmailCard } from "./WeeklyEmailCard";

const POSTE = { GK: "gk", DEF: "def", MID: "mid", FWD: "fwd" } as const;

/** The round of the first weekly edition, from the methodology (3 by default). */
function firstEditionRound(data: MethodologyResponse | undefined): number {
  const value = data?.available ? data.methodology.params.first_edition_round : undefined;
  return typeof value === "number" && Number.isInteger(value) && value > 0 ? value : 3;
}

/** Top 10, then the ranking by position or age (Figma 01, "Filters"). */
function HomeChips() {
  const { t } = useI18n();
  return (
    <nav
      aria-label={t("pepites.filter.position")}
      className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1"
      data-testid="pepites-home-chips"
    >
      <FilterChip selected to="/pepites">
        {t("pepites.tab.top")}
      </FilterChip>
      {[...POSITION_GROUPS].reverse().map((group) => (
        <FilterChip
          key={group}
          selected={false}
          to="/pepites/classement"
          search={{ poste: POSTE[group] }}
        >
          {positionShort(group, t)}
        </FilterChip>
      ))}
      <FilterChip selected={false} to="/pepites/classement" search={{ age: 20 }}>
        {t("pepites.chip.max_age_20")}
      </FilterChip>
    </nav>
  );
}

/**
 * `/pepites` (Figma 01): the current weekly Top 10 — the leader on the night
 * band, the nine others as rows — or last season's final ranking before the
 * first edition. The page reads the version pointer and keeps it fresh during
 * a reveal; when a new edition is published, the list changes without a
 * reload (architecture §7).
 */
export function PepitesHome() {
  const { t, lang } = useI18n();
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
      <Link
        to="/pepites/classement"
        data-testid="pepites-full-ranking"
        className={cn(
          "flex min-h-[var(--ui-tap-min)] items-center justify-center gap-1 rounded-full px-5 text-[13px] text-white",
          "bg-[color:var(--pepites-ink)] dark:bg-[color:var(--ui-ink)]",
          pp.heavy,
          ui.focus,
        )}
      >
        {t("pepites.home.full_ranking")}
        <ChevronRight className="size-4 rtl:-scale-x-100" aria-hidden />
      </Link>
      <WeeklyEmailCard />
      <div className="flex flex-col gap-1">
        {edition ? <UpdatedLine iso={edition.publishedAt} /> : null}
        <p className={cn("text-[12px] leading-[1.45]", pp.muted)}>{t("pepites.home.about")}</p>
        <Link
          to="/pepites/methode"
          className={cn(
            "self-start text-[12px] underline underline-offset-2",
            pp.ink,
            pp.bold,
            ui.focus,
          )}
          data-testid="pepites-method-link"
        >
          {t("pepites.home.method_link")}
        </Link>
      </div>
    </>
  );

  if (edition && edition.entries.length > 0) {
    const items = editionItems(edition.entries);
    const [leader, ...rest] = items;
    return (
      <PepitesShell
        hero={
          <TopTenHero
            item={leader!}
            stats={stats.get(leader!.player.id)}
            kicker={t("pepites.hero.kicker").replace("{season}", edition.seasonLabel)}
            titleId="pepites-edition-title"
            title={t("pepites.home.week_title").replace("{n}", formatNumber(edition.week, lang))}
            action={
              <div className="flex items-center gap-2">
                <UiIconLinkButton
                  to="/pepites/revelation"
                  variant="glass"
                  aria-label={t("pepites.reveal.play")}
                  data-testid="pepites-reveal-play"
                >
                  <Play aria-hidden />
                </UiIconLinkButton>
                <PepitesShareButton edition={edition} onNight />
              </div>
            }
          />
        }
      >
        {pointer.preview ? <PepitesPreviewBanner /> : null}
        <PepitesRevealBanner pointer={pointer} />
        <HomeChips />
        <section aria-labelledby="pepites-edition-title">
          <TopTenList items={rest} stats={stats} testId="pepites-top10" />
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
        footer={footer}
      />
    );
  }

  return (
    <PepitesShell>
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      <PepitesEmptyState />
      {footer}
    </PepitesShell>
  );
}

function PepitesEmptyState() {
  const { t } = useI18n();
  return (
    <div
      data-testid="pepites-empty"
      className={cn("flex flex-col gap-1 rounded-[14px] p-4", pp.card)}
    >
      <p className={cn(pp.heavy, pp.text, "text-[15px]")}>{t("pepites.state.no_ranking")}</p>
      <p className={cn(pp.muted, "text-[13px]")}>{t("pepites.state.no_ranking_body")}</p>
    </div>
  );
}
