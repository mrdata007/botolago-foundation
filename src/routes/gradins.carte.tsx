import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { GradinsCardPage } from "@/components/gradins/GradinsCardPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/gradins/carte")({
  head: () => ({
    meta: [
      { title: fr["gradins.meta.card"] },
      { name: "description", content: fr["gradins.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GradinsCardRoute,
});

function GradinsCardRoute() {
  const { t } = useI18n();
  const title = t("gradins.meta.card");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <GradinsCardPage />;
}
