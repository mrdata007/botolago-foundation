import { createFileRoute } from "@tanstack/react-router";

import { LegalRoutePage } from "@/components/legal/LegalRoutePage";
import { dictionaries } from "@/i18n/dictionaries";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

const PRIVACY_URL = `${PUBLIC_SITE_ORIGIN}/privacy`;

/**
 * `/privacy` — public, no auth gate. See `terms.tsx` for why `head()` reads the
 * French dictionary entries and the reader's language is applied after mount.
 */
export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: dictionaries.fr["legal.privacy.meta_title"] },
      { name: "description", content: dictionaries.fr["legal.privacy.meta_description"] },
      { property: "og:title", content: dictionaries.fr["legal.privacy.meta_title"] },
      { property: "og:description", content: dictionaries.fr["legal.privacy.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: PRIVACY_URL },
    ],
    links: [{ rel: "canonical", href: PRIVACY_URL }],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return <LegalRoutePage document="privacy" />;
}
