import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaSeasonsPage } from "@/components/curva/CurvaSeasonsPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?saison=<season id>`: the season the page shows; the current one without it. */
interface SeasonsSearch {
  saison?: string;
}

export const Route = createFileRoute("/curva/saisons")({
  validateSearch: (search: Record<string, unknown>): SeasonsSearch => ({
    ...(typeof search.saison === "string" && UUID.test(search.saison)
      ? { saison: search.saison }
      : {}),
  }),
  head: () => ({
    meta: [
      { title: fr["curva.meta.seasons"] },
      { name: "description", content: fr["curva.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurvaSeasonsRoute,
});

function CurvaSeasonsRoute() {
  const { t } = useI18n();
  const title = t("curva.meta.seasons");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaSeasonsPage />;
}
