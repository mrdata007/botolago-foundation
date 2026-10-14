import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaPlusPage } from "@/components/plus/PlusPage";
import { clampStep } from "@/components/plus/plus-steps";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { shouldRedirectFromPlus } from "@/lib/premium-gate";

/**
 * `/curva/plus`: the BotolaGO+ offer in four screens (docs/product/botolago-plus-screens-brief.md).
 * Behind `PREMIUM_BUILD` (`src/lib/feature-flags.ts`) and behind the Curva layout's own guard:
 * while the build switch is off the address goes back to Curva before any component runs. Never
 * indexed. `?step=1..4` opens a screen; 4 shows only to a member.
 */
export const Route = createFileRoute("/curva/plus")({
  beforeLoad: () => {
    if (shouldRedirectFromPlus()) throw redirect({ to: "/curva", replace: true });
  },
  validateSearch: (search: Record<string, unknown>): { step?: 1 | 2 | 3 | 4 } => {
    const step = Number(search.step);
    return Number.isInteger(step) && step >= 1 && step <= 4 ? { step: clampStep(step) } : {};
  },
  head: () => ({
    meta: [
      { title: fr["plus.meta.offer"] },
      { name: "description", content: fr["plus.meta.description"] },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: CurvaPlusRoute,
});

function CurvaPlusRoute() {
  const { t } = useI18n();
  const { step } = Route.useSearch();
  const title = t("plus.meta.offer");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaPlusPage step={step} />;
}
