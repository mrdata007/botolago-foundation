import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { PepitesReveal } from "@/components/pepites/PepitesReveal";
import { pepitesPageHeaders, validateRevealSearch } from "@/components/pepites/pepites-route";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

/**
 * `/pepites/revelation`: the published Top 10 as a story, N°10 to N°1
 * (Figma 06). Read in the browser only, never cached, never indexed: it
 * replays the current edition, which has its own page.
 */
export const Route = createFileRoute("/pepites/revelation")({
  validateSearch: validateRevealSearch,
  headers: () => pepitesPageHeaders(null),
  head: () => ({
    meta: [
      { title: fr["pepites.reveal.meta_title"] },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PepitesRevealRoute,
});

function PepitesRevealRoute() {
  const { t } = useI18n();
  const { n } = Route.useSearch();
  const title = t("pepites.reveal.meta_title");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <PepitesReveal rank={n ?? 10} />;
}
