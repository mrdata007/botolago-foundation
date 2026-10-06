import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { DownloadPage } from "@/components/download/DownloadPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { DOWNLOAD_PAGE_PATH } from "@/lib/app-download";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}${DOWNLOAD_PAGE_PATH}`;

/**
 * `/telecharger`: where a browser visitor gets the phone app, with the QR
 * code, the App Store badge and the Google Play badge
 * (`src/components/download/`). The QR code's own address, `/app`, sends a
 * phone straight to its store and anyone else here.
 */
export const Route = createFileRoute("/telecharger")({
  head: () => ({
    meta: [
      { title: fr["download.meta_title"] },
      { name: "description", content: fr["download.meta_description"] },
      { property: "og:title", content: fr["download.meta_title"] },
      { property: "og:description", content: fr["download.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fr["download.meta_title"] },
      { name: "twitter:description", content: fr["download.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: TelechargerRoute,
});

function TelechargerRoute() {
  const { t } = useI18n();
  const title = t("download.meta_title");
  // `head()` runs without the reader's language, so it carries the French
  // title; the reader's own is applied after mount, as /jouer does.
  useEffect(() => {
    window.document.title = title;
  }, [title]);
  return <DownloadPage />;
}
