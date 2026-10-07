import { useQuery } from "@tanstack/react-query";

import { ui, UiAlert, UiEmptyState, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { editionItems, formatNumber } from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  UpdatedLine,
} from "./PepitesParts";
import { PepitesShareButton } from "./PepitesShareButton";
import { PepitesPageTitle, PepitesShell } from "./PepitesShell";
import { PepitesFeature } from "./PepitesFeature";
import { TopTenList, type PlayerStats } from "./TopTenList";
import { editionQueryOptions, usePepitesViewer, useVersionPointer } from "./use-pepites";

/**
 * `/pepites/semaine/$n`: one week's edition of the current season, as it
 * was published. A corrected edition says so and links to its correction; a
 * withdrawn one says why and shows no players (architecture §5.3).
 *
 * It is the Top 10 page for an earlier week, so it wears the same title band
 * as `/pepites` (the week's title, its meta line, the share button), one
 * level down: the back pill sits above the title.
 */
export function PepitesEditionPage({ week }: { week: number }) {
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  // Read again as the page opens: whether Pépites is open at all.
  const pointer = useVersionPointer(viewer);
  const query = useQuery(editionQueryOptions(viewer, null, week));
  const data = query.data;

  if (query.isPending) return <PepitesLoadingState onRetry={() => void query.refetch()} />;
  if (query.isError && !data) return <PepitesErrorState onRetry={() => void query.refetch()} />;
  if (!data?.available || pointer.data?.available === false) {
    return (
      <PepitesShell>
        <PepitesComingSoon />
      </PepitesShell>
    );
  }
  const edition = data.found ? (data.edition ?? null) : null;
  if (!edition) {
    return (
      <PepitesShell
        pageHeader={
          <PepitesPageTitle
            backTo="/pepites"
            title={t("pepites.home.week_title").replace("{n}", formatNumber(week, lang))}
          />
        }
      >
        <UiEmptyState testId="pepites-edition-missing" title={t("pepites.edition.not_found")} />
      </PepitesShell>
    );
  }

  const title = t("pepites.home.week_title").replace("{n}", formatNumber(edition.week, lang));
  const kicker = t("pepites.home.week_meta")
    .replace("{round}", formatNumber(edition.round, lang))
    .replace("{season}", edition.seasonLabel);
  const items = edition.status !== "withdrawn" ? editionItems(edition.entries) : [];
  const [leader, ...rest] = items;
  return (
    <PepitesShell
      pageHeader={
        <PepitesPageTitle
          backTo="/pepites"
          title={
            // The Top 10 below is labelled by this heading.
            <span id="pepites-edition-title" data-testid="pepites-edition-title">
              {title}
            </span>
          }
          trailing={
            edition.status === "published" ? <PepitesShareButton edition={edition} /> : undefined
          }
        >
          <p className={cn(ui.text.meta, ui.tone.muted)}>{kicker}</p>
        </PepitesPageTitle>
      }
    >
      {data.preview ? <PepitesPreviewBanner /> : null}
      <UpdatedLine iso={edition.publishedAt} />
      {edition.status === "withdrawn" ? (
        <UiAlert
          tone="caution"
          title={t("pepites.edition.withdrawn_title")}
          testId="pepites-edition-withdrawn"
        >
          {edition.withdrawnReason ?? t("pepites.edition.withdrawn_body")}
        </UiAlert>
      ) : null}
      {edition.status === "superseded" ? (
        <UiAlert
          tone="info"
          title={t("pepites.edition.corrected_title")}
          testId="pepites-edition-corrected"
          action={
            edition.correctedByWeek ? (
              <UiLinkButton
                to="/pepites/semaine/$n"
                params={{ n: String(edition.correctedByWeek) }}
                size="sm"
                variant="soft"
              >
                {t("pepites.edition.see_correction")}
              </UiLinkButton>
            ) : undefined
          }
        >
          {t("pepites.edition.corrected_body")}
        </UiAlert>
      ) : null}
      {edition.correctsEditionId ? (
        <p className={cn(ui.text.meta, ui.tone.muted)} data-testid="pepites-edition-is-correction">
          {t("pepites.edition.is_correction")}
        </p>
      ) : null}
      {leader ? (
        <section aria-labelledby="pepites-edition-title" className="flex flex-col gap-2.5">
          {/* No wheel (`version={null}`): today's percentiles are not that week's. */}
          <PepitesFeature
            testId="pepites-hero"
            player={leader.player}
            rank={leader.rank}
            score={leader.score}
            movement={leader.movement ?? null}
            reason={lang === "ar" ? leader.reasonAr : leader.reasonFr}
            version={null}
          />
          <TopTenList items={rest} stats={NO_STATS} figures={false} testId="pepites-top10" />
        </section>
      ) : null}
    </PepitesShell>
  );
}

/** A past week's figures are not the current ranking's: its rows print none. */
const NO_STATS: ReadonlyMap<string, PlayerStats> = new Map();
