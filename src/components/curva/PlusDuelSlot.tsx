import { PlusDuelSection, type DuelSide } from "@/components/plus/PlusDuelSection";
import { usePlusAccess } from "@/components/plus/plus-access";

import type { PeopleRow } from "./people";

const sideOf = (row: PeopleRow): DuelSide => ({
  name: row.name,
  totalScore: row.standing.totalScore,
  rank: row.standing.rank,
});

/**
 * The face-à-face sheet, « Détail du duel » (BotolaGO+). `mineRow` is the reader's own row in the
 * league and `row` the league mate's; both come from the standings the free screens already load.
 * Feature off: null. Everyone else but a member gets the real points and positions clear above the
 * blurred example, with no paid read; a member gets the duel read.
 */
export function PlusDuelSlot({
  mineRow,
  row,
  size,
}: {
  mineRow: PeopleRow | null;
  row: PeopleRow;
  size: number;
}) {
  const access = usePlusAccess();
  if (access === "off") return null;
  return (
    <PlusDuelSection
      access={access}
      mine={mineRow ? sideOf(mineRow) : null}
      other={sideOf(row)}
      otherTeamId={row.standing.managerId}
      size={size}
    />
  );
}
