import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaPeoplePage } from "@/components/curva/CurvaPeoplePage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** `?ligue=<league id>`: the private league the page shows; the remembered or first one without it. */
interface PeopleSearch {
  ligue?: string;
}

export const Route = createFileRoute("/curva/les-votres")({
  validateSearch: (search: Record<string, unknown>): PeopleSearch => ({
    ...(typeof search.ligue === "string" && UUID.test(search.ligue) ? { ligue: search.ligue } : {}),
  }),
  head: () => ({
    meta: [
      { title: fr["curva.meta.people"] },
      { name: "description", content: fr["curva.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurvaPeopleRoute,
});

function CurvaPeopleRoute() {
  const { t } = useI18n();
  const title = t("curva.meta.people");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaPeoplePage />;
}
