/**
 * The demo's world: the real Botola Pro 2026/27 catalog, and a sample season
 * played on top of it.
 *
 * REAL — the sixteen clubs (names in French and Arabic, codes, crests) and the
 * 603 players of the Fantasy pool (names, clubs, positions, prices), copied
 * from BotolaGO production into `catalog.json` on 2026-09-26.
 *
 * SAMPLE — everything that happens on the pitch. Twelve rounds of Botola
 * matches are simulated with a fixed seed: scores, minutes, goals, assists,
 * cards, saves. The league table is then worked out from those results by the
 * product's own `computeLeagueTable`, and every Fantasy point by the product's
 * own `scorePlayerFixture` under the V1 rules. So the numbers are invented,
 * but they agree with each other the way real ones would: a keeper's clean
 * sheet is a match his club did not concede, and the table adds up.
 */
import { scorePlayerFixture, type ScoringRules } from "@/backend/fantasy/scoring";
import { clubShortCode } from "@/lib/club-identity";
import { computeLeagueTable, type LeagueTableRow, type TableResult } from "@/lib/league-table";
import type { Club } from "@/types/domain";
import type { FantasyPlayer, PlayerPointsBreakdown, PointsEvent, Position } from "@/types/fantasy";

import catalog from "./catalog.json";
import { createRandom } from "./random";

/** The gameweek the demo is played in. Rounds 1-11 are history. */
export const DEMO_GAMEWEEK = 12;
/** Budget for a starting eleven (the full game: 100 for fifteen). */
export const DEMO_BUDGET = 80;
/** The product's rule: at most three players from one club. */
export const MAX_PER_CLUB = 3;

/** docs/backend/FANTASY_RULES_V1.md, the scoring table the live game uses. */
export const SCORING_RULES_V1: ScoringRules = {
  appearanceShort: 1,
  appearanceFull: 2,
  fullAppearanceMinutes: 60,
  assist: 3,
  goal: { GK: 10, DEF: 6, MID: 5, FWD: 4 },
  cleanSheet: { GK: 4, DEF: 4, MID: 1, FWD: 0 },
  goalsConcededPerPoint: { GK: 2, DEF: 2 },
  savesPerPoint: 3,
  penaltySave: 5,
  penaltyMiss: -2,
  yellowCard: -1,
  redCard: -3,
  secondYellowDismissal: -3,
  ownGoal: -2,
  bonusEnabled: false,
  playerOfMatchEnabled: false,
};

const POSITIONS: readonly Position[] = ["GK", "DEF", "MID", "FWD"];

/* ------------------------------------------------------------------ */
/* Clubs                                                               */
/* ------------------------------------------------------------------ */

const crestFiles = import.meta.glob<string>("../assets/crests/*", {
  eager: true,
  import: "default",
});

/**
 * The same shape production builds in `toClub` (src/services/football.ts):
 * the ink fill as the club colour, which the kit table then refines by name,
 * and the club's own code or letters derived from its short name.
 */
export const clubs: Club[] = catalog.clubs.map((club) => ({
  id: club.id,
  slug: club.slug,
  name: club.name,
  shortName: club.shortName,
  city: { fr: "", ar: "" },
  primaryColor: "var(--ui-ink)",
  crestPlaceholder: clubShortCode(club.code, club.shortName.fr),
  crestUrl: crestFiles[`../assets/crests/${club.crest}`],
}));

const clubIds = clubs.map((club) => club.id);

export function clubById(id: string | undefined): Club | undefined {
  return id ? clubs.find((club) => club.id === id) : undefined;
}

/* ------------------------------------------------------------------ */
/* Players                                                             */
/* ------------------------------------------------------------------ */

interface CatalogPlayer {
  id: string;
  name: string;
  clubId: string;
  position: Position;
  price: number;
}

const roster: CatalogPlayer[] = (
  catalog.players as unknown as [string, number, Position, number][]
).map(([name, clubIndex, position, price], index) => ({
  id: `p${index + 1}`,
  name,
  clubId: clubIds[clubIndex],
  position,
  price,
}));

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */

