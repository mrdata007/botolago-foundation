import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { GradinsHome } from "@/components/gradins/GradinsHome";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";

export const Route = createFileRoute("/gradins/")({
  head: () => ({
    meta: [
      { title: fr["gradins.meta.home"] },
      { name: "description", content: fr["gradins.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: GradinsIndexRoute,
});

function GradinsIndexRoute() {
  const { t } = useI18n();
  const title = t("gradins.meta.home");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <GradinsHome />;
}
