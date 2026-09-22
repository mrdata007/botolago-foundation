import { createFileRoute } from "@tanstack/react-router";

import { LegalRoutePage } from "@/components/legal/LegalRoutePage";
import { dictionaries } from "@/i18n/dictionaries";

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
    ],
  }),
  component: PrivacyRoute,
});

function PrivacyRoute() {
  return <LegalRoutePage document="privacy" />;
}
