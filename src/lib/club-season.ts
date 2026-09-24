/**
 * One club's season, worked out from its fixtures and the league table.
 *
 * Pure functions over the domain `Match` and `TableRow`, so the club page can
 * be tested without a router or a query client. Nothing here invents a
 * figure: every number is a count over matches that have a final score, and
 * a match without one (not played, postponed, a score the provider never
 * sent) is simply not counted.
 *
 * Which source wins where both have an answer is the club page's call, not
 * this module's: the table is the league's official record (it carries
 * points deductions a sum of results cannot), and the fixtures are the only
 * source for what the table does not hold — home and away, clean sheets, the
 * biggest win, the form.
 */

import type { FootballPosition, SquadRole } from "@/backend/football/contracts";
import { FOOTBALL_POSITIONS } from "@/backend/football/contracts";
import type { LeagueTableRow } from "@/lib/league-table";
import type { Match, TableRow } from "@/types/domain";

export type MatchOutcome = "W" | "D" | "L";

/** The club's side of a finished match, or null if it has no final score or the club did not play. */
export function clubScore(
  match: Match,
  clubId: string,
): { scored: number; conceded: number; home: boolean } | null {
  if (match.status !== "finished") return null;
  if (match.homeScore === undefined || match.awayScore === undefined) return null;
  if (match.homeClubId === clubId) {
    return { scored: match.homeScore, conceded: match.awayScore, home: true };
  }
  if (match.awayClubId === clubId) {
    return { scored: match.awayScore, conceded: match.homeScore, home: false };
  }
  return null;
}

export function matchOutcome(match: Match, clubId: string): MatchOutcome | null {
  const score = clubScore(match, clubId);
  if (!score) return null;
  if (score.scored > score.conceded) return "W";
  if (score.scored < score.conceded) return "L";
  return "D";
}

