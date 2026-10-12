import { useMemo } from "react";

import { fillText } from "@/components/manager-card/interpolate";
import type { Translate } from "@/components/manager-card/copy";
import { useI18n } from "@/i18n/provider";

/**
 * The ranking screen's words. Every key is read by a literal call of the translate function, here and nowhere else,
 * so the i18n gate's counts stay exact. A value with `{placeholders}` is filled with `fillText`
 * (numbers isolated for Arabic).
 */
export function rankingCopy(t: Translate) {
  return {
    meta: t("curva_ranking.meta"),
    title: t("curva_ranking.title"),
    linkTitle: t("curva_ranking.link.title"),
    linkBody: t("curva_ranking.link.body"),
    viewLabel: t("curva_ranking.view.label"),
    viewLeague: t("curva_ranking.view.league"),
    viewAll: t("curva_ranking.view.all"),
    leaguesLabel: t("curva_ranking.leagues.label"),
    allNote: (n: number) => fillText(t("curva_ranking.all.note"), { n }),
    ratedTitle: t("curva_ranking.rated.title"),
    unratedTitle: t("curva_ranking.unrated.title"),
    unratedHint: t("curva_ranking.unrated.hint"),
    unratedStats: (k: number, n: number) => fillText(t("curva_ranking.unrated.stats"), { k, n }),
    unratedForming: (k: number, n: number) =>
      fillText(t("curva_ranking.unrated.forming"), { k, n }),
    noneRated: t("curva_ranking.none_rated"),
    emptyNoLeague: t("curva_ranking.empty.no_league"),
    emptyAll: t("curva_ranking.empty.all"),
    off: t("curva_ranking.off"),
    backToCurva: t("curva_ranking.back"),
    rankA11y: (n: number) => fillText(t("curva_ranking.rank_a11y"), { n }),
  };
}

export type RankingCopy = ReturnType<typeof rankingCopy>;

export function useRankingCopy(): RankingCopy {
  const { t } = useI18n();
  return useMemo(() => rankingCopy(t), [t]);
}
