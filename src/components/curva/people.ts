/**
 * Pure helpers for « Les vôtres » (G1's block and G3): which league, which rows, what each row's
 * card says. The order is always the league's own, the points order the standings carry, and no
 * function here sorts by rating: OVR is display-only and nothing may rank by it (plan 4.3).
 */
import type { MemberCardDto } from "@/backend/manager-card/contracts";
import { isOwnStanding } from "@/components/report/report-targets";
import { CARD_STAT_TOTAL, filledStats } from "@/components/manager-card/copy";
import { STAT_CODES, type TierCode } from "@/components/manager-card/types";
import type { ReportTarget } from "@/lib/report-content";
import type { League, LeagueStanding } from "@/types/fantasy";

/** A league's standings row with the card read for that team, and whether it is the reader's own. */
export interface PeopleRow {
  standing: LeagueStanding;
  card: MemberCardDto | null;
  own: boolean;
  /** What the row calls the manager: the card's name, else the manager's, else the team's. */
  name: string;
}

/** The batch read answers at most this many teams (plan 7.2). */
export const CARD_BATCH_LIMIT = 100;

const UUIDISH = /^[0-9a-f-]{8,64}$/i;

/**
 * The league to show: the one the address names (`?ligue=`), else the one this phone remembered,
 * else the first. A name or a remembered id that is not one of the manager's leagues is ignored.
 */
export function chooseLeague(
  leagues: readonly League[],
  wanted?: string | null,
  remembered?: string | null,
): League | null {
  const find = (id?: string | null) =>
    id && UUIDISH.test(id) ? (leagues.find((league) => league.id === id) ?? null) : null;
  return find(wanted) ?? find(remembered) ?? leagues[0] ?? null;
}

function shownName(standing: LeagueStanding, card: MemberCardDto | null): string {
  return card?.name.trim() || standing.managerName.trim() || standing.teamName.trim();
}

/** The standings rows, in the order they came in, each with its card. Never re-sorted. */
export function buildRows(
  standings: readonly LeagueStanding[],
  cards: readonly MemberCardDto[],
  ownTeamId: string | null | undefined,
): PeopleRow[] {
  const byTeam = new Map(cards.map((card) => [card.teamId, card]));
  return standings.map((standing) => {
    const card = byTeam.get(standing.managerId) ?? null;
    return {
      standing,
      card,
      own: isOwnStanding(standing.managerId, ownTeamId),
      name: shownName(standing, card),
    };
  });
}

/** The teams to ask the batch read about: every row, at most 100, the reader's own always in. */
export function cardTeamIds(
  standings: readonly LeagueStanding[],
  ownTeamId?: string | null,
): string[] {
  const ids = standings.map((row) => row.managerId);
  const own = standings.find((row) => isOwnStanding(row.managerId, ownTeamId))?.managerId ?? null;
  const head = ids.slice(0, CARD_BATCH_LIMIT);
  if (own && !head.includes(own)) head[CARD_BATCH_LIMIT - 1] = own;
  return head;
}

/** G1's three rows: the one above you, you, the one below (fewer if you lead or trail). */
export function neighbours(rows: readonly PeopleRow[]): PeopleRow[] {
  const at = rows.findIndex((row) => row.own);
  if (at < 0) return rows.slice(0, 3);
  return rows.slice(Math.max(0, at - 1), at + 2);
}

/** What the card line of a row says: a number and a tier, a count, or nothing. */
export type CardLine =
  | { kind: "rated"; ovr: number; tier: TierCode | null; provisional: boolean }
  | { kind: "forming"; counted: number; min: number }
  /** Every journée counted, too few statistics for a number: the statistics filled, « 2/4 ». */
  | { kind: "insufficient"; filled: number; total: number }
  | { kind: "none" };

export function cardLine(card: MemberCardDto | null): CardLine {
  if (!card) return { kind: "none" };
  if (card.ovr !== null) {
    return { kind: "rated", ovr: card.ovr, tier: card.tier, provisional: card.provisional };
  }
  if (card.ratingState === "insufficient") {
    return {
      kind: "insufficient",
      filled: filledStats(STAT_CODES.map((code) => card.stats[code])),
      total: CARD_STAT_TOTAL,
    };
  }
  return { kind: "forming", counted: card.gameweeksCounted, min: card.minRated };
}

/**
 * The members whose first rating is the latest evaluated journée, in league order, not the
 * reader: M5a's band names them (names only, so no low number becomes a headline).
 */
export function newlyRated(rows: readonly PeopleRow[], latest: number | null): PeopleRow[] {
  if (latest === null) return [];
  return rows.filter(
    (row) => !row.own && row.card !== null && row.card.firstRatedGameweekSeq === latest,
  );
}

/** The members who support the same club as the reader (not the reader), in league order. */
export function sameClub(rows: readonly PeopleRow[], clubId: string | null): PeopleRow[] {
  if (!clubId) return [];
  return rows.filter((row) => !row.own && row.card?.club?.id === clubId);
}

/** What a report of this row names: the name as shown, and the team's name when it differs. */
export function rowReportTargets(row: PeopleRow): ReportTarget[] {
  const id = `team:${row.standing.managerId}`;
  const targets: ReportTarget[] = [{ kind: "user", name: row.name, id }];
  const team = row.standing.teamName.trim();
  if (team && team !== row.name) targets.push({ kind: "team", name: team, id });
  return targets;
}