/** Kick-off order, oldest first, with the id as a stable tie-break. */
export function byKickoff(a: Match, b: Match): number {
  return Date.parse(a.kickoff) - Date.parse(b.kickoff) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export interface RecordLine {
  readonly played: number;
  readonly won: number;
  readonly drawn: number;
  readonly lost: number;
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

export const EMPTY_RECORD: RecordLine = {
  played: 0,
  won: 0,
  drawn: 0,
  lost: 0,
  goalsFor: 0,
  goalsAgainst: 0,
};

function addResult(line: RecordLine, scored: number, conceded: number): RecordLine {
  return {
    played: line.played + 1,
    won: line.won + (scored > conceded ? 1 : 0),
    drawn: line.drawn + (scored === conceded ? 1 : 0),
    lost: line.lost + (scored < conceded ? 1 : 0),
    goalsFor: line.goalsFor + scored,
    goalsAgainst: line.goalsAgainst + conceded,
  };
}

export interface ClubSeasonStats {
  readonly overall: RecordLine;
  readonly home: RecordLine;
  readonly away: RecordLine;
  /** Finished matches in which the club conceded nothing. */
  readonly cleanSheets: number;
  /** Finished matches in which the club scored nothing. */
  readonly failedToScore: number;
  /** The widest winning margin; on a tie the one with more goals scored, then the latest. */
  readonly biggestWin: Match | null;
  /** The widest losing margin; on a tie the one with more goals conceded, then the latest. */
  readonly heaviestDefeat: Match | null;
  /** The last five results, oldest first — the order `FormChips` draws them in. */
  readonly form: readonly MatchOutcome[];
}

export function clubSeasonStats(matches: readonly Match[], clubId: string): ClubSeasonStats {
  let overall = EMPTY_RECORD;
  let home = EMPTY_RECORD;
  let away = EMPTY_RECORD;
  let cleanSheets = 0;
  let failedToScore = 0;
  let biggestWin: { match: Match; margin: number; goals: number } | null = null;
  let heaviestDefeat: { match: Match; margin: number; goals: number } | null = null;
  const form: MatchOutcome[] = [];

  // Oldest first, so a later match wins every tie below by coming last.
  for (const match of [...matches].sort(byKickoff)) {
    const score = clubScore(match, clubId);
    if (!score) continue;
    const { scored, conceded } = score;
    overall = addResult(overall, scored, conceded);
    if (score.home) home = addResult(home, scored, conceded);
    else away = addResult(away, scored, conceded);
    if (conceded === 0) cleanSheets += 1;
    if (scored === 0) failedToScore += 1;
    const margin = scored - conceded;
    if (
      margin > 0 &&
      (!biggestWin ||
        margin > biggestWin.margin ||
        (margin === biggestWin.margin && scored >= biggestWin.goals))
    ) {
      biggestWin = { match, margin, goals: scored };
    }
    if (
      margin < 0 &&
      (!heaviestDefeat ||
        -margin > heaviestDefeat.margin ||
        (-margin === heaviestDefeat.margin && conceded >= heaviestDefeat.goals))
    ) {
      heaviestDefeat = { match, margin: -margin, goals: conceded };
    }
    form.push(margin > 0 ? "W" : margin < 0 ? "L" : "D");
  }

  return {
    overall,
    home,
    away,
    cleanSheets,
    failedToScore,
    biggestWin: biggestWin?.match ?? null,
    heaviestDefeat: heaviestDefeat?.match ?? null,
    form: form.slice(-5),
  };
}

/**
 * The record the page shows as the club's season: the league table's row
 * when there is one (the official figures), the sum of the fixtures when
 * there is not.
 */
export function officialRecord(
  row: LeagueTableRow | undefined,
  fromFixtures: RecordLine,
): RecordLine {
  if (!row) return fromFixtures;
  return {
    played: row.played,
    won: row.won,
    drawn: row.drawn,
    lost: row.lost,
    goalsFor: row.goalsFor,
    goalsAgainst: row.goalsAgainst,
  };
}

/** A per-match average, or null when there are no matches to divide by. */
export function perMatch(total: number, played: number): number | null {
  return played > 0 ? total / played : null;
}

/**
 * The match to put under "next match": one being played now, else the
 * earliest still to be played. A postponed match has no date to wait for, so
 * it is never "next".
 */
export function nextClubMatch(matches: readonly Match[]): Match | undefined {
  const live = matches.filter((match) => match.status === "live").sort(byKickoff);
  if (live.length > 0) return live[0];
  return matches.filter((match) => match.status === "scheduled").sort(byKickoff)[0];
}

/** Finished matches with a final score, most recent first. */
export function clubResults(matches: readonly Match[], clubId: string): Match[] {
  return matches
    .filter((match) => clubScore(match, clubId) !== null)
    .sort(byKickoff)
    .reverse();
}

/**
 * Everything still to be played (live, scheduled, postponed), soonest first.
 * A cancelled or abandoned fixture shows as postponed but will not be played
 * as scheduled, so it is left out rather than listed as coming forever.
 */
export function clubFixtures(matches: readonly Match[]): Match[] {
  return matches.filter((match) => match.status !== "finished" && !match.calledOff).sort(byKickoff);
}

/**
 * Up to `size` rows of the table around the club: centred on it where the
 * table allows, pushed back inside it at the top and the bottom. Empty when
 * the club is not in the table.
 */
export function standingsAround(rows: readonly TableRow[], clubId: string, size = 5): TableRow[] {
  const sorted = [...rows].sort((a, b) => a.position - b.position);
  const index = sorted.findIndex((row) => row.clubId === clubId);
  if (index === -1) return [];
  const start = Math.max(0, Math.min(index - Math.floor(size / 2), sorted.length - size));
  return sorted.slice(start, start + size);
}

/** The season that ended before `seasonId` began, for "see last season". */
export function previousSeason<T extends { id: string; startsOn: string }>(
  seasons: readonly T[],
  seasonId: string | undefined,
): T | undefined {
  const current = seasons.find((season) => season.id === seasonId);
  if (!current) return undefined;
  return seasons
    .filter((season) => season.startsOn < current.startsOn)
    .sort((a, b) => b.startsOn.localeCompare(a.startsOn))[0];
}

export interface SquadPlayer {
  readonly id: string;
  readonly name: string;
  readonly position: FootballPosition;
  readonly shirtNumber: number | null;
  readonly role: SquadRole;
}

export interface SquadGroup {
  readonly position: FootballPosition;
  readonly players: readonly SquadPlayer[];
}

/**
 * The squad in the order a team sheet reads: goalkeepers, defenders,
 * midfielders, forwards; by shirt number inside each line (players without
 * one after those with one), then by name. A line with nobody in it is left
 * out rather than drawn empty.
 */
export function squadByPosition(players: readonly SquadPlayer[]): SquadGroup[] {
  return FOOTBALL_POSITIONS.map((position) => ({
    position,
    players: players
      .filter((player) => player.position === position)
      .sort(
        (a, b) =>
          (a.shirtNumber ?? Number.MAX_SAFE_INTEGER) - (b.shirtNumber ?? Number.MAX_SAFE_INTEGER) ||
          a.name.localeCompare(b.name) ||
          (a.id < b.id ? -1 : a.id > b.id ? 1 : 0),
      ),
  })).filter((group) => group.players.length > 0);
}