const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/**
 * The Journée 12 deadline sits about two and a half days after the page is
 * opened, on a half hour, so the countdown on the hub is always running.
 */
const deadline12 = (() => {
  const at = new Date(Date.now() + 2 * DAY + 7 * HOUR);
  at.setUTCMinutes(at.getUTCMinutes() < 30 ? 0 : 30, 0, 0);
  return at.getTime();
})();

export function deadlineOf(round: number): string {
  return new Date(deadline12 - (DEMO_GAMEWEEK - round) * 7 * DAY).toISOString();
}

/** The circle method: every club meets every other once in fifteen rounds. */
function roundRobin(ids: readonly string[]): [string, string][][] {
  const order = [...ids];
  const rounds: [string, string][][] = [];
  for (let round = 0; round < order.length - 1; round += 1) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < order.length / 2; i += 1) {
      const a = order[i];
      const b = order[order.length - 1 - i];
      pairs.push((round + i) % 2 === 0 ? [a, b] : [b, a]);
    }
    rounds.push(pairs);
    order.splice(1, 0, order.pop()!);
  }
  return rounds;
}

/* ------------------------------------------------------------------ */
/* The sample season                                                   */
/* ------------------------------------------------------------------ */

export interface DemoMatch {
  id: string;
  round: number;
  homeClubId: string;
  awayClubId: string;
  homeScore: number;
  awayScore: number;
  kickoff: string;
}

interface PlayerRound {
  round: number;
  minutes: number;
  points: number;
  events: PointsEvent[];
  fixtureId: string;
}

const rng = createRandom("botolago-demo-season-2026-27");

