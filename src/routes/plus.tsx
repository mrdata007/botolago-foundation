import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { PlusPage } from "@/components/plus/PlusPage";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { shouldRedirectFromPlus } from "@/lib/premium-gate";

/**
 * `/plus`: the BotolaGO+ paywall on its own (screen 3 of the offer). Behind `PREMIUM_BUILD`
 * (`src/lib/feature-flags.ts`): while the build switch is off the address goes Home before any
 * component runs. Never indexed.
 */
export const Route = createFileRoute("/plus")({
  beforeLoad: () => {
    if (shouldRedirectFromPlus()) throw redirect({ to: "/", replace: true });
  },
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
