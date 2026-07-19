// Typed mock services for fantasy. A future Codex-built backend replaces
// implementations without touching UI components.

import type {
  FantasyPlayer,
  FantasyTeam,
  FixtureDifficulty,
  GameweekResult,
  League,
  LeagueStanding,
  SquadPlayer,
  FormationKey,
  TopPlayerOfWeek,
} from "@/types/fantasy";
import * as fdb from "@/mocks/fantasy-data";
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));

// Locally persisted overrides on top of the mock team. Kept partial so we
// only store what the user actually changed.
export interface FantasyTeamPatch {
  formation?: FormationKey;
  squad?: SquadPlayer[];
  bank?: number;
  freeTransfers?: number;
  pendingTransfers?: number;
}

function loadPatch(): FantasyTeamPatch {
  return readJSON<FantasyTeamPatch>(STORAGE_KEYS.FANTASY_TEAM) ?? {};
}

function mergeTeam(base: FantasyTeam, patch: FantasyTeamPatch): FantasyTeam {
  return {
    ...base,
    formation: patch.formation ?? base.formation,
    squad: patch.squad ?? base.squad,
    bank: patch.bank ?? base.bank,
    freeTransfers: patch.freeTransfers ?? base.freeTransfers,
    pendingTransfers: patch.pendingTransfers ?? base.pendingTransfers,
  };
}

export const fantasyService = {
  async getPlayers(): Promise<FantasyPlayer[]> {
    return delay(fdb.fantasyPlayers);
  },
  async getPlayer(id: string): Promise<FantasyPlayer | undefined> {
    return delay(fdb.fantasyPlayers.find((p) => p.id === id));
  },
  async getTeam(): Promise<FantasyTeam> {
    return delay(mergeTeam(fdb.fantasyTeam, loadPatch()));
  },
  saveTeam(patch: FantasyTeamPatch): void {
    const current = loadPatch();
    writeJSON<FantasyTeamPatch>(STORAGE_KEYS.FANTASY_TEAM, { ...current, ...patch });
  },
  /** Compute team value (sum of squad prices) from the current merged team. */
  async getTeamValue(): Promise<number> {
    const t = mergeTeam(fdb.fantasyTeam, loadPatch());
    const total = t.squad.reduce((s, sp) => {
      const p = fdb.fantasyPlayers.find((x) => x.id === sp.playerId);
      return s + (p?.price ?? 0);
    }, 0);
    return delay(Math.round(total * 10) / 10);
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
    return delay(
      Object.keys(fdb.topPlayersByGameweek)
        .map(Number)
        .sort((a, b) => a - b),
    );
  },
};

export type FantasyService = typeof fantasyService;
