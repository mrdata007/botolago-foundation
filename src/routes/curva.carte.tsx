import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaCardPage } from "@/components/curva/CurvaCardPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/curva/carte")({
  head: () => ({
    meta: [
      { title: fr["curva.meta.card"] },
      { name: "description", content: fr["curva.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurvaCardRoute,
});

function CurvaCardRoute() {
  const { t } = useI18n();
  const title = t("curva.meta.card");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaCardPage />;
}
