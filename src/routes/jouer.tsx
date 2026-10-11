import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

import { LandingPage } from "@/components/landing/LandingPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import { markWelcomeDone } from "@/lib/welcome";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}/jouer`;

/**
 * `/jouer`: the landing page's one address — the link a post, a bio or a
 * friend shares (`/` is Home for everyone, owner decision 2026-10-07). It is
 * shown to everyone, and its button adapts to whoever is reading (a manager
 * is offered their team, not a second one).
 */
export const Route = createFileRoute("/jouer")({
  head: () => ({
    meta: [
      { title: fr["landing.meta_title"] },
      { name: "description", content: fr["landing.meta_description"] },
      { property: "og:title", content: fr["landing.meta_title"] },
      { property: "og:description", content: fr["landing.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: fr["landing.meta_title"] },
      { name: "twitter:description", content: fr["landing.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: JouerRoute,
});

function JouerRoute() {
  const { t } = useI18n();
  const title = t("landing.meta_title");
  // `head()` runs without the reader's language, so it carries the French
  // title; the reader's own is applied after mount, as /prizes does.
  useEffect(() => {
    window.document.title = title;
  }, [title]);
  // Leaving by any link counts as the welcome (`@/lib/welcome`).
  return <LandingPage onLeave={markWelcomeDone} />;
}
