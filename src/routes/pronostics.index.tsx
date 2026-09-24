import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";

import { PredictionsPage, type PredictionsTab } from "@/components/predictions/PredictionsPage";
import { roundQueryOptions } from "@/components/predictions/use-predictions-round";
import { dictionaries } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";
import { PRONOSTICS_PROMOTED } from "@/lib/feature-flags";

/**
 * A link preview cannot know its reader's language, so the shared title
 * carries both (plan §9). Not a dictionary key: it is the same in both
 * languages by design, and `head()` is French-only site-wide anyway.
 */
const OG_TITLE = "Pronostics · التوقعات — BotolaGO";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}/pronostics`;

interface PronosticsSearch {
  journee?: number;
  tab?: "classement" | "ligues";
}

function validatePronosticsSearch(search: Record<string, unknown>): PronosticsSearch {
  const journee = Number(search.journee);
  return {
    ...(Number.isInteger(journee) && journee >= 1 && journee <= 1000 ? { journee } : {}),
    ...(search.tab === "classement" || search.tab === "ligues" ? { tab: search.tab } : {}),
  };
}

export const Route = createFileRoute("/pronostics/")({
  validateSearch: validatePronosticsSearch,
  loaderDeps: ({ search }) => ({ journee: search.journee ?? null }),
  // The journée's matches are public: rendered on the server so a search
  // engine reads them. A player's own picks load on the phone, never here.
  //
  // No SSR bridge carries the query cache to the browser (see
  // matches.$matchId.tsx), so the journée travels as loader data and seeds the
  // page's query: the server's render and the browser's first are one tree.
  loader: async ({ context, deps }) => {
    try {
      const options = roundQueryOptions(deps.journee, "fr");
      const round = await context.queryClient.ensureQueryData(options);
      const fetchedAt =
        context.queryClient.getQueryState(options.queryKey)?.dataUpdatedAt || Date.now();
      return {
        round,
        fetchedAt,
        journee: deps.journee,
        indexable: round.allowed && round.mode === "public",
      };
    } catch {
      return null;
    }
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: dictionaries.fr["predictions.meta_title"] },
      { name: "description", content: dictionaries.fr["predictions.meta_description"] },
      // Indexed only once promoted AND open to everyone (plan §9).
      {
        name: "robots",
        content: PRONOSTICS_PROMOTED && loaderData?.indexable ? "index,follow" : "noindex",
      },
      { property: "og:type", content: "website" },
      { property: "og:title", content: OG_TITLE },
      { property: "og:description", content: dictionaries.fr["predictions.meta_description"] },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: OG_TITLE },
      { name: "twitter:description", content: dictionaries.fr["predictions.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PronosticsRoute,
});

function PronosticsRoute() {
  const { t } = useI18n();
  const search = Route.useSearch();
  const loaderData = Route.useLoaderData();
  const navigate = useNavigate({ from: "/pronostics/" });
  const title = t("predictions.meta_title");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  const tab: PredictionsTab =
    search.tab === "classement" ? "board" : search.tab === "ligues" ? "leagues" : "predict";
  return (
    <PredictionsPage
      roundNumber={search.journee ?? null}
      tab={tab}
      seed={
        loaderData && loaderData.journee === (search.journee ?? null)
          ? { data: loaderData.round, updatedAt: loaderData.fetchedAt }
          : undefined
      }
      onRoundChange={(journee) => void navigate({ search: (prev) => ({ ...prev, journee }) })}
      onTabChange={(next) =>
        void navigate({
          search: (prev) => ({
            ...prev,
            tab: next === "board" ? "classement" : next === "leagues" ? "ligues" : undefined,
          }),
        })
      }
    />
  );
}
