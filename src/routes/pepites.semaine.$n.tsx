import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect } from "react";

import type { EditionResponse } from "@/backend/pepites/contracts";
import { PepitesEditionPage } from "@/components/pepites/PepitesEditionPage";
import {
  isPublicAnswer,
  parseWeek,
  pepitesPageHeaders,
  pepitesRobots,
} from "@/components/pepites/pepites-route";
import { editionQueryOptions } from "@/components/pepites/use-pepites";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { isServerRender, prefetchForSsr, ssrAvailability } from "@/lib/ssr-prefetch";

export const Route = createFileRoute("/pepites/semaine/$n")({
  beforeLoad: ({ params }) => {
    if (parseWeek(params.n) === null) throw notFound();
  },
  loader: {
    staleReloadMode: "blocking",
    handler: async ({ context, params }) => {
      if (!isServerRender()) return null;
      const week = parseWeek(params.n)!;
      const { queryClient } = context;
      const options = editionQueryOptions("anon", null, week);
      await prefetchForSsr(queryClient, [{ queryKey: options.queryKey, queryFn: options.queryFn }]);
      const edition = queryClient.getQueryData<EditionResponse>(options.queryKey);
      if (edition?.available && !edition.found) throw notFound();
      const unavailable = ssrAvailability(queryClient);
      if (unavailable) return unavailable;
      // A published week never changes while it is public (§7): 5 minutes.
      return { cache: isPublicAnswer(edition) ? ("edition" as const) : ("private" as const) };
    },
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: ({ loaderData, params }) => {
    const title = fr["pepites.edition.meta_title"].replace("{n}", params.n);
    const url = `${PUBLIC_SITE_ORIGIN}/pepites/semaine/${params.n}`;
    return {
      meta: [
        { title },
        { name: "description", content: fr["pepites.meta_description"] },
        { name: "robots", content: pepitesRobots(loaderData) },
        { property: "og:type", content: "website" },
        { property: "og:title", content: title },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
    };
  },
  component: PepitesWeekRoute,
});

function PepitesWeekRoute() {
  const { t } = useI18n();
  const { n } = Route.useParams();
  const week = parseWeek(n) ?? 1;
  const title = t("pepites.edition.meta_title").replace("{n}", String(week));
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <PepitesEditionPage week={week} />;
}
