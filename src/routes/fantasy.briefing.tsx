import { createFileRoute, redirect } from "@tanstack/react-router";
import { useEffect } from "react";

import { FantasyFrame } from "@/components/fpl/FantasyFrame";
import { PlusBriefingScreen } from "@/components/plus/PlusBriefing";
import { useI18n } from "@/i18n/provider";
import { fantasyHead } from "@/lib/fantasy-meta";
import { shouldRedirectFromPlus } from "@/lib/premium-gate";

/**
 * `/fantasy/briefing`: BotolaGO+ « Briefing avant la deadline »
 * (docs/product/botolago-plus-deadline-briefing-brief.md). Behind `PREMIUM_BUILD`
 * (`src/lib/feature-flags.ts`): while the build switch is off the address goes back to Fantasy
 * before any component runs, and while the database mode is off the screen renders nothing and
 * asks for nothing. Personal and never indexed.
 */
export const Route = createFileRoute("/fantasy/briefing")({
  beforeLoad: () => {
    if (shouldRedirectFromPlus()) throw redirect({ to: "/fantasy", replace: true });
  },
  head: () => fantasyHead("briefing"),
  component: BriefingRoute,
});

function BriefingRoute() {
  const { t } = useI18n();
  const title = t("plus.brief.meta");
  // `head()` has no reader language; the reader's own title is set after mount.
  useEffect(() => {
    if (typeof window !== "undefined") window.document.title = title;
  }, [title]);
  return (
    <FantasyFrame bottomNav>
      <PlusBriefingScreen />
    </FantasyFrame>
  );
}
