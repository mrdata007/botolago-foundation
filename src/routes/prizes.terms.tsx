import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiHeader } from "@/components/ui-kit";
import { PRIZE_TERMS } from "@/content/legal/prize-terms";
import { dictionaries } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { PRIZES_ENABLED } from "@/lib/feature-flags";
import { cn } from "@/lib/utils";

/**
 * `/prizes/terms`: the prize rules (`src/content/legal/prize-terms.ts`). The
 * production build refuses to run while the prize pages are on and the text
 * carries an unfilled `[…]` span, and this page redirects to the hub while they
 * are off.
 */
export const Route = createFileRoute("/prizes/terms")({
  beforeLoad: () => {
    if (!PRIZES_ENABLED) throw redirect({ to: "/fantasy", replace: true });
  },
  head: () => ({
    meta: [
      { title: dictionaries.fr["prizes.terms.meta_title"] },
      { name: "description", content: dictionaries.fr["prizes.terms.meta_description"] },
    ],
  }),
  component: PrizeTermsRoute,
});

function PrizeTermsRoute() {
  const { t, lang } = useI18n();
  const title = t("prizes.terms.meta_title");
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("prizes.title")} title={t("prizes.terms_link")} backTo="/prizes" />
      <div className={cn("grid gap-4 pt-4", ui.space.gutter)}>
        <LegalDocumentView doc={PRIZE_TERMS[lang]} tableScrollHint={t("legal.table_scroll_hint")} />
      </div>
    </FantasyFrame>
  );
}
