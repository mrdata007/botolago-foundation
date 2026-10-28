import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaRankingPage } from "@/components/curva-ranking/CurvaRankingPage";
import { frCore as fr } from "@/i18n/dictionary-fr-core";
import { useI18n } from "@/i18n/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?vue=tous`: the managers of the overall board; without it the chosen league. `?ligue=<id>`: which league. */
interface RankingSearch {
  vue?: "tous";
  ligue?: string;
}

export const Route = createFileRoute("/curva/classement")({
  validateSearch: (search: Record<string, unknown>): RankingSearch => ({
    ...(search.vue === "tous" ? { vue: "tous" as const } : {}),
    ...(typeof search.ligue === "string" && UUID.test(search.ligue) ? { ligue: search.ligue } : {}),
  }),
  head: () => ({
    meta: [
      { title: fr["curva_ranking.meta"] },
      { name: "description", content: fr["curva.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurvaRankingRoute,
});

function CurvaRankingRoute() {
  const { t } = useI18n();
  const title = t("curva_ranking.meta");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaRankingPage />;
}
