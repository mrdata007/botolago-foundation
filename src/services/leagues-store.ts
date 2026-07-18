// Persistent leagues store: create, join, leave, delete private leagues.
// Public/cup leagues remain read-only via fantasyService.

import { readJSON, writeJSON } from "@/lib/storage";
import type { League, LeagueStanding } from "@/types/fantasy";

const KEY = "fantasy.leagues";

export type LeagueRole = "creator" | "member";

export interface PersistedLeague extends League {
  role: LeagueRole;
  standings: LeagueStanding[];
}

interface PersistedState {
  leagues: PersistedLeague[];
}

export const LEAGUE_ERROR = {
  INVALID_CODE: "fantasy.leagues.error.invalid_code",
  ALREADY_JOINED: "fantasy.leagues.error.already_joined",
  DUPLICATE_NAME: "fantasy.leagues.error.duplicate_name",
  NOT_CREATOR: "fantasy.leagues.error.not_creator",
  NOT_FOUND: "fantasy.leagues.error.not_found",
} as const;
export type LeagueErrorKey = typeof LEAGUE_ERROR[keyof typeof LEAGUE_ERROR];

export class LeagueError extends Error {
  key: LeagueErrorKey;
  constructor(key: LeagueErrorKey) { super(key); this.key = key; }
}

function readState(): PersistedState {
  return readJSON<PersistedState>(KEY) ?? { leagues: [] };
}
function writeState(s: PersistedState) { writeJSON(KEY, s); }

function genCode(): string {
  return `BOT-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
}

function meRow(score = 0): LeagueStanding {
  return { managerId: "me", managerName: "You", teamName: "Atlas XI", rank: 1, previousRank: 1, gameweekScore: 0, totalScore: score };
}

/** Deterministic mock "other manager" seed rows. */
function seedRows(count: number): LeagueStanding[] {
  const names = ["Youssef A.", "Salma B.", "Karim F.", "Nadia E.", "Anas M.", "Hicham T.", "Reda S.", "Oumaima K."];
  return Array.from({ length: count }).map((_, i) => ({
    managerId: `m_${i + 1}`,
    managerName: names[i % names.length],
    teamName: `Team ${i + 1}`,
    rank: i + 1,
    previousRank: i + 1,
    gameweekScore: 40 + ((i * 7) % 45),
    totalScore: 500 + ((i * 23) % 220),
  }));
}

function ranked(rows: LeagueStanding[]): LeagueStanding[] {
  return [...rows]
    .sort((a, b) => b.totalScore - a.totalScore || b.gameweekScore - a.gameweekScore)
    .map((r, i) => ({ ...r, previousRank: r.rank, rank: i + 1 }));
}

export const leaguesStore = {
  list(): PersistedLeague[] {
    return readState().leagues;
  },
  get(id: string): PersistedLeague | undefined {
    return this.list().find((l) => l.id === id);
  },
  create(name: string): PersistedLeague {
    const trimmed = name.trim();
    if (!trimmed) throw new LeagueError(LEAGUE_ERROR.INVALID_CODE);
    const state = readState();
    if (state.leagues.some((l) => l.name.toLowerCase() === trimmed.toLowerCase())) {
      throw new LeagueError(LEAGUE_ERROR.DUPLICATE_NAME);
    }
    const code = genCode();
    const standings = ranked([meRow(612), ...seedRows(3)]);
    const meRank = standings.findIndex((r) => r.managerId === "me") + 1;
    const league: PersistedLeague = {
      id: `pl_${Date.now().toString(36)}`,
      name: trimmed,
      type: "private",
      members: standings.length,
      rank: meRank,
      previousRank: meRank,
      score: standings.find((r) => r.managerId === "me")?.totalScore ?? 0,
      leaderName: standings[0]?.managerName ?? "—",
      code,
      role: "creator",
      standings,
    };
    writeState({ leagues: [league, ...state.leagues] });
    return league;
  },
  join(code: string): PersistedLeague {
    const trimmed = code.trim().toUpperCase();
    if (!/^BOT-[A-Z0-9]{5}$/.test(trimmed)) throw new LeagueError(LEAGUE_ERROR.INVALID_CODE);
    const state = readState();
    if (state.leagues.some((l) => l.code === trimmed)) throw new LeagueError(LEAGUE_ERROR.ALREADY_JOINED);
    const standings = ranked([meRow(612), ...seedRows(5)]);
    const meRank = standings.findIndex((r) => r.managerId === "me") + 1;
    const league: PersistedLeague = {
      id: `pl_${Date.now().toString(36)}`,
      name: `Ligue ${trimmed}`,
      type: "private",
      members: standings.length,
      rank: meRank,
      previousRank: meRank,
      score: standings.find((r) => r.managerId === "me")?.totalScore ?? 0,
      leaderName: standings[0]?.managerName ?? "—",
      code: trimmed,
      role: "member",
      standings,
    };
    writeState({ leagues: [league, ...state.leagues] });
    return league;
  },
  leave(id: string): void {
    const state = readState();
    const league = state.leagues.find((l) => l.id === id);
    if (!league) throw new LeagueError(LEAGUE_ERROR.NOT_FOUND);
    if (league.role === "creator") throw new LeagueError(LEAGUE_ERROR.NOT_CREATOR);
    writeState({ leagues: state.leagues.filter((l) => l.id !== id) });
  },
  delete(id: string): void {
    const state = readState();
    const league = state.leagues.find((l) => l.id === id);
    if (!league) throw new LeagueError(LEAGUE_ERROR.NOT_FOUND);
    if (league.role !== "creator") throw new LeagueError(LEAGUE_ERROR.NOT_CREATOR);
    writeState({ leagues: state.leagues.filter((l) => l.id !== id) });
  },
  reset(): void {
    writeState({ leagues: [] });
  },
};
