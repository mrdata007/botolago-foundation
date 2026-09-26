import { useQuery } from "@tanstack/react-query";

import { UiAlert, UiBackButton, UiEmptyState, UiLinkButton } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { editionItems, formatNumber } from "./pepites-format";
import { pp } from "./pepites-design";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
  UpdatedLine,
} from "./PepitesParts";
import { PepitesShareButton } from "./PepitesShareButton";
import { PepitesShell } from "./PepitesShell";
import { MonoLine, NightBand } from "./PepitesVisuals";
import { TopTenHero, TopTenList, type PlayerStats } from "./TopTenList";
import { editionQueryOptions, usePepitesViewer, useVersionPointer } from "./use-pepites";

/**
 * `/pepites/semaine/$n`: one week's edition of the current season, as it
 * was published. A corrected edition says so and links to its correction; a
 * withdrawn one says why and shows no players (architecture §5.3).
 */
export function PepitesEditionPage({ week }: { week: number }) {
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  // Read again as the page opens: whether Pépites is open at all.
  const pointer = useVersionPointer(viewer);
  const query = useQuery(editionQueryOptions(viewer, null, week));
  const data = query.data;
  const back = <UiBackButton to="/pepites" />;

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
      <PepitesShell>
        {back}
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
  const share =
    edition.status === "published" ? <PepitesShareButton edition={edition} onNight /> : null;
  const hero = leader ? (
    <TopTenHero
      item={leader}
      stats={undefined}
      kicker={kicker}
      titleId="pepites-edition-title"
      title={title}
      action={share}
    />
  ) : (
    <NightBand cut={26}>
      <div className="flex items-start justify-between gap-3 pb-10 pt-3">
        <div className="flex flex-col gap-1.5">
          <MonoLine>{kicker}</MonoLine>
          <h2
            id="pepites-edition-title"
            data-testid="pepites-edition-title"
            className={cn(pp.display, pp.lean, "text-[26px] text-white")}
          >
            {title}
          </h2>
        </div>
        {share}
      </div>
    </NightBand>
  );
  return (
    <PepitesShell hero={hero}>
      {back}
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
        <p className={cn("text-[12px]", pp.muted)} data-testid="pepites-edition-is-correction">
          {t("pepites.edition.is_correction")}
        </p>
      ) : null}
      {rest.length > 0 ? (
        <section aria-labelledby="pepites-edition-title">
          <TopTenList items={rest} stats={NO_STATS} testId="pepites-top10" />
        </section>
      ) : null}
    </PepitesShell>
  );
}

/** A past week's figures are not the current ranking's: its rows print none. */
const NO_STATS: ReadonlyMap<string, PlayerStats> = new Map();
