import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaHome } from "@/components/curva/CurvaHome";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

export const Route = createFileRoute("/curva/")({
  head: () => ({
    meta: [
      { title: fr["curva.meta.home"] },
      { name: "description", content: fr["curva.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${PUBLIC_SITE_ORIGIN}/curva` }],
  }),
  component: CurvaIndexRoute,
});

function CurvaIndexRoute() {
  const { t } = useI18n();
  const title = t("curva.meta.home");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaHome />;
}
