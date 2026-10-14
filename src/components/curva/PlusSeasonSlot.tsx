import { PlusSeasonSection } from "@/components/plus/PlusSeasonSection";
import { usePlusAccess } from "@/components/plus/plus-access";

import { useCurvaPeople } from "./use-curva-people";

/**
 * Curva's card page, « Votre saison » (BotolaGO+). Decides what the reader sees and hands the
 * section the real standing the free screens already load:
 *   - feature off: null, before any hook that would ask the league for anything;
 *   - member: the section reads the member's own career;
 *   - everyone else: the league's standing (total points, position) goes clear on top of the
 *     blurred example. The paid reads are not made.
 */
export function PlusSeasonSlot() {
  const access = usePlusAccess();
  if (access === "off") return null;
  if (access === "member") return <PlusSeasonSection access="member" />;
  return <LockedSlot />;
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
