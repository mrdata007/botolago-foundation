/**
 * What the strip under a card with no number of its own shows, decided with no React. Everything
 * comes from data the home already holds: the card's own statistics and journées (`MyCardDto`) and
 * the standings the « Les vôtres » block reads. The browser never computes a rating here and never
 * invents a figure; a fact that is not known is left out, never drawn as a zero or a dash.
 */
import type { MyCardDto } from "@/backend/manager-card/contracts";
import type { WaitContext } from "@/components/manager-card/copy";
import type { LeagueStanding } from "@/types/fantasy";

import { isOverForming, type RoundBlock } from "./curva-state";
import type { PeopleRow } from "./people";

/**
 * Whether the strip is drawn: the card has no number of its own, its season is still running and
 * it is not a forming card whose season ended (that one has nothing left to wait for). A card that
 * shows last season's number in a new season (`forming` with a previous season) is not pending: it
 * has a number on screen.
 */
export function showsPendingPanel(card: MyCardDto, block: RoundBlock): boolean {
  if (card.seasonClosed || isOverForming(block)) return false;
  if (card.ratingState === "forming" && card.previousSeason !== null) return false;
  return card.ovr === null;
}

/** The journées a card's empty statistics wait on, for their short reasons. */
export function waitContext(
  card: Pick<MyCardDto, "gameweeksCounted" | "minRated" | "ratingGameweeks">,
) {
  const wait: WaitContext = {
    counted: card.gameweeksCounted,
    min: card.minRated,
    listed: (card.ratingGameweeks ?? []).filter((n) => Number.isInteger(n)),
  };
  return wait;
}

/** The facts shown under the statistics, each null when it is not known. */
export interface PendingFacts {
  /** The team's total Fantasy points in the league being shown (the standings' `totalScore`). */
  points: number | null;
  /** The team's rank in that league, and how many teams it has. */
  rank: number | null;
  of: number | null;
  /**
   * The journées counted, only once every journée the rating needs is counted (the forming box
   * already says « 1/3 » before that, so the figure would repeat it).
   */
  counted: number | null;
}

/**
 * The reader's own standing in the league on screen, or null when the standings are not loaded
 * (still loading, failed, or the reader is not in a league yet).
 */
export function ownStanding(rows: readonly PeopleRow[]): LeagueStanding | null {
  return rows.find((row) => row.own)?.standing ?? null;
}

export function pendingFacts(
  card: Pick<MyCardDto, "gameweeksCounted" | "minRated">,
  rows: readonly PeopleRow[],
): PendingFacts {
  const own = ownStanding(rows);
  const finite = (n: number | undefined): n is number =>
    typeof n === "number" && Number.isFinite(n);
  const waitsForStats = card.gameweeksCounted >= card.minRated;
  return {
    points: own && finite(own.totalScore) ? own.totalScore : null,
    rank: own && finite(own.rank) && own.rank > 0 ? own.rank : null,
    of: own && rows.length > 0 ? rows.length : null,
    counted: waitsForStats && card.gameweeksCounted > 0 ? card.gameweeksCounted : null,
  };
}

/** Whether there is any fact to draw under the statistics. */
export function hasFacts(facts: PendingFacts): boolean {
  return facts.points !== null || facts.rank !== null || facts.counted !== null;
}
