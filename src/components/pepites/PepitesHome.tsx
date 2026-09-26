import { useQuery } from "@tanstack/react-query";
import { ChevronRight } from "lucide-react";

import { ui, UiEmptyState, UiErrorState, UiLinkButton, UiStatePanel } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { editionItems, formatNumber } from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesPreviewBanner,
  PepitesRevealBanner,
  UpdatedLine,
} from "./PepitesParts";
import { PepitesShareButton } from "./PepitesShareButton";
import { PepitesShell } from "./PepitesShell";
import { TopTenList } from "./TopTenList";
import {
  homeQueryOptions,
  pointerVersion,
  usePepitesViewer,
  useVersionPointer,
} from "./use-pepites";
import { WeeklyEmailCard } from "./WeeklyEmailCard";

/**
 * `/pepites`: the current weekly Top 10, or last season's final ranking
 * before the first edition. The page reads the version pointer and keeps it
 * fresh during a reveal; when a new edition is published, the list below
 * changes without a reload (architecture §7).
 */
export function PepitesHome() {
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  const pointerQuery = useVersionPointer(viewer);
  const pointer = pointerQuery.data;
  const version = pointerVersion(pointer);
  const home = useQuery({
    ...homeQueryOptions(viewer, version),
    enabled: pointer?.available === true && version !== null,
    // Keeps the current Top 10 on screen while the next version loads.
    placeholderData: (previous) => previous,
  });

  if (pointerQuery.isPending) {
    return (
      <PepitesShell view="top">
        <UiStatePanel kind="loading" />
      </PepitesShell>
    );
  }
  if (pointerQuery.isError && !pointer) {
    return (
      <PepitesShell view="top">
        <UiErrorState
          title={t("pepites.state.error")}
          onRetry={() => void pointerQuery.refetch()}
        />
      </PepitesShell>
    );
  }
  if (!pointer?.available) {
    return (
      <PepitesShell view="top">
        <PepitesComingSoon />
      </PepitesShell>
    );
  }

  const data = home.data;
  const edition = data?.available && data.source === "edition" ? (data.edition ?? null) : null;
  const previous =
    data?.available && data.source === "previous_season" ? (data.previousSeason ?? null) : null;

  const body = (() => {
    if (version === null || (data?.available && !data.found)) {
      return (
        <UiEmptyState
          testId="pepites-empty"
          title={t("pepites.state.no_ranking")}
          body={t("pepites.state.no_ranking_body")}
        />
      );
    }
    if (home.isPending) return <UiStatePanel kind="loading" />;
    if (home.isError && !data) {
      return <UiErrorState title={t("pepites.state.error")} onRetry={() => void home.refetch()} />;
    }
    if (edition) {
      return (
        <section className="flex flex-col gap-3" aria-labelledby="pepites-edition-title">
          <div className="flex flex-col gap-1">
            <h2
              id="pepites-edition-title"
              className={ui.text.section}
              data-testid="pepites-edition-title"
            >
              {t("pepites.home.week_title").replace("{n}", formatNumber(edition.week, lang))}
            </h2>
            <p className={cn(ui.text.meta, ui.tone.muted)}>
              {t("pepites.home.week_meta")
                .replace("{round}", formatNumber(edition.round, lang))
                .replace("{season}", edition.seasonLabel)}
            </p>
            <UpdatedLine iso={edition.publishedAt} />
          </div>
          <TopTenList items={editionItems(edition.entries)} testId="pepites-top10" />
        </section>
      );
    }
    if (previous) {
      return (
        <section className="flex flex-col gap-3" aria-labelledby="pepites-previous-title">
          <div className="flex flex-col gap-1">
            <h2
              id="pepites-previous-title"
              className={ui.text.section}
              data-testid="pepites-previous-title"
            >
              {t("pepites.home.previous_title").replace("{season}", previous.seasonLabel)}
            </h2>
            <p className={cn(ui.text.meta, ui.tone.muted)}>{t("pepites.home.previous_body")}</p>
          </div>
          <TopTenList
            items={previous.entries.slice(0, 10).map((entry) => ({
              rank: entry.rank,
              score: entry.score,
              player: entry.player,
            }))}
            testId="pepites-top10"
          />
        </section>
      );
    }
    return <UiStatePanel kind="loading" />;
  })();

  return (
    <PepitesShell view="top" trailing={edition ? <PepitesShareButton edition={edition} /> : null}>
      {pointer.preview ? <PepitesPreviewBanner /> : null}
      <PepitesRevealBanner pointer={pointer} />
      {body}
      <UiLinkButton
        to="/pepites/classement"
        variant="soft"
        className="self-stretch"
        data-testid="pepites-full-ranking"
      >
        {t("pepites.home.full_ranking")}
        <ChevronRight className="h-4 w-4" aria-hidden />
      </UiLinkButton>
      <WeeklyEmailCard />
      <p className={cn(ui.text.micro, ui.tone.muted)}>{t("pepites.home.about")}</p>
    </PepitesShell>
  );
}
