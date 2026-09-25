import { createFileRoute } from "@tanstack/react-router";

import { LegalRoutePage } from "@/components/legal/LegalRoutePage";
import { fr } from "@/i18n/dictionary-fr";

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
    ],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return <LegalRoutePage document="privacy" />;
}
