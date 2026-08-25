import "./__test-shim";
import { afterEach, beforeEach, describe, it, expect } from "bun:test";
import {
  selectFantasyRepoSource,
  createFantasyOwnedRepository,
  CloudFantasyRepository,
  GuestFantasyRepository,
  LocalFantasyRepository,
  buildV2CloudSnapshot,
  buildV2LineupSelection,
  isV2FantasyPlayerId,
} from "./fantasy-owned-repository";
import { FantasyRepoError, toRepoError } from "./fantasy-errors";
import { FantasyCloudError } from "./fantasy-cloud-repo";
import { MissingIdMappingError } from "./fantasy-id-map";
import { removeKey, STORAGE_KEYS } from "@/lib/storage";
import type { FantasyTeamDto } from "@/backend/fantasy/contracts";
import { FantasyError } from "@/backend/fantasy/errors";

describe("buildV2CloudSnapshot", () => {
  it("uses the authoritative hub sequence for an empty cloud team", () => {
    const gameweek = {
      id: "00000000-0000-4000-8000-000000000001",
      sequence: 1,
      name: "Gameweek 1",
      deadlineAt: "2026-08-21T18:00:00.000Z",
      status: "open",
      pointsState: "provisional",
    } as const;

    const snapshot = buildV2CloudSnapshot(null, gameweek);

    expect(snapshot.currentGameweekId).toBe(gameweek.id);
    expect(snapshot.lifecycle.currentGameweek).toBe(1);
  });

  it("uses the authoritative hub identity during rollover for an existing cloud team", () => {
    const gameweek = {
      id: "00000000-0000-4000-8000-000000000001",
      sequence: 1,
      name: "Gameweek 1",
      deadlineAt: "2026-08-21T18:00:00.000Z",
      status: "open",
      pointsState: "provisional",
    } as const;
    const team: FantasyTeamDto = {
      id: "00000000-0000-4000-8000-000000000002",
      seasonId: "00000000-0000-4000-8000-000000000003",
      name: "Atlas QA",
      currentGameweekId: "00000000-0000-4000-8000-000000000009",
      version: 1,
      bank: 100,
      teamValue: 100,
      freeTransfers: 1,
      status: "active",
      createdAt: "2026-08-07T00:00:00.000Z",
      updatedAt: "2026-08-07T00:00:00.000Z",
      squad: [],
      lineup: [],
      chips: { active: null, activeCancellable: false, used: [] },
    };

    const snapshot = buildV2CloudSnapshot(team, gameweek);

    expect(snapshot.currentGameweekId).toBe(gameweek.id);
    expect(snapshot.lifecycle.currentGameweek).toBe(1);
  });

  it("falls back to gameweek 1 when the provider has not published a gameweek", () => {
    const snapshot = buildV2CloudSnapshot(null, null);

    expect(snapshot.currentGameweekId).toBeNull();
    expect(snapshot.lifecycle.currentGameweek).toBe(1);
  });
});

describe("buildV2LineupSelection", () => {
  it("rejects local mock identifiers before a V2 mutation", () => {
    expect(isV2FantasyPlayerId("fp_mock_1")).toBe(false);
    expect(isV2FantasyPlayerId("00000000-0000-4000-8000-000000000010")).toBe(true);

    let caught: unknown;
    try {
      buildV2LineupSelection({
        squad: [{ playerId: "fp_mock_1", slot: 1 }],
      });
    } catch (error) {
      caught = error;
    }

    expect(caught).toBeInstanceOf(FantasyRepoError);
    expect((caught as FantasyRepoError).code).toBe("mapping_incomplete");
    expect((caught as FantasyRepoError).missingIds?.players).toEqual(["fp_mock_1"]);
  });
});

// ---------- source selector ----------

describe("selectFantasyRepoSource", () => {
  it("returns cloud only for supabase mode + authenticated", () => {
    expect(selectFantasyRepoSource({ authMode: "supabase", isAuthenticated: true })).toBe("cloud");
    expect(selectFantasyRepoSource({ authMode: "supabase", isAuthenticated: false })).toBe("guest");
    expect(selectFantasyRepoSource({ authMode: "mock", isAuthenticated: true })).toBe("local");
    expect(selectFantasyRepoSource({ authMode: "mock", isAuthenticated: false })).toBe("local");
  });
});

