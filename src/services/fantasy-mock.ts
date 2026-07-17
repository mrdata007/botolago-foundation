// Typed mock services for fantasy. A future Codex-built backend replaces
// implementations without touching UI components.

import type {
  FantasyPlayer,
  FantasyTeam,
  FixtureDifficulty,
  GameweekResult,
  League,
  LeagueStanding,
  TopPlayerOfWeek,
} from "@/types/fantasy";
import * as fdb from "@/mocks/fantasy-data";

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));

export const fantasyService = {
  async getPlayers(): Promise<FantasyPlayer[]> {
    return delay(fdb.fantasyPlayers);
  },
  async getPlayer(id: string): Promise<FantasyPlayer | undefined> {
    return delay(fdb.fantasyPlayers.find((p) => p.id === id));
  },
  async getTeam(): Promise<FantasyTeam> {
    return delay(fdb.fantasyTeam);
  },
  async getLeagues(type?: League["type"]): Promise<League[]> {
    const all = fdb.leagues;
    return delay(type ? all.filter((l) => l.type === type) : all);
  },
  async getLeague(id: string): Promise<League | undefined> {
    return delay(fdb.leagues.find((l) => l.id === id));
  },
  async getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
    return delay(fdb.leagueStandings[leagueId] ?? []);
  },
  async getGameweekResult(gw: number): Promise<GameweekResult | undefined> {
    return delay(fdb.gameweekResults.find((g) => g.gameweek === gw));
  },
  async getGameweekHistory(): Promise<GameweekResult[]> {
    return delay(fdb.gameweekResults);
  },
  async getFixtureDifficulty(): Promise<FixtureDifficulty[]> {
    return delay(fdb.fixtureDifficulties);
  },
  async getTopPlayersOfWeek(gameweek: number): Promise<TopPlayerOfWeek[]> {
    const gws = Object.keys(fdb.topPlayersByGameweek).map(Number);
    const fallback = gws.length ? Math.max(...gws) : gameweek;
    return delay(fdb.topPlayersByGameweek[gameweek] ?? fdb.topPlayersByGameweek[fallback] ?? []);
  },
  async getAvailableTopGameweeks(): Promise<number[]> {
    return delay(Object.keys(fdb.topPlayersByGameweek).map(Number).sort((a, b) => a - b));
  },
};

export type FantasyService = typeof fantasyService;
