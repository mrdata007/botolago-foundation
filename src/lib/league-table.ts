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
 * pinned for 2025/26 by `league-table.test.ts`). Neither stored table has two
 * clubs level on all three figures below (checked 2026-09-25), so the shared
 * ranks described next change neither.
 *
 * Order: points, then overall goal difference, then goals scored. Not
 * head-to-head first: both stored tables have a pair level on points where the
 * head-to-head goes the other way (Maghreb Fès above Olympic Safi in 2024/25,
 * Yacoub El Mansour above Olympique Dcheïra in 2025/26), and in both the
 * better goal difference is the one placed higher.
 *
 * Clubs still level after that share a rank ("1, 2, 2, 4"), which is what an
 * early-season table needs: after one round, every 1–0 winner has the same
 * three figures, and before its first match a club is level with every other
 * club yet to play. The league's own rule for separating such clubs is not
 * sourced here, so none is invented. They are listed in one fixed order, by a
 * canonical key (the club's slug) that no translation touches. They used to
 * be listed by name, and the name arrived translated: the same results put
 * UTS Rabat 2nd in Arabic and 13th in French (audit A04). The listing order
 * decides nothing — `tableZones` marks a place only when the whole tie is in it.
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
 * Plain code-unit order. Not `localeCompare`, whose answer depends on the
 * runtime's locale data: the server and a reader's browser could list the
 * same tie differently.
 */
function byCodeUnit(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}

/**
 * The table for `scope`: every result counts in `overall`, only the club's
 * home matches in `home` and only its away matches in `away`.
 *
 * `clubIds` lists the season's clubs, so a club that has not played yet (a
 * postponed opener) still has its row, on zero. `canonicalKeyOf` gives the
 * key that lists clubs level on everything else, in one fixed order: a slug
 * or an id, never a translated name. The id is the last resort.
 */
export function computeLeagueTable(
  clubIds: readonly string[],
  results: readonly TableResult[],
  scope: TableScope,
  canonicalKeyOf: (clubId: string) => string = (clubId) => clubId,
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
  /** The table's order; 0 for two clubs level on every figure it counts. */
  const rank = (a: Tally, b: Tally) =>
    points(b) - points(a) || difference(b) - difference(a) || b.goalsFor - a.goalsFor;
  const ordered = [...tallies.values()].sort(
    (a, b) =>
      rank(a, b) ||
      byCodeUnit(canonicalKeyOf(a.clubId), canonicalKeyOf(b.clubId)) ||
      byCodeUnit(a.clubId, b.clubId),
  );

  let position = 0;
  return ordered.map((tally, index) => {
    // A club level with the one listed above it shares its position; the
    // next club down takes its place in the list ("1, 2, 2, 4").
    const previous = ordered[index - 1];
    if (!previous || rank(previous, tally) !== 0) position = index + 1;
    return {
      position,
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
    };
  });
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

/** How many rows hold each position: more than one where clubs share a rank. */
function positionCounts(rows: readonly Pick<TableRow, "position">[]): Map<number, number> {
  const counts = new Map<number, number>();
  for (const row of rows) counts.set(row.position, (counts.get(row.position) ?? 0) + 1);
  return counts;
}

/** The positions two or more clubs share (see `computeLeagueTable`). */
export function sharedPositions(rows: readonly Pick<TableRow, "position">[]): ReadonlySet<number> {
  const shared = new Set<number>();
  for (const [position, count] of positionCounts(rows)) if (count > 1) shared.add(position);
  return shared;
}

/**
 * Each club's zone, by club id: the zone every place its rank could stand
 * for lies in.
 *
 * A club alone on its position is in that position's zone. Clubs sharing a
 * position could finish anywhere in the places their tie spans, so they are
 * marked only when all of those places are in one zone. After the first
 * match of a season, fourteen clubs yet to play share 2nd and span 2nd to
 * 15th; none of them is drawn in an African place or in the drop because of
 * where the listing order put it. A provider's table, one club a position,
 * is marked exactly as `leagueZone` marks it.
 */
export function tableZones(
  rows: readonly Pick<TableRow, "clubId" | "position">[],
): Map<string, LeagueZone | null> {
  const counts = positionCounts(rows);
  const zones = new Map<string, LeagueZone | null>();
  for (const row of rows) {
    const last = row.position + (counts.get(row.position) ?? 1) - 1;
    let zone = leagueZone(row.position, rows.length);
    for (let place = row.position + 1; zone && place <= last; place += 1) {
      if (leagueZone(place, rows.length) !== zone) zone = null;
    }
    zones.set(row.clubId, zone);
  }
  return zones;
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
  /** As `tableZones` marks it: none for a tie that spans more than one zone. */
  readonly zone: LeagueZone | null;
  /** Level on every figure with another club, so sharing its position. */
  readonly shared: boolean;
  /** `null` for a club with no other position in its table. */
  readonly gap: ClubGap | null;
}

/**
 * A club's line in `rows` (ordered by position), or `null` when it is not in
 * the table. The place it is measured against is the nearest OTHER position:
 * a club sharing 2nd is so many points short of 1st, not level with a club
 * that shares its own rank.
 */
export function clubStanding(rows: readonly LeagueTableRow[], clubId: string): ClubStanding | null {
  const index = rows.findIndex((row) => row.clubId === clubId);
  if (index < 0) return null;
  const row = rows[index]!;
  const zone = tableZones(rows).get(clubId) ?? null;
  const shared = rows.some((other) => other !== row && other.position === row.position);
  let above: LeagueTableRow | undefined;
  for (let i = index - 1; i >= 0 && !above; i -= 1) {
    if (rows[i]!.position < row.position) above = rows[i];
  }
  if (!above) {
    const next = rows.slice(index + 1).find((other) => other.position > row.position);
    if (!next) return { row, zone, shared, gap: null };
    const lead = row.points - next.points;
    return {
      row,
      zone,
      shared,
      gap:
        lead > 0
          ? { kind: "lead", points: lead, over: next.position }
          : { kind: "level", with: next.position },
    };
  }
  const behind = above.points - row.points;
  return {
    row,
    zone,
    shared,
    gap:
      behind > 0
        ? { kind: "behind", points: behind, to: above.position }
        : { kind: "level", with: above.position },
  };
}
