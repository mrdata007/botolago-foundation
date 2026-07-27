// Global fantasy rankings — pure, deterministic leaderboard logic.
//
// The mock data mode needs a believable season-wide leaderboard. Everything
// here is pure and seeded so ordering is stable across reloads and testable
// without touching the network or storage.

import type { LeagueStanding } from "@/types/fantasy";

export type RankingsSort = "overall" | "gameweek";

export interface RankingsQuery {
  page: number;
  pageSize: number;
  sort: RankingsSort;
  query: string;
  meId?: string;
  /** The signed-in manager's entry, merged into the board by score. */
  me?: LeagueStanding;
}

export interface RankingsPage {
  rows: LeagueStanding[];
  total: number;
  /** Top 3 of the *overall* board, independent of paging/search. */
  podium: LeagueStanding[];
  myRank?: LeagueStanding;
}

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
];

/** Deterministic 32-bit hash — same input always yields the same board. */
function hash(seed: string): number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

export const GLOBAL_RANKINGS_SIZE = 500;

/**
 * Builds the full season leaderboard. Rank 1 has the highest total score and
 * `previousRank` is derived from the same seed so movement is stable too.
 */
export function buildGlobalRankings(size = GLOBAL_RANKINGS_SIZE): LeagueStanding[] {
  const rows: LeagueStanding[] = [];
  for (let i = 0; i < size; i += 1) {
    const seed = hash(`botolago-rank-${i}`);
    const managerName = `${FIRST_NAMES[seed % FIRST_NAMES.length]} ${
      LAST_INITIALS[(seed >> 3) % LAST_INITIALS.length]
    }.`;
    const teamName = `${TEAM_PREFIX[(seed >> 5) % TEAM_PREFIX.length]} ${
      TEAM_SUFFIX[(seed >> 9) % TEAM_SUFFIX.length]
    }`;
    // Monotonically decreasing totals with a small deterministic jitter.
    const totalScore = 1600 - i * 3 - (seed % 3);
    const gameweekScore = 28 + (seed % 51);
    const drift = ((seed >> 11) % 9) - 4;
    const rank = i + 1;
    rows.push({
      managerId: `gm-${i}`,
      managerName,
      teamName,
      rank,
      previousRank: Math.max(1, Math.min(size, rank + drift)),
      gameweekScore,
      totalScore,
    });
  }
  return rows;
}

function sortRows(rows: LeagueStanding[], sort: RankingsSort): LeagueStanding[] {
  if (sort === "overall") return rows;
  return [...rows]
    .sort((a, b) => b.gameweekScore - a.gameweekScore || a.totalScore - b.totalScore)
    .map((row, index) => ({ ...row, rank: index + 1, previousRank: row.rank }));
}

export function matchesQuery(row: LeagueStanding, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return (
    row.managerName.toLowerCase().includes(q) || row.teamName.toLowerCase().includes(q)
  );
}

/**
 * Merges the signed-in manager into the board (if not already there) and
 * recomputes overall ranks by total score.
 */
export function mergeMe(all: LeagueStanding[], me?: LeagueStanding): LeagueStanding[] {
  if (!me) return all;
  const without = all.filter((row) => row.managerId !== me.managerId);
  return [...without, me]
    .sort((a, b) => b.totalScore - a.totalScore)
    .map((row, index) => ({ ...row, rank: index + 1 }));
}

/** Applies sort, search and pagination to a full board. Pure. */
export function selectRankingsPage(
  all: LeagueStanding[],
  { page, pageSize, sort, query, meId, me }: RankingsQuery,
): RankingsPage {
  const board = mergeMe(all, me);
  const sorted = sortRows(board, sort);
  const filtered = query.trim() ? sorted.filter((row) => matchesQuery(row, query)) : sorted;
  const total = filtered.length;
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.max(1, Math.min(pageCount, Math.floor(page) || 1));
  const start = (safePage - 1) * pageSize;
  const id = me?.managerId ?? meId;
  return {
    rows: filtered.slice(start, start + pageSize),
    total,
    podium: sorted.slice(0, 3),
    myRank: id ? sorted.find((row) => row.managerId === id) : undefined,
  };
}

/** Page number (1-based) that contains a given rank. */
export function pageForRank(rank: number, pageSize: number): number {
  return Math.max(1, Math.ceil(rank / pageSize));
}
