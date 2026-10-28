import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { PlusPage } from "@/components/plus/PlusPage";
import { frCore as fr } from "@/i18n/dictionary-fr-core";
import { loadFrSectionsForPath } from "@/i18n/fr-sections";
import { useI18n } from "@/i18n/provider";
import { shouldRedirectFromPlus } from "@/lib/premium-gate";

/**
 * `/plus`: the BotolaGO+ paywall on its own (the same screen as `/curva/plus`). Behind `PREMIUM_BUILD`
 * (`src/lib/feature-flags.ts`): while the build switch is off the address goes Home before any
 * component runs. Never indexed.
 */
export const Route = createFileRoute("/plus")({
  beforeLoad: () => {
    if (shouldRedirectFromPlus()) throw redirect({ to: "/", replace: true });
  },
  // The French copy of this section (`src/i18n/fr-sections.ts`), loaded before the page renders.
  loader: ({ location }) => loadFrSectionsForPath(location.pathname),
  head: () => ({
    meta: [
      { title: fr["plus.meta.offer"] },
      { name: "description", content: fr["plus.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: PlusRoute,
});

function PlusRoute() {
  const { t } = useI18n();
  const title = t("plus.meta.offer");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <PlusPage />;
}
