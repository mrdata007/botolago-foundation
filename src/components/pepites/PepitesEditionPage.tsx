import { useQuery } from "@tanstack/react-query";

import {
  ui,
  UiAlert,
  UiBackButton,
  UiEmptyState,
  UiErrorState,
  UiLinkButton,
  UiStatePanel,
} from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { editionItems, formatNumber } from "./pepites-format";
import { PepitesComingSoon, PepitesPreviewBanner, UpdatedLine } from "./PepitesParts";
import { PepitesShareButton } from "./PepitesShareButton";
import { PepitesShell } from "./PepitesShell";
import { TopTenList } from "./TopTenList";
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

  if (query.isPending) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiStatePanel kind="loading" />
      </PepitesShell>
    );
  }
  if (query.isError && !data) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiErrorState title={t("pepites.state.error")} onRetry={() => void query.refetch()} />
      </PepitesShell>
    );
  }
  if (!data?.available || pointer.data?.available === false) {
    return (
      <PepitesShell view={null}>
        <PepitesComingSoon />
      </PepitesShell>
    );
  }
  const edition = data.found ? (data.edition ?? null) : null;
  if (!edition) {
    return (
      <PepitesShell view={null}>
        {back}
        <UiEmptyState testId="pepites-edition-missing" title={t("pepites.edition.not_found")} />
      </PepitesShell>
    );
  }

  const title = t("pepites.home.week_title").replace("{n}", formatNumber(edition.week, lang));
  return (
    <PepitesShell
      view={null}
      trailing={edition.status === "published" ? <PepitesShareButton edition={edition} /> : null}
    >
      {back}
      {data.preview ? <PepitesPreviewBanner /> : null}
      <div className="flex flex-col gap-1">
        <h2 className={ui.text.section} data-testid="pepites-edition-title">
          {title}
        </h2>
        <p className={cn(ui.text.meta, ui.tone.muted)}>
          {t("pepites.home.week_meta")
            .replace("{round}", formatNumber(edition.round, lang))
            .replace("{season}", edition.seasonLabel)}
        </p>
        <UpdatedLine iso={edition.publishedAt} />
      </div>
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
      {edition.status !== "withdrawn" ? (
        <TopTenList items={editionItems(edition.entries)} testId="pepites-top10" />
      ) : null}
    </PepitesShell>
  );
}
