import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { CurvaPlusPage } from "@/components/plus/PlusPage";
import { clampContext, clampStep, type PlusContext } from "@/components/plus/plus-steps";
import { frCore as fr } from "@/i18n/dictionary-fr-core";
import { useI18n } from "@/i18n/provider";
import { shouldRedirectFromPlus } from "@/lib/premium-gate";

/**
 * `/curva/plus`: the BotolaGO+ offer (docs/product/botolago-plus-screens-brief.md,
 * docs/product/botolago-plus-offer-flow-brief.md). Without a `step` it is the short paywall;
 * `?step=1..2` is the preview story, `?step=3` the offer again, `?step=5` the payment, `?step=4` the welcome.
 * `?via=season|duel|career|editions` says what the reader was looking at.
 * Behind `PREMIUM_BUILD` (`src/lib/feature-flags.ts`) and behind the Curva layout's own guard:
 * while the build switch is off the address goes back to Curva before any component runs. Never
 * indexed. Screen 4 shows only to a member; a member never sees the others.
 */
export const Route = createFileRoute("/curva/plus")({
  beforeLoad: () => {
    if (shouldRedirectFromPlus()) throw redirect({ to: "/curva", replace: true });
  },
  validateSearch: (
    search: Record<string, unknown>,
  ): { step?: 1 | 2 | 3 | 4 | 5; via?: PlusContext } => {
    const step = Number(search.step);
    const via = clampContext(search.via);
    return {
      ...(Number.isInteger(step) && step >= 1 && step <= 5 ? { step: clampStep(step) } : {}),
      ...(via ? { via } : {}),
    };
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
  const { step, via } = Route.useSearch();
  const title = t("plus.meta.offer");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return <CurvaPlusPage step={step} via={via} />;
}
