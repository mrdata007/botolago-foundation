/**
 * The sample managers' leaderboard.
 *
 * Every manager here is invented: first name and initial, a team name in the
 * style Moroccan players give theirs, and Fantasy scores drawn around the
 * sample season's own average. The board is seeded, so it is the same on
 * every device.
 */
import type { LeagueStanding } from "@/types/fantasy";

import { DEMO_GAMEWEEK } from "./world";
import { createRandom } from "./random";

export const BOARD_SIZE = 2764;

const FIRST_NAMES = [
  "Youssef",
  "Salma",
  "Achraf",
  "Nadia",
  "Mehdi",
  "Imane",
  "Hamza",
  "Sofia",
  "Anas",
  "Khadija",
  "Reda",
  "Meryem",
  "Bilal",
  "Ghita",
  "Omar",
  "Hind",
  "Ayoub",
  "Sara",
  "Zakaria",
  "Amina",
  "Othmane",
  "Kenza",
  "Ilyas",
  "Houda",
  "Soufiane",
  "Asmae",
  "Karim",
  "Loubna",
  "Nabil",
  "Rim",
  "Tarik",
  "Wiam",
  "Walid",
  "Nour",
  "Hicham",
  "Chaimae",
  "Ismail",
  "Yasmine",
  "Adil",
  "Oumaima",
];
const LAST_INITIALS = "ABCDEFGHIKLMNORSTZ".split("");
const TEAM_PREFIX = [
  "Aigles",
  "Lions",
  "Étoiles",
  "Panthères",
  "Faucons",
  "Titans",
  "Cavaliers",
  "Dragons",
  "Corsaires",
  "Phénix",
  "Guerriers",
  "Loups",
];
const TEAM_SUFFIX = [
  "de Casa",
  "de Rabat",
  "de Fès",
  "du Souss",
  "de Tanger",
  "de l'Atlas",
  "du Rif",
  "de Marrakech",
  "d'Oujda",
  "du Draa",
  "de Salé",
  "d'Agadir",
  "de Meknès",
  "de Tétouan",
  "de Kénitra",
  "d'El Jadida",
];
const ARABIC_TEAMS = [
  "نسور الأطلس",
  "أسود البيضاء",
  "نجوم فاس",
  "صقور طنجة",
  "فرسان مراكش",
  "رجال الرباط",
  "ذئاب سوس",
  "أبطال الريف",
];

interface Manager {
  id: string;
  managerName: string;
  teamName: string;
  /** Points before Journée 11, after it, and in Journée 12. */
  before11: number;
  gw11: number;
  gw12: number;
}

const managers: Manager[] = (() => {
  const rng = createRandom("botolago-demo-managers");
  const score = () => Math.round(Math.min(124, Math.max(6, rng.normal(47, 14))));
  return Array.from({ length: BOARD_SIZE }, (_, index) => {
    // Most joined for Journée 1; the rest arrived along the way.
    const joined = rng.chance(0.72) ? 1 : rng.int(2, DEMO_GAMEWEEK - 1);
    let before11 = 0;
    for (let round = joined; round < DEMO_GAMEWEEK - 1; round += 1) before11 += score();
    const arabic = rng.chance(0.14);
    const teamName = arabic
      ? ARABIC_TEAMS[rng.int(0, ARABIC_TEAMS.length - 1)]
      : `${TEAM_PREFIX[rng.int(0, TEAM_PREFIX.length - 1)]} ${
          TEAM_SUFFIX[rng.int(0, TEAM_SUFFIX.length - 1)]
        }`;
    return {
      id: `m-${index + 1}`,
      managerName: `${FIRST_NAMES[rng.int(0, FIRST_NAMES.length - 1)]} ${
        LAST_INITIALS[rng.int(0, LAST_INITIALS.length - 1)]
      }.`,
      teamName,
      before11,
      gw11: score(),
      gw12: score(),
    };
  });
})();

export interface MyEntry {
  teamName: string;
  managerName: string;
  /** Journée 12 points; the demo manager joined for Journée 12. */
  points: number;
}

/**
 * The overall board after Journée 11 (`played` false) or 12 (`played` true),
 * ranked by total, with the previous round's rank for the ▲/▼ column. Level
 * totals share a rank, as the live board does.
 */
export function overallBoard(played: boolean, me?: MyEntry): LeagueStanding[] {
  const current = (m: Manager) => m.before11 + m.gw11 + (played ? m.gw12 : 0);
  const previous = (m: Manager) => m.before11 + (played ? m.gw11 : 0);
  const previousRank = rankBy(managers, previous);
  const rows: LeagueStanding[] = managers.map((m) => ({
    managerId: m.id,
    managerName: m.managerName,
    teamName: m.teamName,
    rank: 0,
    previousRank: previousRank.get(m.id)!,
    gameweekScore: played ? m.gw12 : m.gw11,
    totalScore: current(m),
  }));
  if (played && me) {
    rows.push({
      managerId: "me",
      managerName: me.managerName,
      teamName: me.teamName,
      rank: 0,
      previousRank: 0,
      gameweekScore: me.points,
      totalScore: me.points,
    });
  }
  return rank(
    rows,
    (row) => row.totalScore,
    (row) => row.gameweekScore,
  );
}

/** The Journée board: this gameweek's points alone. Movement is not shown for it. */
export function gameweekBoard(played: boolean, me?: MyEntry): LeagueStanding[] {
  return rank(
    overallBoard(played, me),
    (row) => row.gameweekScore,
    (row) => row.totalScore,
  ).map((row) => ({ ...row, previousRank: row.rank }));
}

function rankBy(list: Manager[], value: (m: Manager) => number): Map<string, number> {
  const sorted = [...list].sort((a, b) => value(b) - value(a));
  const ranks = new Map<string, number>();
  sorted.forEach((m, index) => {
    const prior = sorted[index - 1];
    ranks.set(m.id, prior && value(prior) === value(m) ? ranks.get(prior.id)! : index + 1);
  });
  return ranks;
}

function rank(
  rows: LeagueStanding[],
  value: (row: LeagueStanding) => number,
  tiebreak: (row: LeagueStanding) => number,
): LeagueStanding[] {
  const sorted = [...rows].sort(
    (a, b) =>
      value(b) - value(a) || tiebreak(b) - tiebreak(a) || a.teamName.localeCompare(b.teamName),
  );
  let shown = 0;
  return sorted.map((row, index) => {
    const prior = sorted[index - 1];
    if (!prior || value(prior) !== value(row)) shown = index + 1;
    return { ...row, rank: shown, previousRank: row.previousRank || shown };
  });
}

/** Journée 12's average and best, across every manager on the board. */
export function gameweekFigures(me?: MyEntry): { average: number; highest: number } {
  const scores = managers.map((m) => m.gw12);
  if (me) scores.push(me.points);
  return {
    average: Math.round(scores.reduce((a, b) => a + b, 0) / scores.length),
    highest: Math.max(...scores),
  };
}