describe("createFantasyOwnedRepository", () => {
  it("returns a read-only guest repository for anonymous Supabase mode", () => {
    const repo = createFantasyOwnedRepository({
      authMode: "supabase",
      isAuthenticated: false,
      userId: null,
    });
    expect(repo).toBeInstanceOf(GuestFantasyRepository);
    expect(repo.source).toBe("guest");
  });
  it("denies every guest mutation with a stable authentication error", async () => {
    const repo = new GuestFantasyRepository();
    const error = await repo
      .saveTeam({} as never)
      .then(() => null)
      .catch((caught) => caught);
    expect(error).toBeInstanceOf(FantasyRepoError);
    expect(error.code).toBe("unauthenticated");
  });
  it("throws typed unauthenticated when cloud is required but userId is null", () => {
    let e: unknown;
    try {
      createFantasyOwnedRepository({
        authMode: "supabase",
        isAuthenticated: true,
        userId: null,
      });
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(FantasyRepoError);
    expect((e as FantasyRepoError).code).toBe("unauthenticated");
  });
});

describe("LocalFantasyRepository.saveTeam", () => {
  beforeEach(() => removeKey(STORAGE_KEYS.FANTASY_TEAM));
  afterEach(() => removeKey(STORAGE_KEYS.FANTASY_TEAM));

  it("persists the user-facing team and manager names with the squad", async () => {
    const repo = new LocalFantasyRepository();
    const initial = await repo.loadSnapshot();

    const saved = await repo.saveTeam({
      teamName: "Test Atlas",
      managerName: "Rachid Demo",
      formation: initial.team.formation,
      bank: 17,
      freeTransfers: initial.team.freeTransfers,
      pendingTransfers: initial.team.pendingTransfers,
      squad: initial.team.squad,
      purchasePrices: initial.purchasePrices,
      expectedVersion: initial.version,
      currentGameweekId: initial.currentGameweekId,
      lifecycle: initial.lifecycle,
    });

    expect(saved.team.teamName).toBe("Test Atlas");
    expect(saved.team.managerName).toBe("Rachid Demo");
    expect(saved.team.bank).toBe(17);
    expect(saved.team.squad).toEqual(initial.team.squad);
  });
});

// ---------- error mapping ----------

describe("toRepoError", () => {
  it("maps MissingIdMappingError to mapping_incomplete with aggregate ids", () => {
    const err = new MissingIdMappingError({ missingPlayers: ["a", "b"] });
    const mapped = toRepoError(err);
    expect(mapped.code).toBe("mapping_incomplete");
    expect(mapped.missingIds?.players).toEqual(["a", "b"]);
  });
  it("maps FantasyCloudError version_conflict through unchanged", () => {
    const mapped = toRepoError(new FantasyCloudError("version_conflict", "stale"));
    expect(mapped.code).toBe("version_conflict");
  });
  it("preserves exact backend FantasyError codes alongside stable UI categories", () => {
    const cases = [
      ["version_conflict", "version_conflict"],
      ["budget_exceeded", "validation"],
      ["league_access_denied", "permission_denied"],
      ["fantasy_team_not_found", "not_found"],
      ["data_unavailable", "unknown"],
    ] as const;

    for (const [domainCode, code] of cases) {
      const mapped = toRepoError(new FantasyError(domainCode, domainCode));
      expect(mapped.code).toBe(code);
      expect(mapped.domainCode).toBe(domainCode);
    }
  });
  it("preserves symbolic domain codes returned as PostgREST-like objects", () => {
    const mapped = toRepoError({ code: "fantasy_gameweek_locked", message: "locked" });
    expect(mapped.code).toBe("validation");
    expect(mapped.domainCode).toBe("fantasy_gameweek_locked");
  });
  it("passes through an existing FantasyRepoError", () => {
    const e = new FantasyRepoError("permission_denied", "rls");
    expect(toRepoError(e)).toBe(e);
  });
});

// ---------- cloud adapter with injected fake supabase ----------

function makeIdMap() {
  const players = new Map<string, string>();
  const rev = new Map<string, string>();
  for (let i = 1; i <= 15; i++) {
    players.set(`fp_war_${i}`, `p${i}`);
    rev.set(`p${i}`, `fp_war_${i}`);
  }
  return {
    clubIdBySource: new Map(),
    clubSourceById: new Map(),
    playerIdBySource: players,
    playerSourceById: rev,
  };
}

function makeFakeClient(state: {
  team: any | null;
  squad: any[];
  rpcHandler?: (name: string, args: any) => { data?: any; error?: any };
}) {
  return {
    from(table: string) {
      const rows = table === "fantasy_teams" ? (state.team ? [state.team] : []) : state.squad;
      const chain: any = {
        _rows: rows,
        select() {
          return this;
        },
        eq() {
          return this;
        },
        order() {
          return this;
        },
        maybeSingle() {
          return Promise.resolve({ data: this._rows[0] ?? null, error: null });
        },
        then(res: any) {
          res({ data: this._rows, error: null });
        },
      };
      // make it awaitable to return rows
      chain[Symbol.asyncIterator] = undefined;
      const p = Promise.resolve({ data: rows, error: null });
      Object.assign(chain, {
        then: (r: any, j: any) => p.then(r, j),
      });
      return chain;
    },
    rpc(name: string, args: any) {
      const handler = state.rpcHandler;
      const result = handler ? handler(name, args) : { data: null, error: null };
      return Promise.resolve({ data: result.data ?? null, error: result.error ?? null });
    },
  } as any;
}

function baseSquadRows(teamId = "team-1") {
  return Array.from({ length: 15 }, (_, i) => ({
    team_id: teamId,
    player_id: `p${i + 1}`,
    slot: i + 1,
    is_captain: i === 0,
    is_vice: i === 1,
    purchase_price: 5 + i * 0.1,
  }));
}

describe("CloudFantasyRepository.loadSnapshot", () => {
  it("returns emptyCloudSquad=true when team has no squad rows", async () => {
    const client = makeFakeClient({
      team: {
        id: "t1",
        user_id: "u1",
        team_name: "T",
        manager_name: "M",
        formation: "4-4-2",
        bank: 100,
        free_transfers: 1,
        pending_transfers: 0,
        current_gameweek_id: null,
        version: 3,
        lifecycle_state: null,
      },
      squad: [],
    });
    const repo = new CloudFantasyRepository({
      client,
      userId: "u1",
      season: "2025-26",
      loadMap: async () => makeIdMap(),
      loadGameweeks: async () => ({ bySeasonAndNumber: new Map(), seasons: [] }),
    });
    const snap = await repo.loadSnapshot();
    expect(snap.source).toBe("cloud");
    expect(snap.teamId).toBe("t1");
    expect(snap.version).toBe(3);
    expect(snap.emptyCloudSquad).toBe(true);
    expect(snap.team.squad.length).toBe(0);
  });

  it("returns emptyCloudSquad=true and teamId=null when no team row exists", async () => {
    const client = makeFakeClient({ team: null, squad: [] });
    const repo = new CloudFantasyRepository({
      client,
      userId: "u1",
      season: "2025-26",
      loadMap: async () => makeIdMap(),
      loadGameweeks: async () => ({ bySeasonAndNumber: new Map(), seasons: [] }),
    });
    const snap = await repo.loadSnapshot();
    expect(snap.teamId).toBeNull();
    expect(snap.emptyCloudSquad).toBe(true);
  });

  it("maps a full 15-row cloud squad back to source ids with purchase prices", async () => {
    const client = makeFakeClient({
      team: {
        id: "team-1",
        user_id: "u1",
        team_name: "T",
        manager_name: null,
        formation: "4-4-2",
        bank: 2.5,
        free_transfers: 1,
        pending_transfers: 0,
        current_gameweek_id: "gw-1",
        version: 5,
        lifecycle_state: {
          chips: { active: null, used: [] },
          currentGameweek: 14,
          transferHitPoints: 0,
          results: {},
        },
      },
      squad: baseSquadRows(),
    });
    const repo = new CloudFantasyRepository({
      client,
      userId: "u1",
      season: "2025-26",
      loadMap: async () => makeIdMap(),
      loadGameweeks: async () => ({ bySeasonAndNumber: new Map(), seasons: [] }),
    });
    const snap = await repo.loadSnapshot();
    expect(snap.team.squad.length).toBe(15);
    expect(snap.team.squad[0].playerId).toBe("fp_war_1");
    expect(snap.team.squad[0].isCaptain).toBe(true);
    expect(snap.purchasePrices["fp_war_1"]).toBeCloseTo(5.0, 5);
    expect(snap.emptyCloudSquad).toBe(false);
    expect(snap.currentGameweekId).toBe("gw-1");
    expect(snap.version).toBe(5);
  });

  it("propagates version_conflict from RPC without falling back", async () => {
    const client = makeFakeClient({
      team: {
        id: "team-1",
        user_id: "u1",
        team_name: "T",
        manager_name: null,
        formation: "4-4-2",
        bank: 0,
        free_transfers: 1,
        pending_transfers: 0,
        current_gameweek_id: "gw-1",
        version: 1,
        lifecycle_state: null,
      },
      squad: baseSquadRows(),
      rpcHandler: () => ({ error: { code: "40001", message: "Version conflict" } }),
    });
    const repo = new CloudFantasyRepository({
      client,
      userId: "u1",
      season: "2025-26",
      loadMap: async () => makeIdMap(),
      loadGameweeks: async () => ({ bySeasonAndNumber: new Map(), seasons: [] }),
    });
    let e: unknown;
    try {
      await repo.saveTeam({
        teamName: "T",
        managerName: null,
        formation: "4-4-2",
        bank: 0,
        freeTransfers: 1,
        pendingTransfers: 0,
        squad: Array.from({ length: 15 }, (_, i) => ({
          playerId: `fp_war_${i + 1}`,
          slot: i + 1,
          isCaptain: i === 0,
          isViceCaptain: i === 1,
        })),
        purchasePrices: Object.fromEntries(
          Array.from({ length: 15 }, (_, i) => [`fp_war_${i + 1}`, 5]),
        ),
        expectedVersion: 1,
        currentGameweekId: "gw-1",
        lifecycle: {
          chips: { active: null, used: [] },
          currentGameweek: 14,
          transferHitPoints: 0,
          results: {},
        },
      });
    } catch (err) {
      e = err;
    }
    expect(e).toBeInstanceOf(FantasyRepoError);
    expect((e as FantasyRepoError).code).toBe("version_conflict");
  });
});
