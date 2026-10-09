import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { GradinsSeasonsPage } from "@/components/gradins/GradinsSeasonsPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?saison=<season id>`: the season the page shows; the current one without it. */
interface SeasonsSearch {
  saison?: string;
}

export const Route = createFileRoute("/gradins/saisons")({
  validateSearch: (search: Record<string, unknown>): SeasonsSearch => ({
    ...(typeof search.saison === "string" && UUID.test(search.saison)
      ? { saison: search.saison }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: fr["gradins.meta.seasons"] },
      { name: "description", content: fr["gradins.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GradinsSeasonsRoute,
});

function GradinsSeasonsRoute() {
  const { t } = useI18n();
  const title = t("gradins.meta.seasons");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <GradinsSeasonsPage />;
}
