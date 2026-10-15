import {
  toRoundRecapView,
  type RecapPlayer,
  type RoundRecapMember,
  type RoundRecapView,
} from "@/backend/premium/round-recap";

/**
 * The example journée of « Votre journée expliquée »: Karim B. (KACM), journée 11 of the example
 * season, in a league of five. It is the picture a non-member sees blurred and, in development, the
 * mock member's data. Players are the names the app's mock data already carries. It is a fixed
 * dataset: a member's real figures are never rendered under the blur.
 *
 * The arithmetic is the one of the owner's design: starters 71 (one starter still unscored, so the
 * score waits), captain 8 × 2 = 16 (+3 on the league's captains), one transfer worth +3 and −4 for the
 * hit (−1), the rest +7, a score of 75 against a league average of 66.
 */

const id = (n: number) => `00000000-0000-4000-8000-${String(900 + n).padStart(12, "0")}`;

interface Row {
  n: number;
  name: string;
  position: "GK" | "DEF" | "MID" | "FWD";
  slot: "starter" | "bench";
  order: number;
  points: number | null;
  minutes: number;
  captain?: boolean;
  vice?: boolean;
  pending?: boolean;
}

function player(row: Row): RecapPlayer {
  const onPitch = row.slot === "starter";
  return {
    fantasyPlayerId: id(row.n),
    name: row.name,
    position: row.position,
    slot: row.slot,
    order: row.order,
    captain: row.captain ?? false,
    viceCaptain: row.vice ?? false,
    onPitch,
    counted: onPitch,
    pending: row.pending ?? false,
    points: row.pending ? null : row.points,
    minutes: row.minutes,
    played: row.minutes > 0,
  };
}

const LEAGUE = {
  id: "00000000-0000-4000-8000-000000000701",
  name: "Les Lions du Derb",
  members: 5,
};

const J11_ROWS: Row[] = [
  { n: 1, name: "Tagnaouti", position: "GK", slot: "starter", order: 1, points: 7, minutes: 90 },
  { n: 2, name: "Aznou", position: "DEF", slot: "starter", order: 2, points: 6, minutes: 90 },
  {
    n: 3,
    name: "Attiat-Allah",
    position: "DEF",
    slot: "starter",
    order: 3,
    points: 7,
    minutes: 90,
  },
  { n: 4, name: "Dari", position: "DEF", slot: "starter", order: 4, points: 6, minutes: 90 },
  { n: 5, name: "Jaadi", position: "MID", slot: "starter", order: 5, points: 8, minutes: 90 },
  {
    n: 6,
    name: "El Moutaraji",
    position: "MID",
    slot: "starter",
    order: 6,
    points: 9,
    minutes: 90,
  },
  { n: 7, name: "Bassi", position: "MID", slot: "starter", order: 7, points: 7, minutes: 90 },
  {
    n: 8,
    name: "Ayoub Nanah",
    position: "MID",
    slot: "starter",
    order: 8,
    points: null,
    minutes: 90,
    pending: true,
  },
  { n: 9, name: "Haddad", position: "FWD", slot: "starter", order: 9, points: 7, minutes: 90 },
  {
    n: 10,
    name: "Bouly Sambou",
    position: "FWD",
    slot: "starter",
    order: 10,
    points: 8,
    minutes: 90,
    captain: true,
  },
  { n: 11, name: "Malango", position: "FWD", slot: "starter", order: 11, points: 6, minutes: 90 },
  { n: 12, name: "Aziz Boura", position: "DEF", slot: "bench", order: 1, points: 7, minutes: 90 },
  {
    n: 13,
    name: "Youssef Mehri",
    position: "MID",
    slot: "bench",
    order: 2,
    points: 6,
    minutes: 90,
  },
  {
    n: 14,
    name: "Zouhir Laâroubi",
    position: "FWD",
    slot: "bench",
    order: 3,
    points: 0,
    minutes: 0,
  },
];

