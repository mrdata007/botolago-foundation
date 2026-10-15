import type { RivalsSide } from "@/components/plus/PlusRivals";
import type { PlusAccess } from "@/components/plus/plus-access";

import { closestRival, type PeopleRow } from "./people";
import type { CurvaPeople } from "./use-curva-people";

/**
 * What the slot hands the section. The standings gate only the locked preview (the real pair over
 * the blur). The member board comes from the rivals read alone, which covers every shared private
 * league, so a solo selected league or a failed table must not hide it.
 */
export function rivalsSlotProps(
  access: PlusAccess,
  people: Pick<CurvaPeople, "rows" | "standingsPending" | "standingsError">,
): {
  access: PlusAccess;
  mine: RivalsSide | null;
  closest: RivalsSide | null;
  size: number;
} | null {
  if (access === "off") return null;
  const standingsReady = !people.standingsPending && !people.standingsError;
  const own = standingsReady ? (people.rows.find((row) => row.own) ?? null) : null;
  if (access === "locked" && (!own || people.rows.length < 2)) return null;
  const pair = own ? closestRival(people.rows) : null;
  const side = (row: PeopleRow): RivalsSide => ({
    name: row.name,
    totalScore: row.standing.totalScore,
    rank: row.standing.rank,
  });
  return {
    access,
    mine: own ? side(own) : null,
    closest: pair ? side(pair.rival) : null,
    size: standingsReady ? people.rows.length : 0,
  };
}
