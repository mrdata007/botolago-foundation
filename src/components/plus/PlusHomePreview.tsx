import { Link } from "@tanstack/react-router";
import { ChevronRight } from "lucide-react";

import { LockedStage, PlusEmbed } from "./PlusLockedSection";
import { SEASON_SECTION_ID } from "./PlusSeasonSection";
import { PlusLockChip } from "./PlusLockChip";
import { usePlusAccess } from "./plus-access";
import { usePlusCopy } from "./plus-copy";
import { CumChart } from "./plus-season-charts";
import { EXAMPLE_VIEW } from "./plus-season-context";
import { useSeasonFmt } from "./plus-season-fmt";

/**
 * Curva's home: ONE small blurred preview (the points race, drawn from the example season) that
 * opens « Votre saison » on the card page. Shown to a non-member only: a member has the section
 * itself on the card page, and with the feature off nothing renders.
 */
export function PlusHomePreview() {
  const access = usePlusAccess();
  if (access !== "locked") return null;
  return <PlusHomePreviewView />;
}

export function PlusHomePreviewView() {
  const { t } = usePlusCopy();
  const { jAxis } = useSeasonFmt();
  const S = EXAMPLE_VIEW.S;
  return (
    <PlusEmbed className="plus-embed--preview" data-testid="plus-home-preview">
      <Link
        to="/curva/carte"
        hash={SEASON_SECTION_ID}
        className="pl-preview"
        data-testid="plus-home-preview-link"
      >
        <LockedStage
          compact
          lock={
            <>
              <PlusLockChip />
              <span className="pl-headline">{t("plus.in.season_title")}</span>
              <span className="pl-go" aria-hidden>
                <ChevronRight />
              </span>
            </>
          }
        >
          <CumChart a={S.cumYou} b={S.cumLeague} bKind="ref" jAxis={jAxis} label="" />
        </LockedStage>
      </Link>
    </PlusEmbed>
  );
}
