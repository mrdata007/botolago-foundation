import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PepitesRanking } from "@/components/pepites/PepitesRanking";
import {
  pepitesPageHeaders,
  pepitesRobotsMeta,
  pointerCache,
  prefetchPointer,
  rankingFiltersFromSearch,
  rankingSearchFromFilters,
  validateRankingSearch,
} from "@/components/pepites/pepites-route";
import { rankingPagesOptions } from "@/components/pepites/use-pepites";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { isServerRender, prefetchFirstPageForSsr, ssrAvailability } from "@/lib/ssr-prefetch";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}/pepites/classement`;

export const Route = createFileRoute("/pepites/classement")({
  validateSearch: validateRankingSearch,
  loaderDeps: ({ search }) => rankingFiltersFromSearch(search),
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ context, deps }) => {
      if (!isServerRender()) return null;
      const { queryClient } = context;
      const pointer = await prefetchPointer(queryClient);
      if (pointer?.available && pointer.version) {
        await prefetchFirstPageForSsr(
          queryClient,
          rankingPagesOptions("anon", {
            version: pointer.version,
            position: deps.position,
            maxAge: deps.maxAge,
            teamId: null,
            sort: deps.sort,
            limit: 20,
          }),
        );
      }
      return ssrAvailability(queryClient) ?? { cache: pointerCache(pointer) };
    },
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: ({ loaderData }) => ({
    meta: [
      { title: fr["pepites.ranking.meta_title"] },
      { name: "description", content: fr["pepites.ranking.meta_description"] },
      ...pepitesRobotsMeta(loaderData),
      { property: "og:type", content: "website" },
      { property: "og:title", content: fr["pepites.ranking.meta_title"] },
      { property: "og:description", content: fr["pepites.ranking.meta_description"] },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PepitesRankingRoute,
});

function PepitesRankingRoute() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const navigate = useNavigate({ from: "/pepites/classement" });
  const title = t("pepites.ranking.meta_title");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return (
    <PepitesRanking
      filters={rankingFiltersFromSearch(search)}
      onFiltersChange={(next) =>
        void navigate({ search: rankingSearchFromFilters(next), replace: true })
      }
    />
  );
}
