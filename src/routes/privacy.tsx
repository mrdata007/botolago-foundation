import { createFileRoute } from "@tanstack/react-router";

import { LegalRoutePage } from "@/components/legal/LegalRoutePage";
import { fr } from "@/i18n/dictionary-fr";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}/privacy`;

/**
 * `/privacy` — public, no auth gate. See `terms.tsx` for why `head()` reads the
 * French dictionary entries and the reader's language is applied after mount.
 */
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: fr["legal.privacy.meta_title"] },
      { name: "description", content: fr["legal.privacy.meta_description"] },
      { property: "og:title", content: fr["legal.privacy.meta_title"] },
      { property: "og:description", content: fr["legal.privacy.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: fr["legal.privacy.meta_title"] },
      { name: "twitter:description", content: fr["legal.privacy.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return <LegalRoutePage document="privacy" />;
}