// Fixtures: clubs in a seeded order, so the calendar is not alphabetical.
const shuffled = [...clubIds];
for (let i = shuffled.length - 1; i > 0; i -= 1) {
  const j = rng.int(0, i);
  [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
}
const calendar = roundRobin(shuffled);

const byClubAndPosition = new Map<string, Record<Position, CatalogPlayer[]>>();
for (const club of clubIds) {
  const group = { GK: [], DEF: [], MID: [], FWD: [] } as Record<Position, CatalogPlayer[]>;
  for (const player of roster.filter((candidate) => candidate.clubId === club)) {
    group[player.position].push(player);
  }
  for (const position of POSITIONS) group[position].sort((a, b) => b.price - a.price);
  byClubAndPosition.set(club, group);
}

/** A 4-4-2 of the best-priced players is each club's usual eleven. */
const SHAPE: Record<Position, number> = { GK: 1, DEF: 4, MID: 4, FWD: 2 };

const strength = new Map<string, number>();
for (const club of clubIds) {
  const group = byClubAndPosition.get(club)!;
  const eleven = POSITIONS.flatMap((position) => group[position].slice(0, SHAPE[position]));
  strength.set(club, eleven.reduce((sum, player) => sum + player.price, 0) / eleven.length);
}

const priceFactor = (player: CatalogPlayer) => (player.price / 6.5) ** 1.6;
const GOAL_WEIGHT: Record<Position, number> = { GK: 0.01, DEF: 0.55, MID: 2.1, FWD: 4.8 };
const ASSIST_WEIGHT: Record<Position, number> = { GK: 0.05, DEF: 1.1, MID: 3.0, FWD: 1.7 };
const SUB_OFF: Record<Position, number> = { GK: 0, DEF: 0.12, MID: 0.34, FWD: 0.46 };
const YELLOW: Record<Position, number> = { GK: 0.03, DEF: 0.15, MID: 0.12, FWD: 0.08 };

const matches: DemoMatch[] = [];
const history = new Map<string, PlayerRound[]>();

function lineup(club: string) {
  const group = byClubAndPosition.get(club)!;
  const played = new Map<CatalogPlayer, number>();
  const used = new Set<CatalogPlayer>();
  const bench: CatalogPlayer[] = [];
  const starters: CatalogPlayer[] = [];
  for (const position of POSITIONS) {
    const pool = group[position];
    const regulars = pool.slice(0, SHAPE[position]);
    const reserves = pool.slice(SHAPE[position], SHAPE[position] + 2);
    for (const regular of regulars) {
      // Rotation and knocks: now and then a regular sits one out.
      const stand = rng.chance(0.12) ? reserves.find((reserve) => !used.has(reserve)) : undefined;
      const chosen = stand ?? regular;
      used.add(chosen);
      starters.push(chosen);
    }
    bench.push(...pool.slice(0, SHAPE[position] + 2).filter((player) => !used.has(player)));
  }
  let substitutions = 0;
  for (const starter of starters) {
    const off = substitutions < 3 && rng.chance(SUB_OFF[starter.position]) ? rng.int(58, 84) : null;
    played.set(starter, off ?? 90);
    if (off === null) continue;
    const replacement =
      bench.find((player) => !used.has(player) && player.position === starter.position) ??
      bench.find((player) => !used.has(player) && player.position !== "GK");
    if (!replacement) continue;
    used.add(replacement);
    played.set(replacement, 90 - off);
    substitutions += 1;
  }
  return played;
}

for (let round = 1; round <= DEMO_GAMEWEEK; round += 1) {
  calendar[round - 1].forEach(([home, away], index) => {
    const id = `m${round}-${index + 1}`;
    const ratio = strength.get(home)! / strength.get(away)!;
    // The Botola is a tight league: a little over two goals a game.
    const homeLambda = 1.12 * ratio ** 1.6;
    const awayLambda = 0.86 * (1 / ratio) ** 1.6;
    const homeScore = Math.min(rng.poisson(homeLambda), 4);
    const awayScore = Math.min(rng.poisson(awayLambda), 4);
    // Friday to Sunday, 90 minutes after the deadline at the earliest.
    const kickoff = new Date(
      Date.parse(deadlineOf(round)) +
        90 * 60_000 +
        Math.floor(index / 3) * DAY +
        (index % 3) * 2.5 * HOUR,
    ).toISOString();
    matches.push({ id, round, homeClubId: home, awayClubId: away, homeScore, awayScore, kickoff });

    for (const [club, scored, conceded, opponentLambda] of [
      [home, homeScore, awayScore, awayLambda],
      [away, awayScore, homeScore, homeLambda],
    ] as const) {
      const played = lineup(club);
      const onPitch = [...played.keys()];
      const goals = new Map<CatalogPlayer, number>();
      const assists = new Map<CatalogPlayer, number>();
      for (let goal = 0; goal < scored; goal += 1) {
        const scorer = rng.weighted(
          onPitch,
          (player) =>
            (GOAL_WEIGHT[player.position] * priceFactor(player) * played.get(player)!) / 90,
        );
        if (!scorer) continue;
        goals.set(scorer, (goals.get(scorer) ?? 0) + 1);
        if (!rng.chance(0.72)) continue;
        const provider = rng.weighted(
          onPitch.filter((player) => player !== scorer),
          (player) =>
            (ASSIST_WEIGHT[player.position] * priceFactor(player) * played.get(player)!) / 90,
        );
        if (provider) assists.set(provider, (assists.get(provider) ?? 0) + 1);
      }
      const keeper = onPitch
        .filter((player) => player.position === "GK")
        .sort((a, b) => played.get(b)! - played.get(a)!)[0];
      for (const player of onPitch) {
        const minutes = played.get(player)!;
        const scoredEvents = scorePlayerFixture(
          player.id,
          id,
          player.position,
          {
            minutes,
            goals: goals.get(player) ?? 0,
            assists: assists.get(player) ?? 0,
            cleanSheet: conceded === 0,
            goalsConceded: conceded,
            saves: player === keeper ? rng.poisson(1.4 + 1.5 * opponentLambda) : 0,
            penaltiesSaved: 0,
            penaltiesMissed: 0,
            yellowCards: rng.chance((YELLOW[player.position] * minutes) / 90) ? 1 : 0,
            redCards: rng.chance(0.004) ? 1 : 0,
            secondYellowDismissals: 0,
            ownGoals: 0,
            bonus: 0,
            playerOfMatchPoints: 0,
          },
          SCORING_RULES_V1,
        );
        const events = scoredEvents
          .filter((event) => event.points !== 0)
          .map((event) => ({ category: event.category, points: event.points, fixtureId: id }));
        const entry: PlayerRound = {
          round,
          minutes,
          points: events.reduce((sum, event) => sum + event.points, 0),
          events,
          fixtureId: id,
        };
        const list = history.get(player.id) ?? [];
        list.push(entry);
        history.set(player.id, list);
      }
    }
  });
}

/* ------------------------------------------------------------------ */
/* What the screens read                                               */
/* ------------------------------------------------------------------ */

function pointsIn(playerId: string, round: number): number {
  return history.get(playerId)?.find((entry) => entry.round === round)?.points ?? 0;
}

const nextFixture = new Map<string, { opponent: string; home: boolean }>();
for (const match of matches.filter((candidate) => candidate.round === DEMO_GAMEWEEK)) {
  nextFixture.set(match.homeClubId, { opponent: match.awayClubId, home: true });
  nextFixture.set(match.awayClubId, { opponent: match.homeClubId, home: false });
}

/**
 * The pool as the builder sees it before Journée 12: season points and form
 * over rounds 1-11 (form as the live game defines it, the mean of the last
 * five scored gameweeks), and a sample ownership share.
 */
export const players: FantasyPlayer[] = roster.map((player) => {
  const before = Array.from({ length: DEMO_GAMEWEEK - 1 }, (_, i) => pointsIn(player.id, i + 1));
  const lastFive = before.slice(-5);
  const form = Math.round((lastFive.reduce((a, b) => a + b, 0) / lastFive.length) * 10) / 10;
  const totalPoints = before.reduce((a, b) => a + b, 0);
  const noise = createRandom(`own-${player.id}`).normal(0, 1.4);
  const ownership = Math.max(
    0.2,
    Math.min(58, 0.6 + 0.9 * Math.max(form, 0) ** 1.6 + 0.55 * (player.price - 4) ** 2 + noise),
  );
  const fixture = nextFixture.get(player.clubId);
  return {
    id: player.id,
    name: { fr: player.name, ar: player.name },
    clubId: player.clubId,
    position: player.position,
    price: player.price,
    totalPoints,
    form,
    ownership: Math.round(ownership * 10) / 10,
    status: "available",
    nextOpponentClubId: fixture?.opponent,
    nextIsHome: fixture?.home,
  };
});

export function playerById(id: string | null | undefined): FantasyPlayer | undefined {
  return id ? players.find((player) => player.id === id) : undefined;
}

/** One player's Journée 12, in the shape `/fantasy/points` renders. */
export function gameweekBreakdown(playerId: string): PlayerPointsBreakdown {
  const entry = history.get(playerId)?.find((candidate) => candidate.round === DEMO_GAMEWEEK);
  return {
    playerId,
    totalPoints: entry?.points ?? 0,
    minutesPlayed: entry?.minutes ?? 0,
    status: "final",
    events: entry?.events ?? [],
  };
}

export function roundMatches(round: number): DemoMatch[] {
  return matches.filter((match) => match.round === round);
}

function tableResults(throughRound: number): TableResult[] {
  return matches.filter((match) => match.round <= throughRound);
}

/** The Botola table after `throughRound` rounds, worked out by the product's own code. */
export function standings(throughRound: number): {
  overall: LeagueTableRow[];
  home: LeagueTableRow[];
  away: LeagueTableRow[];
} {
  const results = tableResults(throughRound);
  return {
    overall: computeLeagueTable(clubIds, results, "overall"),
    home: computeLeagueTable(clubIds, results, "home"),
    away: computeLeagueTable(clubIds, results, "away"),
  };
}

/** The best Journée 12 eleven any manager could have picked, for the "highest" figure. */
export function bestPossibleScore(): number {
  const best = (position: Position, count: number) =>
    players
      .filter((player) => player.position === position)
      .map((player) => pointsIn(player.id, DEMO_GAMEWEEK))
      .sort((a, b) => b - a)
      .slice(0, count);
  const eleven = [...best("GK", 1), ...best("DEF", 4), ...best("MID", 3), ...best("FWD", 3)];
  return eleven.reduce((a, b) => a + b, 0) + Math.max(...eleven);
}
