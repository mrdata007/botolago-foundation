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
import { STORAGE_KEYS, readJSON, writeJSON } from "@/lib/storage";

// The sample Fantasy data is fetched on the first call that needs it, not
// with the app: this service is also reached in production (importing a team
// built on the device before sign-up), and as a static import the sample
// players and articles downloaded on every page (FE-C3). Same data, same
// results; it simply arrives with the first read.
let sampleData: Promise<typeof import("@/mocks/fantasy-data")> | null = null;
export function loadFantasySampleData() {
  sampleData ??= import("@/mocks/fantasy-data").catch((error: unknown) => {
    sampleData = null;
    throw error;
  });
  return sampleData;
}

const delay = <T>(v: T, ms = 100) => new Promise<T>((r) => setTimeout(() => r(v), ms));

// Locally persisted overrides on top of the mock team. Kept partial so we
// only store what the user actually changed.
export interface FantasyTeamPatch {
  teamName?: string;
  managerName?: string;
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
    teamName: patch.teamName ?? base.teamName,
    managerName: patch.managerName ?? base.managerName,
    formation: patch.formation ?? base.formation,
    squad: patch.squad ?? base.squad,
    bank: patch.bank ?? base.bank,
    freeTransfers: patch.freeTransfers ?? base.freeTransfers,
    pendingTransfers: patch.pendingTransfers ?? base.pendingTransfers,
  };
}

export const fantasyService = {
  async getPlayers(): Promise<FantasyPlayer[]> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.fantasyPlayers);
  },
  async getPlayer(id: string): Promise<FantasyPlayer | undefined> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.fantasyPlayers.find((p) => p.id === id));
  },
  /**
   * Demo data: the football mock's players, as the football mock repository
   * ids them (`mock-repository.ts`: `uuid(30, index + 1)`), matched to the
   * Fantasy pool by name.
   */
  async getFootballPlayerLinks(): Promise<Record<string, string>> {
    const [fdb, { players: mockFootballPlayers }] = await Promise.all([
      loadFantasySampleData(),
      import("@/mocks/data"),
    ]);
    const links: Record<string, string> = {};
    mockFootballPlayers.forEach((player, index) => {
      const fantasy = fdb.fantasyPlayers.find((p) => p.name.fr === player.name.fr);
      if (fantasy)
        links[`00000030-0000-4000-8000-${String(index + 1).padStart(12, "0")}`] = fantasy.id;
    });
    return delay(links);
  },
  async getTeam(): Promise<FantasyTeam> {
    const fdb = await loadFantasySampleData();
    return delay(mergeTeam(fdb.fantasyTeam, loadPatch()));
  },
  saveTeam(patch: FantasyTeamPatch): void {
    const current = loadPatch();
    writeJSON<FantasyTeamPatch>(STORAGE_KEYS.FANTASY_TEAM, { ...current, ...patch });
  },
  /** Compute team value (sum of squad prices) from the current merged team. */
  async getTeamValue(): Promise<number> {
    const fdb = await loadFantasySampleData();
    const t = mergeTeam(fdb.fantasyTeam, loadPatch());
    const total = t.squad.reduce((s, sp) => {
      const p = fdb.fantasyPlayers.find((x) => x.id === sp.playerId);
      return s + (p?.price ?? 0);
    }, 0);
    return delay(Math.round(total * 10) / 10);
  },
  async getLeagues(type?: League["type"]): Promise<League[]> {
    const fdb = await loadFantasySampleData();
    const all = fdb.leagues;
    return delay(type ? all.filter((l) => l.type === type) : all);
  },
  async getLeague(id: string): Promise<League | undefined> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.leagues.find((l) => l.id === id));
  },
  async getLeagueStandings(leagueId: string): Promise<LeagueStanding[]> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.leagueStandings[leagueId] ?? []);
  },
  async getGameweekResult(gw: number): Promise<GameweekResult | undefined> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.gameweekResults.find((g) => g.gameweek === gw));
  },
  async getGameweekHistory(): Promise<GameweekResult[]> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.gameweekResults);
  },
  async getFixtureDifficulty(): Promise<FixtureDifficulty[]> {
    const fdb = await loadFantasySampleData();
    return delay(fdb.fixtureDifficulties);
  },
  async getTopPlayersOfWeek(gameweek: number): Promise<TopPlayerOfWeek[]> {
    const fdb = await loadFantasySampleData();
    const gws = Object.keys(fdb.topPlayersByGameweek).map(Number);
    const fallback = gws.length ? Math.max(...gws) : gameweek;
    return delay(fdb.topPlayersByGameweek[gameweek] ?? fdb.topPlayersByGameweek[fallback] ?? []);
  },
  async getAvailableTopGameweeks(): Promise<number[]> {
    const fdb = await loadFantasySampleData();
    return delay(
      Object.keys(fdb.topPlayersByGameweek)
        .map(Number)
        .sort((a, b) => a - b),
    );
  },
};

export type FantasyService = typeof fantasyService;
