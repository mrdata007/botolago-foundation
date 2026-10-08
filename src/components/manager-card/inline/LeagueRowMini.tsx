import { useMemo } from "react";

import { UiSkeleton } from "@/components/ui-kit";
import { cn } from "@/lib/utils";
import { useManagerCards } from "@/services/use-manager-card";

import { CardToken } from "../CardToken";
import { fromMember } from "../to-profile";

/** The batch read is at most 100 teams (plan 7.2). */
export const MAX_LEAGUE_TEAMS = 100;

/**
 * The league's team ids for the batch read: the standings' own order, at most 100, and a stable
 * identity while the list is the same, so every surface of the page shares one query.
 */
export function useLeagueTeamIds(teamIds: readonly string[]): string[] {
  const key = teamIds.join(",");
  return useMemo(() => teamIds.slice(0, MAX_LEAGUE_TEAMS), [key]); // eslint-disable-line react-hooks/exhaustive-deps
}

/**
 * The 28 px card at the start of a name cell (plan M5a), before the team name. A decorative
 * duplicate of the row's own name, so it is hidden from assistive technology: the rating is
 * spoken on « Les vôtres », where the link under the table leads. A member with no card (no team
 * this season, a deleted account) gets nothing, and the row is what it was.
 *
 * Every row asks for the same batch, `teamIds`, so React Query makes one request for the page.
 * While it is on its way the place of the mini is held (a quiet disc), so the names do not move
 * when the cards arrive; a read that fails takes the places away again.
 *
 * It sits in an auto-width column: the box the renderer reports for 28 px, never a fixed width.
 */
export function LeagueRowMini({ teamId, teamIds }: { teamId: string; teamIds: readonly string[] }) {
  const ids = useLeagueTeamIds(teamIds);
  const cards = useManagerCards(ids);
  const card = cards.data?.find((candidate) => candidate.teamId === teamId);
  const profile = useMemo(() => (card ? fromMember(card) : null), [card]);
  if (cards.isLoading) return <MiniSlot />;
  if (!profile) return null;
  return (
    <span aria-hidden className="me-2 flex shrink-0 items-center" data-testid="league-row-mini">
      <CardToken profile={profile} size={28} />
    </span>
  );
}

/** The place of a mini while the cards (or the chunk) are on their way. */
export function MiniSlot({ className }: { className?: string }) {
  return (
    <span aria-hidden className={cn("me-2 flex h-7 w-7 shrink-0", className)}>
      <UiSkeleton className="h-full w-full rounded-full" />
    </span>
  );
}
