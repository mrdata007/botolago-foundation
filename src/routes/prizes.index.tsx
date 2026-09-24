import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { PrizesPage } from "@/components/prizes/PrizesPage";
import { UiHeader } from "@/components/ui-kit";
import { dictionaries } from "@/i18n/dictionaries";
import { useI18n } from "@/i18n/provider";
import { PRIZES_ENABLED } from "@/lib/feature-flags";

/**
 * `/prizes`. While the prize pages are switched off (see `PRIZES_ENABLED`),
 * this redirects to the Fantasy hub before any loader or render runs, the way
 * `/news` redirects Home: nothing is fetched and nothing flashes.
 */
function redirectWhilePrizesAreHidden(): void {
  if (!PRIZES_ENABLED) throw redirect({ to: "/fantasy", replace: true });
}

export const Route = createFileRoute("/prizes/")({
  beforeLoad: redirectWhilePrizesAreHidden,
  head: () => ({
    meta: [
      { title: dictionaries.fr["prizes.meta_title"] },
      { name: "description", content: dictionaries.fr["prizes.meta_description"] },
      { property: "og:title", content: dictionaries.fr["prizes.meta_title"] },
      { property: "og:description", content: dictionaries.fr["prizes.meta_description"] },
    ],
  }),
  component: PrizesRoute,
});

function PrizesRoute() {
  const { t } = useI18n();
  const title = t("prizes.meta_title");
  // `head()` has no reader language (it runs at match time, server side too),
  // so it carries the French title; the reader's own is applied after mount,
  // as the legal pages do.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return (
    <FantasyFrame bottomNav>
      <UiHeader kicker={t("nav.fantasy")} title={t("prizes.title")} backTo="/fantasy" />
      <PrizesPage />
    </FantasyFrame>
  );
}