/** Journée 11: one starter's points are not published yet, so the score is « en attente ». */
export const EXAMPLE_RECAP_J11: RoundRecapMember = {
  available: true,
  locked: false,
  minGroup: 3,
  league: LEAGUE,
  gameweeks: [
    { id: id(111), seq: 11, name: "Journée 11", status: "provisional", settled: false },
    { id: id(110), seq: 10, name: "Journée 10", status: "finalized", settled: true },
  ],
  gameweek: {
    id: id(111),
    seq: 11,
    name: "Journée 11",
    status: "provisional",
    settled: false,
    corrected: false,
    calculationVersion: 4,
    publishedAt: null,
  },
  me: {
    score: 75,
    startingPoints: 71,
    benchPoints: 13,
    captainBonus: 8,
    transferHit: 4,
    chip: null,
    rank: 3,
    previousRank: 4,
    movement: 1,
  },
  leagueFigures: { scored: 5, average: 66, best: 81, settled: false, captainAverage: 13 },
  explain: {
    vsLeague: 9,
    captain: {
      fantasyPlayerId: id(10),
      name: "Bouly Sambou",
      multiplier: 2,
      usedVice: false,
      pending: false,
      points: 8,
      counted: 16,
      vsLeague: 3,
    },
    transfers: [
      {
        playerOutId: id(20),
        playerInId: id(6),
        playerOut: "Reda Slim",
        playerIn: "Zouhair El Moutaraji",
        outPoints: 6,
        inPoints: 9,
        hitShare: 4,
        pending: false,
        gain: 3,
        net: -1,
      },
    ],
    transfersNet: -1,
    others: 7,
    othersIsRemainder: true,
  },
  players: J11_ROWS.map(player),
  autoSubstitutions: [],
  pendingPlayers: 1,
};

const J10_ROWS: Row[] = [
  { n: 1, name: "Tagnaouti", position: "GK", slot: "starter", order: 1, points: 6, minutes: 90 },
  { n: 2, name: "Aznou", position: "DEF", slot: "starter", order: 2, points: 5, minutes: 90 },
  {
    n: 3,
    name: "Attiat-Allah",
    position: "DEF",
    slot: "starter",
    order: 3,
    points: 7,
    minutes: 90,
  },
  { n: 4, name: "Dari", position: "DEF", slot: "starter", order: 4, points: 6, minutes: 90 },
  { n: 5, name: "Jaadi", position: "MID", slot: "starter", order: 5, points: 7, minutes: 90 },
  { n: 20, name: "Reda Slim", position: "MID", slot: "starter", order: 6, points: 6, minutes: 90 },
  { n: 7, name: "Bassi", position: "MID", slot: "starter", order: 7, points: 6, minutes: 90 },
  { n: 8, name: "Ayoub Nanah", position: "MID", slot: "starter", order: 8, points: 7, minutes: 90 },
  {
    n: 9,
    name: "Haddad",
    position: "FWD",
    slot: "starter",
    order: 9,
    points: 8,
    minutes: 90,
    captain: true,
  },
  {
    n: 10,
    name: "Bouly Sambou",
    position: "FWD",
    slot: "starter",
    order: 10,
    points: 7,
    minutes: 90,
  },
  { n: 11, name: "Malango", position: "FWD", slot: "starter", order: 11, points: 5, minutes: 90 },
  { n: 12, name: "Aziz Boura", position: "DEF", slot: "bench", order: 1, points: 6, minutes: 90 },
  {
    n: 13,
    name: "Youssef Mehri",
    position: "MID",
    slot: "bench",
    order: 2,
    points: 5,
    minutes: 90,
  },
  {
    n: 14,
    name: "Zouhir Laâroubi",
    position: "FWD",
    slot: "bench",
    order: 3,
    points: 3,
    minutes: 61,
  },
];

/** Journée 10: published, every score final. Starters 70, captain 8 × 2 = 16, no transfer. */
export const EXAMPLE_RECAP_J10: RoundRecapMember = {
  ...EXAMPLE_RECAP_J11,
  gameweek: {
    id: id(110),
    seq: 10,
    name: "Journée 10",
    status: "finalized",
    settled: true,
    corrected: false,
    calculationVersion: 4,
    publishedAt: "2026-10-05T18:00:00+00:00",
  },
  me: {
    score: 78,
    startingPoints: 70,
    benchPoints: 14,
    captainBonus: 8,
    transferHit: 0,
    chip: null,
    rank: 4,
    previousRank: 5,
    movement: 1,
  },
  leagueFigures: { scored: 5, average: 66, best: 78, settled: true, captainAverage: 12 },
  explain: {
    vsLeague: 12,
    captain: {
      fantasyPlayerId: id(9),
      name: "Haddad",
      multiplier: 2,
      usedVice: false,
      pending: false,
      points: 8,
      counted: 16,
      vsLeague: 4,
    },
    transfers: [],
    transfersNet: 0,
    others: 8,
    othersIsRemainder: true,
  },
  players: J10_ROWS.map(player),
  pendingPlayers: 0,
};

/** The view a non-member sees blurred: journée 11 of the example league. */
export const EXAMPLE_RECAP_VIEW: RoundRecapView = toRoundRecapView(EXAMPLE_RECAP_J11);
