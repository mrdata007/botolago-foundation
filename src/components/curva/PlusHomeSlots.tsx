import { PlusHomeDuel, PlusHomeMember, PlusHomeSeason } from "@/components/plus/PlusHomeBlocks";
import type { DuelSide } from "@/components/plus/PlusDuelSection";
import { PlusRivals, type RivalsSide } from "@/components/plus/PlusRivals";
import { usePlusAccess } from "@/components/plus/plus-access";

import { closestRival, type PeopleRow } from "./people";
import type { CurvaPeople } from "./use-curva-people";

const sideOf = (row: PeopleRow): DuelSide => ({
  name: row.name,
  totalScore: row.standing.totalScore,
  rank: row.standing.rank,
});

/**
 * « Votre saison » on Curva's home, next to the card: what the reader sees depends on
 * `usePlusAccess()`. Off: nothing, no node and no request. A non-member: their real points and
 * position (the league standing the home already loads) clear over the blurred example. A member:
 * the real season, compact.
 */
export function PlusHomeSeasonSlot({ people }: { people: CurvaPeople }) {
  const access = usePlusAccess();
  if (access === "off") return null;
  const own = people.rows.find((row) => row.own) ?? null;
  const standing =
    own && !people.standingsPending
      ? { totalScore: own.standing.totalScore, rank: own.standing.rank, size: people.rows.length }
      : null;
  return (
    <PlusHomeSeason
      access={access}
      standing={standing}
      leagueId={people.league?.id ?? null}
      leaguePending={people.leaguesPending}
    />
  );
}

/**
 * « Votre duel » under the friends block: the closest rival of the league the home shows. Nothing
 * while the feature is off, while the league's table or cards are not in yet, or when the reader
 * has no league mate to be compared with.
 */
export function PlusHomeDuelSlot({ people }: { people: CurvaPeople }) {
  const access = usePlusAccess();
  if (access === "off" || people.standingsPending || people.standingsError) return null;
  const pair = closestRival(people.rows);
  if (!pair) return null;
  return (
    <PlusHomeDuel
      access={access}
      mine={sideOf(pair.mine)}
      other={sideOf(pair.rival)}
      otherTeamId={pair.rival.standing.managerId}
      size={people.rows.length}
      leagueId={people.league?.id ?? null}
    />
  );
}

/** The member's identity band and the card-style shortcut; nothing for anyone else. */
export function PlusHomeMemberSlot() {
  const access = usePlusAccess();
  if (access !== "member") return null;
  return <PlusHomeMember />;
}

/**
 * « Vos rivaux » under « Votre duel »: up to three friends of the reader's private leagues, one
 * poster each. Off: nothing, no node and no request. A non-member: their real points against their
 * closest league mate (the standings the home already loads) over the blurred example, and the
 * limits said plainly. A member: the posters. Nothing while the league's table is not in yet or the
 * reader is alone in it.
 */
export function PlusHomeRivalsSlot({ people }: { people: CurvaPeople }) {
  const access = usePlusAccess();
  if (access === "off" || people.standingsPending || people.standingsError) return null;
  const own = people.rows.find((row) => row.own) ?? null;
  if (!own || people.rows.length < 2) return null;
  const pair = closestRival(people.rows);
  const side = (row: PeopleRow): RivalsSide => ({
    name: row.name,
    totalScore: row.standing.totalScore,
    rank: row.standing.rank,
  });
  return (
    <PlusRivals
      access={access}
      mine={side(own)}
      closest={pair ? side(pair.rival) : null}
      size={people.rows.length}
    />
  );
}
