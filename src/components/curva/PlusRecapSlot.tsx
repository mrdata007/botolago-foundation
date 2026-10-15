import { PlusRecapSection } from "@/components/plus/PlusRecapSection";
import { usePlusAccess } from "@/components/plus/plus-access";

import { useCurvaPeople } from "./use-curva-people";

/**
 * Curva's card page, « Votre journée expliquée » (BotolaGO+). Decides what the reader sees and hands
 * the section what the free screens already load:
 *   - feature off: null, before any hook that would ask the league for anything;
 *   - member: the section reads the member's own journée against the league the page shows;
 *   - everyone else: the league's standing (total points, position) goes clear on top of the blurred
 *     example. The paid read is not made.
 */
export function PlusRecapSlot() {
  const access = usePlusAccess();
  if (access === "off") return null;
  return <Slot access={access} />;
}

function Slot({ access }: { access: "locked" | "member" }) {
  const people = useCurvaPeople(true);
  const own = people.rows.find((row) => row.own) ?? null;
  const standing =
    own && !people.standingsPending
      ? { totalScore: own.standing.totalScore, rank: own.standing.rank, size: people.rows.length }
      : null;
  return (
    <PlusRecapSection
      access={access}
      standing={standing}
      leagueId={people.league?.id ?? null}
      leaguePending={people.leaguesPending}
      teamName={own?.name ?? null}
    />
  );
}
