// @ts-nocheck
// Pass 3.2-H3 — Fantasy import service tests.
//
// Deterministic; no Supabase. Covers:
//   1. happy path uses local snapshot + lifecycle, resolves GW UUID,
//      invokes cloud saveTeam once.
//   2. mapping failure surfaces aggregate MissingIdMappingError as
//      FantasyRepoError("mapping_incomplete") with the missing ids list.
//   3. network / RLS / conflict / validation / gameweek_unresolved all
//      throw typed errors and never touch marker (caller responsibility).
//   4. localized default team name used when local team.teamName is empty.
//   5. cloud snapshot returned as-is; service does not mutate local state.

import { describe, it, expect, beforeEach } from "bun:test";
import "./__test-shim";
import { STORAGE_KEYS } from "@/lib/storage";

import {
  importLocalTeamToCloud,
  prepareImportPayload,
} from "./fantasy-import-service";
import { FantasyRepoError, toRepoError } from "./fantasy-errors";
import { MissingIdMappingError } from "./fantasy-id-map";
import { buildGameweekIndex } from "./fantasy-gameweek-resolver";
import { fantasyService } from "./fantasy-mock";

const SEASON = "2025-26";

async function loadPlayersReal() {
  return await fantasyService.getPlayers();
}

async function localRepoWithRealTeam() {
  const team = await fantasyService.getTeam();
  const players = await loadPlayersReal();
  const purchasePrices: Record<string, number> = {};
  for (const s of team.squad) {
    const p = players.find((x) => x.id === s.playerId);
    if (p) purchasePrices[s.playerId] = p.price;
  }
  return {
    async loadSnapshot() {
      return {
        teamId: null,
        version: 0,
        team,
        lifecycle: {
          chips: { active: null, used: [] },
          currentGameweek: 14,
          transferHitPoints: 0,
          results: {},
        },
        finalizedResults: {},
        source: "local" as const,
        currentGameweekId: null,
        purchasePrices,
      };
    },
  };
}

function fakeGameweekIndex(numbers: number[]) {
  const rows = numbers.map((n) => ({
    id: `gw-${SEASON}-${n}`,
    number: n,
    season: SEASON,
    status: "upcoming",
    deadline: "2025-01-01",
  }));
  return buildGameweekIndex(rows);
}

