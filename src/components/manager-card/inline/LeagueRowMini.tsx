import { createContext, useContext, useMemo, type ReactNode } from "react";

import type { MemberCardDto } from "@/backend/manager-card/contracts";
import { useManagerCards, useMyManagerCard } from "@/services/use-manager-card";

import { CardToken } from "../CardToken";
import { fromMember } from "../to-profile";

/** The batch read is at most 100 teams (plan 7.2). */
const MAX_TEAMS = 100;

export interface LeagueCards {
  /** Every card the batch read returned, by Fantasy team id. */
  byTeam: ReadonlyMap<string, MemberCardDto>;
  /** The reader's own Fantasy team id, so « new ratings » never names the reader. */
  ownTeamId: string | null;
  /** The latest journée the server has evaluated, from the reader's own card. */
  latestEvaluatedGameweek: number | null;
}

const LeagueCardsContext = createContext<LeagueCards | null>(null);

/** What the league page's card surfaces share, or null where the section is not live. */
export function useLeagueCards(): LeagueCards | null {
  return useContext(LeagueCardsContext);
}

/**
 * One batch read for a private league's rows, shared by the band, the minis and the compare
 * link (plan M5). With `enabled` false it is only a fragment: no hook runs, no request is made,
 * and the league page is what it was. The ids are the standings' team ids in the league's own
 * order; the read is for signed-in managers only (the hooks enforce it) and a failed read leaves
 * every surface as it is, with no card to draw.
 */
export function LeagueCardsLayer({
  enabled,
  teamIds,
  ownTeamId,
  children,
}: {
  enabled: boolean;
  teamIds: readonly string[];
  ownTeamId: string | null;
  children: ReactNode;
}) {
  if (!enabled) return <>{children}</>;
  return (
    <ReadLeagueCards teamIds={teamIds} ownTeamId={ownTeamId}>
      {children}
    </ReadLeagueCards>
  );
}

function ReadLeagueCards({
  teamIds,
  ownTeamId,
  children,
}: {
  teamIds: readonly string[];
  ownTeamId: string | null;
  children: ReactNode;
}) {
  const key = teamIds.join(",");
  const ids = useMemo(() => teamIds.slice(0, MAX_TEAMS), [key]); // eslint-disable-line react-hooks/exhaustive-deps
  const cards = useManagerCards(ids);
  const mine = useMyManagerCard();
  const latest = mine.data?.throughGameweekSeq ?? null;
  const value = useMemo<LeagueCards>(
    () => ({
      byTeam: new Map((cards.data ?? []).map((card) => [card.teamId, card])),
      ownTeamId,
      latestEvaluatedGameweek: latest,
    }),
    [cards.data, ownTeamId, latest],
  );
  return <LeagueCardsContext.Provider value={value}>{children}</LeagueCardsContext.Provider>;
}

/**
 * The 28 px card at the start of a name cell (plan M5a), before the team name. A decorative
 * duplicate of the row's own name, so it is hidden from assistive technology: the rating is
 * spoken on « Les vôtres », where the link under the table leads. A member with no card (no
 * team this season, a deleted account) gets nothing, and the row is what it was.
 *
 * It sits in an auto-width column: the box the renderer reports for 28 px, never a fixed width.
 */
export function LeagueRowMini({ teamId }: { teamId: string }) {
  const cards = useLeagueCards();
  const card = cards?.byTeam.get(teamId);
  const profile = useMemo(() => (card ? fromMember(card) : null), [card]);
  if (!profile) return null;
  return (
    <span aria-hidden className="me-2 flex shrink-0 items-center" data-testid="league-row-mini">
      <CardToken profile={profile} size={28} />
    </span>
  );
}
