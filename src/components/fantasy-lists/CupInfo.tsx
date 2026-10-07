import type { ReactNode } from "react";

import { ui, UiCard } from "@/components/ui-kit";
import { useI18n } from "@/i18n/provider";
import { cn } from "@/lib/utils";

/**
 * The cup explainer, shared by the Leagues & Cups page and a league's Cup
 * tab: why this manager is not in a cup yet, how a cup round is decided, and
 * the three tiebreaks. `lead` is an optional line above it (the league page's
 * "the cup starts in gameweek N").
 */
export function CupInfo({ lead }: { lead?: ReactNode }) {
  const { t } = useI18n();
  return (
    <UiCard>
      {lead ? <div className="mb-3">{lead}</div> : null}
      <p className={cn(ui.text.bodyStrong, ui.tone.default)}>{t("fpl.cup_not_qualified")}</p>
      <h2 className={cn("mt-4", ui.display.section, ui.tone.default)}>{t("fpl.cup_how_title")}</h2>
      <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("fpl.cup_how_body")}</p>
      <p className={cn("mt-2", ui.text.secondary, ui.tone.muted)}>{t("fpl.cup_tiebreak")}</p>
      {/* The items carry their own numbers ("1. …"), so no list markers. */}
      <ul className={cn("mt-1 space-y-0.5", ui.text.secondary, ui.tone.muted)}>
        <li>{t("fpl.cup_tb1")}</li>
        <li>{t("fpl.cup_tb2")}</li>
        <li>{t("fpl.cup_tb3")}</li>
      </ul>
    </UiCard>
  );
}
