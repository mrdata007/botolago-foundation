import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { LegalDocumentView } from "@/components/legal/LegalDocumentView";
import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { ui, UiHeader } from "@/components/ui-kit";
import { PRIZE_TERMS } from "@/content/legal/prize-terms";
import { fr } from "@/i18n/dictionary-fr";
import { useI18n } from "@/i18n/provider";
import { PRIZES_ENABLED } from "@/lib/feature-flags";
import { PUBLIC_SITE_ORIGIN } from "@/lib/site-origin";
import { cn } from "@/lib/utils";

const CANONICAL = `${PUBLIC_SITE_ORIGIN}/prizes/terms`;

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
      { title: fr["prizes.terms.meta_title"] },
      { name: "description", content: fr["prizes.terms.meta_description"] },
      { property: "og:type", content: "website" },
      { property: "og:title", content: fr["prizes.terms.meta_title"] },
      { property: "og:description", content: fr["prizes.terms.meta_description"] },
      { property: "og:url", content: CANONICAL },
      { name: "twitter:card", content: "summary" },
      { name: "twitter:title", content: fr["prizes.terms.meta_title"] },
      { name: "twitter:description", content: fr["prizes.terms.meta_description"] },
    ],
    links: [{ rel: "canonical", href: CANONICAL }],
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
      {/* The document below owns the page's h1. Keeping only the section
          kicker here prevents two h1s on the same URL. */}
      <UiHeader kicker={t("prizes.title")} backTo="/prizes" />
      <div className={cn("grid gap-4 pt-4", ui.space.gutter)}>
        <LegalDocumentView doc={PRIZE_TERMS[lang]} tableScrollHint={t("legal.table_scroll_hint")} />
      </div>
    </FantasyFrame>
  );
}