describe("importLocalTeamToCloud", () => {
  beforeEach(() => {
    // Isolate from patches written by sibling test files (fantasy mock
    // service reads from window.localStorage via the test shim).
    try {
      (globalThis as any).window?.localStorage?.removeItem(
        STORAGE_KEYS.FANTASY_TEAM,
      );
    } catch {}
  });


  it("happy path: loads local snapshot, resolves GW UUID, invokes cloud saveTeam exactly once", async () => {
    const localRepo = await localRepoWithRealTeam();
    const calls: any[] = [];
    const cloudRepo = {
      async saveTeam(input: any) {
        calls.push(input);
        return {
          teamId: "cloud-team-1",
          version: 1,
          team: { ...(await localRepo.loadSnapshot()).team },
          lifecycle: input.lifecycle,
          finalizedResults: {},
          source: "cloud" as const,
          currentGameweekId: input.currentGameweekId,
          purchasePrices: input.purchasePrices,
        };
      },
    };
    const snap = await importLocalTeamToCloud({
      localRepo,
      cloudRepo: cloudRepo as any,
      loadPlayers: loadPlayersReal,
      loadGameweekIndex: async () => fakeGameweekIndex([13, 14, 15]),
      season: SEASON,
      defaultTeamName: "Mon équipe",
      cloudExpectedVersion: 0,
    });
    expect(calls.length).toBe(1);
    const [input] = calls;
    expect(input.currentGameweekId).toBe(`gw-${SEASON}-14`);
    expect(input.expectedVersion).toBe(0);
    expect(input.squad.length).toBe(15);
    // Lifecycle passed through verbatim.
    expect(input.lifecycle.currentGameweek).toBe(14);
    // Purchase prices present.
    expect(Object.keys(input.purchasePrices).length).toBe(15);
    expect(snap.source).toBe("cloud");
    expect(snap.version).toBe(1);
  });

  it("gameweek_unresolved: throws when index has no matching row for season+number", async () => {
    const localRepo = await localRepoWithRealTeam();
    const cloudCalls: any[] = [];
    const cloudRepo = {
      async saveTeam(input: any) {
        cloudCalls.push(input);
        return {} as any;
      },
    };
    let caught: unknown = null;
    try {
      await importLocalTeamToCloud({
        localRepo,
        cloudRepo: cloudRepo as any,
        loadPlayers: loadPlayersReal,
        loadGameweekIndex: async () => fakeGameweekIndex([1, 2]), // no 14
        season: SEASON,
        defaultTeamName: "Mon équipe",
        cloudExpectedVersion: 0,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FantasyRepoError);
    expect((caught as FantasyRepoError).code).toBe("gameweek_unresolved");
    // cloud saveTeam was NEVER called.
    expect(cloudCalls.length).toBe(0);
  });

  it("mapping failure: bubbles aggregate missing ids as FantasyRepoError('mapping_incomplete')", async () => {
    const localRepo = await localRepoWithRealTeam();
    const missing = new MissingIdMappingError({
      missingPlayers: ["p-1", "p-2", "p-3"],
    });

    const cloudRepo = {
      async saveTeam() {
        throw missing;
      },
    };
    let caught: unknown = null;
    try {
      await importLocalTeamToCloud({
        localRepo,
        cloudRepo: cloudRepo as any,
        loadPlayers: loadPlayersReal,
        loadGameweekIndex: async () => fakeGameweekIndex([14]),
        season: SEASON,
        defaultTeamName: "Mon équipe",
        cloudExpectedVersion: 0,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FantasyRepoError);
    expect((caught as FantasyRepoError).code).toBe("mapping_incomplete");
    expect((caught as FantasyRepoError).missingIds?.players).toEqual([
      "p-1",
      "p-2",
      "p-3",
    ]);
  });

  it("network/RLS/conflict: typed errors bubble through unchanged", async () => {
    const localRepo = await localRepoWithRealTeam();
    const errors: FantasyRepoError[] = [
      new FantasyRepoError("network", "offline"),
      new FantasyRepoError("permission_denied", "rls"),
      new FantasyRepoError("version_conflict", "stale"),
    ];
    for (const err of errors) {
      const cloudRepo = {
        async saveTeam() {
          throw err;
        },
      };
      let caught: unknown = null;
      try {
        await importLocalTeamToCloud({
          localRepo,
          cloudRepo: cloudRepo as any,
          loadPlayers: loadPlayersReal,
          loadGameweekIndex: async () => fakeGameweekIndex([14]),
          season: SEASON,
          defaultTeamName: "Mon équipe",
          cloudExpectedVersion: 0,
        });
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(FantasyRepoError);
      expect((caught as FantasyRepoError).code).toBe(err.code);
    }
  });

  it("validation failure: throws FantasyRepoError('validation'); no cloud save call", async () => {
    // Local repo with a squad missing captain flag.
    const players = await loadPlayersReal();
    const team = await fantasyService.getTeam();
    const badSquad = team.squad.map((s) => ({ ...s, isCaptain: false }));
    const localRepo = {
      async loadSnapshot() {
        return {
          teamId: null,
          version: 0,
          team: { ...team, squad: badSquad },
          lifecycle: {
            chips: { active: null, used: [] },
            currentGameweek: 14,
            transferHitPoints: 0,
            results: {},
          },
          finalizedResults: {},
          source: "local" as const,
          currentGameweekId: null,
          purchasePrices: {},
        };
      },
    };
    const cloudCalls: any[] = [];
    const cloudRepo = {
      async saveTeam(input: any) {
        cloudCalls.push(input);
        return {} as any;
      },
    };
    let caught: unknown = null;
    try {
      await importLocalTeamToCloud({
        localRepo,
        cloudRepo: cloudRepo as any,
        loadPlayers: async () => players,
        loadGameweekIndex: async () => fakeGameweekIndex([14]),
        season: SEASON,
        defaultTeamName: "Mon équipe",
        cloudExpectedVersion: 0,
      });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(FantasyRepoError);
    expect((caught as FantasyRepoError).code).toBe("validation");
    expect(cloudCalls.length).toBe(0);
  });

  it("uses localized defaultTeamName when local team.teamName is empty", async () => {
    const team = await fantasyService.getTeam();
    const players = await loadPlayersReal();
    const purchasePrices: Record<string, number> = {};
    for (const s of team.squad) {
      const p = players.find((x) => x.id === s.playerId);
      if (p) purchasePrices[s.playerId] = p.price;
    }
    const localRepo = {
      async loadSnapshot() {
        return {
          teamId: null,
          version: 0,
          team: { ...team, teamName: "" },
          lifecycle: {
            chips: { active: null, used: [] },
            currentGameweek: 14,
            transferHitPoints: 0,
            results: {},
          },
          finalizedResults: {},
          source: "local" as const,
          currentGameweekId: null,
          purchasePrices,
        };
      },
    };
    const input = await prepareImportPayload({
      localRepo,
      cloudRepo: { async saveTeam() { return {} as any; } } as any,
      loadPlayers: async () => players,
      loadGameweekIndex: async () => fakeGameweekIndex([14]),
      season: SEASON,
      defaultTeamName: "فريقي",
      cloudExpectedVersion: 0,
    });
    expect(input.teamName).toBe("فريقي");
    // Verify the FR default flows through when supplied instead.
    const input2 = await prepareImportPayload({
      localRepo,
      cloudRepo: { async saveTeam() { return {} as any; } } as any,
      loadPlayers: async () => players,
      loadGameweekIndex: async () => fakeGameweekIndex([14]),
      season: SEASON,
      defaultTeamName: "Mon équipe",
      cloudExpectedVersion: 0,
    });
    expect(input2.teamName).toBe("Mon équipe");
  });
});
