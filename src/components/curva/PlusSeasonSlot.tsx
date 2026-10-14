import { PlusSeasonSection } from "@/components/plus/PlusSeasonSection";
import { usePlusAccess } from "@/components/plus/plus-access";

import { useCurvaPeople } from "./use-curva-people";

/**
 * Curva's card page, « Votre saison » (BotolaGO+). Decides what the reader sees and hands the
 * section the real standing the free screens already load:
 *   - feature off: null, before any hook that would ask the league for anything;
 *   - member: the section reads the member's own career and, for the league the page shows, the
 *     league's figures;
 *   - everyone else: the league's standing (total points, position) goes clear on top of the
 *     blurred example. The paid reads are not made.
 */
export function PlusSeasonSlot() {
  const access = usePlusAccess();
  if (access === "off") return null;
  if (access === "member") return <MemberSlot />;
  return <LockedSlot />;
}

/** The league the card page shows (the one this phone remembered, else the first) names the league figures. */
function MemberSlot() {
  const people = useCurvaPeople(true);
  return (
    <PlusSeasonSection
      access="member"
      leagueId={people.league?.id ?? null}
      leaguePending={people.leaguesPending}
    />
  );
}

function LockedSlot() {
  const people = useCurvaPeople(true);
  const own = people.rows.find((row) => row.own) ?? null;
  const standing =
    own && !people.standingsPending
      ? {
          totalScore: own.standing.totalScore,
          rank: own.standing.rank,
          size: people.rows.length,
        }
      : null;
  return <PlusSeasonSection access="locked" standing={standing} />;
}
