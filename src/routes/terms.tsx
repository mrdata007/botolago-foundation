import { createFileRoute } from "@tanstack/react-router";

import { LegalRoutePage } from "@/components/legal/LegalRoutePage";
import { dictionaries } from "@/i18n/dictionaries";
import { PUBLIC_SITE_ORIGIN } from "@/lib/article-meta";

const TERMS_URL = `${PUBLIC_SITE_ORIGIN}/terms`;

/**
 * `/terms` — public, no auth gate.
 *
 * The metadata is kept in the dictionary rather than inlined here, so the two
 * languages stay side by side with the rest of the copy. `head()` reads the
 * French entries directly: it runs before React, with no i18n context, and the
 * server always renders `fr` (see `I18nProvider`), so French is the honest SSR
 * default. `LegalRoutePage` re-applies the title and description in the
 * reader's own language once it has mounted and can see `useI18n()`.
 */
export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: dictionaries.fr["legal.terms.meta_title"] },
      { name: "description", content: dictionaries.fr["legal.terms.meta_description"] },
      { property: "og:title", content: dictionaries.fr["legal.terms.meta_title"] },
      { property: "og:description", content: dictionaries.fr["legal.terms.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:url", content: TERMS_URL },
    ],
    links: [{ rel: "canonical", href: TERMS_URL }],
  }),
  component: TermsRoute,
});

function TermsRoute() {
  return <LegalRoutePage document="terms" />;
}
