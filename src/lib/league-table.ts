import type { TableRow } from "@/types/domain";

/**
 * The Botola Pro table, worked out from the season's results.
 *
 * Nothing refreshes `app.standings` during a season: the provider's table
 * reached it once, through the two-season backfill, and the live ingestion
 * does not carry standings at all. The finished fixtures do arrive, so the
 * table is computed from them. Computed with the order below, the 2024/25 and
 * 2025/26 results reproduce both stored final tables exactly — every rank and
 * every figure of all 32 rows (checked against production on 2026-09-24, and
 * pinned for 2025/26 by `league-table.test.ts`).
 *
 * Order: points, then overall goal difference, then goals scored. Not
 * head-to-head first: both stored tables have a pair level on points where the
 * head-to-head goes the other way (Maghreb Fès above Olympic Safi in 2024/25,
 * Yacoub El Mansour above Olympique Dcheïra in 2025/26), and in both the
 * better goal difference is the one placed higher. Clubs still level after
 * that are listed by name, which is what an early-season table needs: after
 * one round, every 1–0 winner has the same three figures.
 */

export type TableScope = "overall" | "home" | "away";

/** A finished league result, as the table reads it. */
export interface TableResult {
  readonly homeClubId: string;
  readonly awayClubId: string;
  readonly homeScore: number;
  readonly awayScore: number;
  /** ISO kickoff instant: it orders the form guide. */
  readonly kickoff: string;
}

export interface LeagueTableRow extends TableRow {
  readonly goalsFor: number;
  readonly goalsAgainst: number;
}

type Outcome = "W" | "D" | "L";

interface Tally {
  clubId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  form: Outcome[];
}

/** The form guide shows the last five results, oldest first. */
export const FORM_LENGTH = 5;

function outcome(scored: number, conceded: number): Outcome {
  return scored > conceded ? "W" : scored === conceded ? "D" : "L";
}

function record(tally: Tally, scored: number, conceded: number): void {
  tally.played += 1;
  tally.goalsFor += scored;
  tally.goalsAgainst += conceded;
  const result = outcome(scored, conceded);
  if (result === "W") tally.won += 1;
  else if (result === "D") tally.drawn += 1;
  else tally.lost += 1;
  tally.form.push(result);
}

/**
 * The table for `scope`: every result counts in `overall`, only the club's
 * home matches in `home` and only its away matches in `away`.
 *
 * `clubIds` lists the season's clubs, so a club that has not played yet (a
 * postponed opener) still has its row, on zero. `nameOf` gives the name used
 * to order clubs level on everything else; the id is the last resort.
 */
export function computeLeagueTable(
  clubIds: readonly string[],
  results: readonly TableResult[],
  scope: TableScope,
  nameOf: (clubId: string) => string = (clubId) => clubId,
): LeagueTableRow[] {
  const tallies = new Map<string, Tally>();
  const tallyOf = (clubId: string) => {
    let tally = tallies.get(clubId);
    if (!tally) {
      tally = {
        clubId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        goalsFor: 0,
        goalsAgainst: 0,
        form: [],
      };
      tallies.set(clubId, tally);
    }
    return tally;
  };
  for (const clubId of clubIds) tallyOf(clubId);

  const chronological = [...results].sort((a, b) => Date.parse(a.kickoff) - Date.parse(b.kickoff));
  for (const result of chronological) {
    const home = tallyOf(result.homeClubId);
    const away = tallyOf(result.awayClubId);
    if (scope !== "away") record(home, result.homeScore, result.awayScore);
    if (scope !== "home") record(away, result.awayScore, result.homeScore);
  }

  const points = (tally: Tally) => tally.won * 3 + tally.drawn;
  const difference = (tally: Tally) => tally.goalsFor - tally.goalsAgainst;
  const ordered = [...tallies.values()].sort(
    (a, b) =>
      points(b) - points(a) ||
      difference(b) - difference(a) ||
      b.goalsFor - a.goalsFor ||
      nameOf(a.clubId).localeCompare(nameOf(b.clubId)) ||
      a.clubId.localeCompare(b.clubId),
  );

  return ordered.map((tally, index) => ({
    position: index + 1,
    clubId: tally.clubId,
    played: tally.played,
    won: tally.won,
    drawn: tally.drawn,
    lost: tally.lost,
    goalsFor: tally.goalsFor,
    goalsAgainst: tally.goalsAgainst,
    goalDifference: difference(tally),
    points: points(tally),
    form: tally.form.slice(-FORM_LENGTH),
  }));
}

/** How many rounds a table reflects: the matches played by its busiest club. */
export function roundsPlayed(rows: readonly Pick<TableRow, "played">[]): number {
  return rows.reduce((most, row) => Math.max(most, row.played), 0);
}

/* ------------------------------------------------------------------ zones */

export type LeagueZone = "champions_league" | "confederation_cup" | "relegation";

/**
 * What each end of the Botola Pro table is playing for: the first two places
 * go to the CAF Champions League, the third to the CAF Confederation Cup, and
 * the last two go down. The one place to change if the federation changes the
 * allocation.
 */
export const BOTOLA_PLACES = {
  championsLeague: 2,
  confederationCup: 1,
  relegation: 2,
} as const;

export function leagueZone(position: number, clubCount: number): LeagueZone | null {
  const { championsLeague, confederationCup, relegation } = BOTOLA_PLACES;
  if (position <= championsLeague) return "champions_league";
  if (position <= championsLeague + confederationCup) return "confederation_cup";
  // A short table (early data, a fixture feed with a few clubs) never marks a
  // club in the African places as relegated too.
  const firstRelegated = Math.max(
    clubCount - relegation + 1,
    championsLeague + confederationCup + 1,
  );
  if (position >= firstRelegated && position <= clubCount) return "relegation";
  return null;
}

/* -------------------------------------------------------------- your club */

/** Where a club stands against the place next to it. */
export type ClubGap =
  /** The leader, `points` clear of `over` (the 2nd place). */
  | { readonly kind: "lead"; readonly points: number; readonly over: number }
  /** `points` short of the place above, `to`. */
  | { readonly kind: "behind"; readonly points: number; readonly to: number }
  /** Level on points with `with`: the place above, or the 2nd for a leader. */
  | { readonly kind: "level"; readonly with: number };

export interface ClubStanding {
  readonly row: LeagueTableRow;
  readonly zone: LeagueZone | null;
  /** `null` for a club alone in its table. */
  readonly gap: ClubGap | null;
}

/** A club's line in `rows` (ordered by position), or `null` when it is not in the table. */
export function clubStanding(rows: readonly LeagueTableRow[], clubId: string): ClubStanding | null {
  const index = rows.findIndex((row) => row.clubId === clubId);
  if (index < 0) return null;
  const row = rows[index]!;
  const zone = leagueZone(row.position, rows.length);
  if (index === 0) {
    const next = rows[1];
    if (!next) return { row, zone, gap: null };
    const lead = row.points - next.points;
    return {
      row,
      zone,
      gap:
        lead > 0
          ? { kind: "lead", points: lead, over: next.position }
          : { kind: "level", with: next.position },
    };
  }
  const above = rows[index - 1]!;
  const behind = above.points - row.points;
  return {
    row,
    zone,
    gap:
      behind > 0
        ? { kind: "behind", points: behind, to: above.position }
        : { kind: "level", with: above.position },
  };
}
