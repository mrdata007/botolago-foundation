import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { PepitesHome } from "@/components/pepites/PepitesHome";
import {
  loadPepitesHome,
  pepitesPageHeaders,
  pepitesRobotsMeta,
} from "@/components/pepites/pepites-route";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

/** A link preview cannot know its reader's language: the shared title carries both. */
const OG_TITLE = "Pépites · توب 10 — BotolaGO";
const CANONICAL = `${PUBLIC_SITE_ORIGIN}/pepites`;

export const Route = createFileRoute("/pepites/")({
  // The current Top 10 is in the server's HTML, read as an anonymous reader
  // (`loadPepitesHome`); a staff preview only ever loads in the browser.
  loader: {
    staleReloadMode: "blocking",
    handler: ({ context }) => loadPepitesHome(context.queryClient),
  },
  headers: ({ loaderData }) => pepitesPageHeaders(loaderData),
  head: ({ loaderData }) => ({
    meta: [
      { title: fr["pepites.meta_title"] },
      { name: "description", content: fr["pepites.meta_description"] },
      ...pepitesRobotsMeta(loaderData),
      { property: "og:type", content: "website" },
      { property: "og:title", content: OG_TITLE },
      { property: "og:description", content: fr["pepites.meta_description"] },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: OG_TITLE },
      { name: "twitter:description", content: fr["pepites.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PepitesIndexRoute,
});

function PepitesIndexRoute() {
  const { t } = useI18n();
  const title = t("pepites.meta_title");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <PepitesHome />;
}
