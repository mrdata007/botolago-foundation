// @ts-nocheck
import { describe, it, expect } from "bun:test";
import {
  buildSaveTeamPayload,
  buildConfirmTransfersPayload,
  buildFinalizeGameweekPayload,
} from "./fantasy-payloads";
import { MissingIdMappingError } from "./fantasy-id-map";
import { DEFAULT_STATE } from "./fantasy-state";

function makeIdMap() {
  const players = new Map<string, string>();
  const revPlayers = new Map<string, string>();
  for (let i = 1; i <= 15; i++) {
    const src = `fp_war_${i}`;
    const uuid = `p-${i.toString().padStart(2, "0")}`;
    players.set(src, uuid);
    revPlayers.set(uuid, src);
  }
  // extras for transfers
  players.set("fp_rca_1", "p-rca-1");
  revPlayers.set("p-rca-1", "fp_rca_1");
  return {
    clubIdBySource: new Map(),
    clubSourceById: new Map(),
    playerIdBySource: players,
    playerSourceById: revPlayers,
  };
}

function baseSquad() {
  return Array.from({ length: 15 }, (_, i) => ({
    playerId: `fp_war_${i + 1}`,
    slot: i + 1,
    isCaptain: i === 0,
    isViceCaptain: i === 1,
  }));
}

function prices() {
  const out: Record<string, number> = {};
  for (let i = 1; i <= 15; i++) out[`fp_war_${i}`] = 5 + i * 0.1;
  return out;
}

describe("buildSaveTeamPayload", () => {
  it("produces the exact 15-row squad JSON with expected version, captain and vice", () => {
    const args = buildSaveTeamPayload(
      {
        teamId: "t1",
        teamName: "Squad",
        managerName: "M",
        formation: "4-4-2",
        bank: 3.5,
        freeTransfers: 1,
        pendingTransfers: 0,
        currentGameweekId: "gw1",
        expectedVersion: 7,
        lifecycle: DEFAULT_STATE,
        squad: baseSquad(),
        purchasePrices: prices(),
      },
      makeIdMap(),
    );
    expect(args._team_id).toBe("t1");
    expect(args._expected_version).toBe(7);
    expect(args._formation).toBe("4-4-2");
    expect(Array.isArray(args._squad)).toBe(true);
    expect((args._squad as any[]).length).toBe(15);
    const captain = (args._squad as any[]).find((r) => r.is_captain);
    const vice = (args._squad as any[]).find((r) => r.is_vice);
    expect(captain.player_id).toBe("p-01");
    expect(vice.player_id).toBe("p-02");
    // purchase price aligns
    expect((args._squad as any[])[0].purchase_price).toBeCloseTo(5.1, 5);
  });

  it("throws aggregate missing ids when squad contains unmapped players", () => {
    const bad = baseSquad();
    bad[3].playerId = "fp_unknown_1";
    bad[7].playerId = "fp_unknown_2";
    expect(() =>
      buildSaveTeamPayload(
        {
          teamId: null,
          teamName: "x",
          managerName: null,
          formation: "4-4-2",
          bank: 0,
          freeTransfers: 1,
          pendingTransfers: 0,
          currentGameweekId: null,
          expectedVersion: 0,
          lifecycle: DEFAULT_STATE,
          squad: bad,
          purchasePrices: prices(),
        },
        makeIdMap(),
      ),
    ).toThrow(MissingIdMappingError);
  });
});

describe("buildConfirmTransfersPayload", () => {
  it("maps multiple transfer ins/outs and preserves counters/hits", () => {
    const idMap = makeIdMap();
    const squad = baseSquad();
    squad[0].playerId = "fp_rca_1"; // replaced in
    const args = buildConfirmTransfersPayload(
      {
        teamId: "t1",
        expectedVersion: 2,
        formation: "4-4-2",
        bank: 1.2,
        freeTransfers: 0,
        pendingTransfers: 1,
        currentGameweekId: "gw1",
        lifecycle: DEFAULT_STATE,
        squad,
        purchasePrices: { ...prices(), fp_rca_1: 6.4 },
        transfers: [
          {
            outSourceId: "fp_war_1",
            inSourceId: "fp_rca_1",
            priceOut: 5.1,
            priceIn: 6.4,
            cost: 0,
            hit: 4,
            chip: null,
          },
        ],
      },
      idMap,
    );
    expect(args._transfers.length).toBe(1);
    expect(args._transfers[0].player_out_id).toBe("p-01");
    expect(args._transfers[0].player_in_id).toBe("p-rca-1");
    expect(args._transfers[0].hit).toBe(4);
    expect(args._pending_transfers).toBe(1);
    expect(args._free_transfers).toBe(0);
  });
});

describe("buildFinalizeGameweekPayload", () => {
  it("packages result, post-team lifecycle and mapped effective captain", () => {
    const idMap = makeIdMap();
    const result = {
      gameweek: 14,
      source: "engine",
      totalPoints: 55,
      rawXiPoints: 59,
      captainBonus: 8,
      effectiveCaptainId: "fp_war_1",
      captainMultiplier: 2,
      captainTookOver: false,
      originalBenchPoints: 3,
      benchBoostContribution: 0,
      tripleCaptainContribution: 0,
      transferHitPoints: 4,
      activeChip: null,
      effectiveStartingIds: [],
      originalBenchIds: [],
      autoSubs: [],
      breakdown: [],
      computedAt: new Date().toISOString(),
      chipUsed: "wildcard",
    } as any;
    const args = buildFinalizeGameweekPayload(
      {
        teamId: "t1",
        gameweekId: "gw-uuid",
        expectedVersion: 3,
        season: "2025-26",
        chipFinalize: "wildcard",
        result,
        postTeam: {
          formation: "4-4-2",
          bank: 2.0,
          freeTransfers: 2,
          pendingTransfers: 0,
          currentGameweekId: "gw-next",
          lifecycle: DEFAULT_STATE,
          squad: baseSquad(),
        },
      },
      idMap,
    );
    expect(args._gameweek_id).toBe("gw-uuid");
    expect(args._season).toBe("2025-26");
    expect(args._chip_finalize).toBe("wildcard");
    expect((args._result as any).final_points).toBe(55);
    expect((args._result as any).effective_captain_id).toBe("p-01");
    expect((args._result as any).transfer_hit).toBe(4);
    expect((args._post_team as any).formation).toBe("4-4-2");
    expect((args._post_team as any).squad.length).toBe(15);
  });

  it("omits post-team squad when not supplied", () => {
    const idMap = makeIdMap();
    const result = {
      totalPoints: 10,
      rawXiPoints: 10,
      captainBonus: 0,
      effectiveCaptainId: null,
      captainMultiplier: 1,
      originalBenchPoints: 0,
      benchBoostContribution: 0,
      tripleCaptainContribution: 0,
      transferHitPoints: 0,
      autoSubs: [],
    } as any;
    const args = buildFinalizeGameweekPayload(
      {
        teamId: "t1",
        gameweekId: "gw-uuid",
        expectedVersion: 1,
        season: "2025-26",
        chipFinalize: null,
        result,
        postTeam: {
          formation: "4-4-2",
          bank: 0,
          freeTransfers: 1,
          pendingTransfers: 0,
          currentGameweekId: null,
          lifecycle: DEFAULT_STATE,
        },
      },
      idMap,
    );
    expect((args._post_team as any).squad).toBeUndefined();
    expect(args._chip_finalize).toBe("");
  });
});
