import { useQuery } from "@tanstack/react-query";

import { ui, UiCard, UiKeyValueRow } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

import { formatNumber } from "./pepites-format";
import {
  PepitesComingSoon,
  PepitesErrorState,
  PepitesLoadingState,
  PepitesPreviewBanner,
} from "./PepitesParts";
import { PepitesPageTitle, PepitesShell } from "./PepitesShell";
import { methodologyQueryOptions, usePepitesViewer, useVersionPointer } from "./use-pepites";

function numberAt(
  params: Record<string, unknown>,
  path: readonly string[],
  fallback: number,
): number {
  let value: unknown = params;
  for (const key of path) {
    value =
      typeof value === "object" && value !== null
        ? (value as Record<string, unknown>)[key]
        : undefined;
  }
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

/**
 * A coverage row: the kit's key-value row on the card's own content edge
 * (the kit row's `px-1` would set it 4px inside the heading above it), and
 * no rule under the last one, as the match list ends.
 */
const COVERAGE_ROW = "px-0 last:border-b-0";

/**
 * `/pepites/methode`: how the score is made, read from the methodology the
 * current version was computed with (its weights and thresholds), and how
 * complete the data is (plan §4: trust).
 */
export function PepitesMethodPage() {
  const { t, lang } = useI18n();
  const viewer = usePepitesViewer();
  // The pointer is read again as the page opens: it says whether Pépites is
  // open at all, whatever the page's own (longer-lived) answer says.
  const pointer = useVersionPointer(viewer);
  const query = useQuery(methodologyQueryOptions(viewer));
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

  const { methodology, coverage } = data;
  const params = methodology.params;
  const percent = (share: number) => `${formatNumber(Math.round(share * 100), lang)}%`;
  const weight = (key: string, fallback: number) =>
    percent(numberAt(params, ["weights", key], fallback));
  const ageLimit = numberAt(params, ["age_limit"], 23);
  const floorMinutes = numberAt(params, ["minutes_floor", "absolute"], 180);
  const floorShare = numberAt(params, ["minutes_floor", "share"], 0.3);
  const firstRound = numberAt(params, ["first_edition_round"], 3);
  const minRated = numberAt(params, ["min_rated_appearances"], 3);
  const formWindow = numberAt(params, ["form_window"], 6);

  const sections: Array<{ title: string; body: string }> = [
    {
      title: t("pepites.method.who_title"),
      body: t("pepites.method.who_body")
        .replace("{age}", formatNumber(ageLimit, lang))
        .replace("{minutes}", formatNumber(floorMinutes, lang))
        .replace("{share}", percent(floorShare)),
    },
    {
      title: t("pepites.method.score_title"),
      body: t("pepites.method.score_body")
        .replace("{rating}", weight("rating", 0.3))
        .replace("{form}", weight("form", 0.2))
        .replace("{contribution}", weight("contribution", 0.2))
        .replace("{progression}", weight("progression", 0.15))
        .replace("{minutes}", weight("minutes", 0.15)),
    },
    {
      title: t("pepites.method.inputs_title"),
      body: t("pepites.method.inputs_body")
        .replace("{rated}", formatNumber(minRated, lang))
        .replace("{window}", formatNumber(formWindow, lang)),
    },
    {
      title: t("pepites.method.contribution_title"),
      body: t("pepites.method.contribution_body"),
    },
    {
      title: t("pepites.method.top_title"),
      body: t("pepites.method.top_body").replace("{round}", formatNumber(firstRound, lang)),
    },
    {
      title: t("pepites.method.data_title"),
      body: t("pepites.method.data_body"),
    },
  ];

  return (
    <PepitesShell
      pageHeader={
        <PepitesPageTitle backTo="/pepites" title={t("pepites.method.title")}>
          <p className={cn(ui.text.meta, ui.tone.muted)}>{t("pepites.hero.kicker_short")}</p>
        </PepitesPageTitle>
      }
    >
      {data.preview ? <PepitesPreviewBanner /> : null}
      <UiCard testId="pepites-method">
        <div className="flex flex-col gap-4">
          <p className={ui.text.body}>
            {lang === "ar" ? methodology.descriptionAr : methodology.descriptionFr}
          </p>
          {sections.map((section) => (
            <section key={section.title} className="flex flex-col gap-1">
              <h2 className={ui.text.bodyStrong}>{section.title}</h2>
              <p className={cn(ui.text.meta, ui.tone.muted)}>{section.body}</p>
            </section>
          ))}
          <p className={cn(ui.text.micro, ui.tone.muted)}>
            {t("pepites.method.version").replace("{v}", methodology.version)}
          </p>
        </div>
      </UiCard>
      {coverage ? (
        <UiCard testId="pepites-coverage">
          <h2 className={cn(ui.text.bodyStrong, "mb-1")}>{t("pepites.coverage.title")}</h2>
          <p className={cn(ui.text.meta, ui.tone.muted, "mb-2")}>
            {t("pepites.coverage.as_of").replace("{round}", formatNumber(coverage.asOfRound, lang))}
          </p>
          <UiKeyValueRow
            className={COVERAGE_ROW}
            label={t("pepites.coverage.pool")}
            value={<bdi>{formatNumber(coverage.poolSize, lang)}</bdi>}
          />
          <UiKeyValueRow
            className={COVERAGE_ROW}
            label={t("pepites.coverage.ranked")}
            value={<bdi>{formatNumber(coverage.ranked, lang)}</bdi>}
          />
          <UiKeyValueRow
            className={COVERAGE_ROW}
            label={t("pepites.coverage.no_dob")}
            value={<bdi>{formatNumber(coverage.noDateOfBirth, lang)}</bdi>}
          />
          {coverage.ratingCoverage !== null ? (
            <UiKeyValueRow
              className={COVERAGE_ROW}
              label={t("pepites.coverage.rating")}
              value={<bdi>{percent(coverage.ratingCoverage)}</bdi>}
            />
          ) : null}
          {coverage.footCoverage !== null ? (
            <UiKeyValueRow
              className={COVERAGE_ROW}
              label={t("pepites.coverage.foot")}
              value={<bdi>{percent(coverage.footCoverage)}</bdi>}
            />
          ) : null}
          {coverage.heightCoverage !== null ? (
            <UiKeyValueRow
              className={COVERAGE_ROW}
              label={t("pepites.coverage.height")}
              value={<bdi>{percent(coverage.heightCoverage)}</bdi>}
            />
          ) : null}
        </UiCard>
      ) : null}
    </PepitesShell>
  );
}
