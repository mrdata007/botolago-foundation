import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import type { MethodologyResponse } from "@/backend/pepites/contracts";
import { PepitesMethodPage } from "@/components/pepites/PepitesMethodPage";
import {
  isPublicAnswer,
  pepitesPageHeaders,
  pepitesRobotsMeta,
} from "@/components/pepites/pepites-route";
import { methodologyQueryOptions } from "@/components/pepites/use-pepites";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { isServerRender, prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}/pepites/methode`;

export const Route = createFileRoute("/pepites/methode")({
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ context }) => {
      if (!isServerRender()) return null;
      const { queryClient } = context;
      const options = methodologyQueryOptions("anon");
      await prefetchForSsr(queryClient, [{ queryKey: options.queryKey, queryFn: options.queryFn }]);
      const methodology = queryClient.getQueryData<MethodologyResponse>(options.queryKey);
      return (
        ssrAvailability(queryClient) ?? {
          cache: isPublicAnswer(methodology) ? ("current" as const) : ("private" as const),
        }
      );
    },
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: ({ loaderData }) => ({
    meta: [
      { title: fr["pepites.method.meta_title"] },
      { name: "description", content: fr["pepites.method.meta_description"] },
      ...pepitesRobotsMeta(loaderData),
      { property: "og:type", content: "website" },
      { property: "og:title", content: fr["pepites.method.meta_title"] },
      { property: "og:url", content: CANONICAL },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PepitesMethodRoute,
});

function PepitesMethodRoute() {
  const { t } = useI18n();
  const title = t("pepites.method.meta_title");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <PepitesMethodPage />;
}
