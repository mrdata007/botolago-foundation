// Run with: `bun test src/services/points-service.test.ts`
import "./__test-shim";
import { describe, it, expect, beforeEach } from "bun:test";
import {
  buildAuthoritativePointsViewModel,
  buildLegacyViewModel,
  buildPointsViewModel,
} from "./points-service";
import { fantasyStateStore } from "./fantasy-state";
import { DEFAULT_CHIPS, type ChipsState } from "@/lib/fantasy-engine";
import type {
  FantasyPlayer,
  FantasyTeam,
  PlayerPointsBreakdown,
  SquadPlayer,
} from "@/types/fantasy";

// ---- Fixtures ----

function mkPlayer(id: string, position: FantasyPlayer["position"]): FantasyPlayer {
  return {
    id,
    name: { fr: id, ar: id },
    position,
    clubId: "c1",
    price: 5,
    form: 5,
    totalPoints: 0,
    ownership: 0,
    status: "available",
  } as FantasyPlayer;
}

// Slot 1 GK, 2-5 DEF (4), 6-8 MID (3), 9-11 FWD (3) — matches 4-3-3.
// Bench 12 GK, 13 DEF, 14 MID, 15 FWD.
const positions: FantasyPlayer["position"][] = [
  "GK",
  "DEF",
  "DEF",
  "DEF",
  "DEF",
  "MID",
  "MID",
  "MID",
  "FWD",
  "FWD",
  "FWD",
  "GK",
  "DEF",
  "MID",
  "FWD",
];

function mkFixtures(
  opts: { captain: string; vice: string; formation?: FantasyTeam["formation"] } = {
    captain: "p8",
    vice: "p9",
  },
) {
  const players: FantasyPlayer[] = positions.map((pos, i) => mkPlayer(`p${i + 1}`, pos));
  const squad: SquadPlayer[] = players.map((p, i) => ({
    playerId: p.id,
    slot: i + 1,
    isCaptain: p.id === opts.captain,
    isViceCaptain: p.id === opts.vice,
  }));
  const team: FantasyTeam = {
    managerName: "T",
    teamName: "T",
    formation: opts.formation ?? "4-3-3",
    squad,
    bank: 0,
    freeTransfers: 1,
    pendingTransfers: 0,
  };
  return { players, team };
}

/**
 * Deterministic breakdown: XI players score 5, bench 0. Optionally override.
 * Minutes = 90 for players who "played", 0 otherwise.
 */
function mkBreakdown(
  team: FantasyTeam,
  overrides: Record<string, { pts?: number; minutes?: number }> = {},
): PlayerPointsBreakdown[] {
  return team.squad.map((s) => {
    const isBench = s.slot >= 12;
    const o = overrides[s.playerId] ?? {};
    const rawPts = o.pts ?? (isBench ? 0 : 5);
    const minutes = o.minutes ?? (isBench ? 0 : 90);
    return {
      playerId: s.playerId,
      totalPoints: s.isCaptain ? rawPts * 2 : rawPts,
      minutesPlayed: minutes,
      isCaptain: s.isCaptain,
      isViceCaptain: s.isViceCaptain,
      isBench,
      status: "final" as const,
      events: [],
    };
  });
}

// ---- Tests ----

describe("points-service — buildPointsViewModel", () => {
  it("captain x2 when captain played", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team);
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    // 11 starters x 5 = 55; captain (5) doubled → +5 bonus = 60
    expect(vm.totalPoints).toBe(60);
    expect(vm.captainBonus).toBe(5);
    expect(vm.captainMultiplier).toBe(2);
    expect(vm.effectiveCaptainId).toBe("p8");
    expect(vm.captainTookOver).toBe(false);
    expect(vm.rawXiPoints).toBe(60);
    expect(vm.transferHitPoints).toBe(0);
  });

  it("Triple Captain x3 when active", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team, { p8: { pts: 10, minutes: 90 } });
    const chips: ChipsState = { active: "triple_captain", used: [] };
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips,
      transferHitPoints: 0,
      breakdown,
    });
    // 10 starters x5 = 50; captain 10 x 3 = 30 → 80
    expect(vm.captainMultiplier).toBe(3);
    expect(vm.tripleCaptainContribution).toBe(10);
    expect(vm.totalPoints).toBe(80);
    expect(vm.activeChip).toBe("triple_captain");
  });

  it("vice takeover when captain didn't play", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team, { p8: { pts: 0, minutes: 0 } });
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    expect(vm.effectiveCaptainId).toBe("p9");
    expect(vm.captainTookOver).toBe(true);
    expect(vm.captainMultiplier).toBe(2);
  });

  it("both captain and vice absent → multiplier 1, no bonus", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team, {
      p8: { pts: 0, minutes: 0 },
      p9: { pts: 0, minutes: 0 },
    });
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    expect(vm.effectiveCaptainId).toBeNull();
    expect(vm.captainMultiplier).toBe(1);
    expect(vm.captainBonus).toBe(0);
  });

  it("Bench Boost adds original bench raw points", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team, {
      p12: { pts: 3, minutes: 90 },
      p13: { pts: 4, minutes: 90 },
      p14: { pts: 2, minutes: 90 },
      p15: { pts: 6, minutes: 90 },
    });
    const chips: ChipsState = { active: "bench_boost", used: [] };
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips,
      transferHitPoints: 0,
      breakdown,
    });
    // XI (with cap): 60. Bench: 3+4+2+6 = 15 → 75
    expect(vm.benchBoostContribution).toBe(15);
    expect(vm.originalBenchPoints).toBe(15);
    expect(vm.totalPoints).toBe(75);
    expect(vm.activeChip).toBe("bench_boost");
  });

  it("auto-sub display mapping: bench replaces zero-minute starter", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    // p2 (DEF starter) didn't play; p13 (DEF bench) did
    const breakdown = mkBreakdown(team, {
      p2: { pts: 0, minutes: 0 },
      p13: { pts: 6, minutes: 90 },
    });
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    expect(vm.autoSubs.length).toBeGreaterThan(0);
    const sub = vm.autoSubs.find((s) => s.outId === "p2");
    expect(sub?.inId).toBe("p13");
    expect(sub?.reasonKey).toBe("fantasy.engine.sub.outfield");
    expect(vm.effectiveStartingIds).toContain("p13");
    expect(vm.effectiveStartingIds).not.toContain("p2");
    expect(vm.originalBenchIds).toEqual(["p12", "p13", "p14", "p15"]);
  });

  it("transfer hit deducts from total", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team);
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 8,
      breakdown,
    });
    // 60 raw XI - 8 hit = 52
    expect(vm.totalPoints).toBe(52);
    expect(vm.rawXiPoints).toBe(60);
    expect(vm.transferHitPoints).toBe(8);
  });

  it("preserves authoritative V2 totals, multipliers, chip and transfer hit", () => {
    const vm = buildAuthoritativePointsViewModel({
      gameweek: 1,
      totalPoints: 68,
      benchPoints: 5,
      startingPoints: 60,
      captainPoints: 16,
      transferHitPoints: 8,
      activeChip: "triple_captain",
      finalized: true,
      finalizedAt: "2026-08-07T00:00:00.000Z",
      captainId: "captain",
      autoSubs: [],
      breakdown: [
        {
          playerId: "captain",
          totalPoints: 24,
          multiplier: 3,
          minutesPlayed: 90,
          isCaptain: true,
          status: "final",
          events: [],
        },
        {
          playerId: "bench",
          totalPoints: 5,
          multiplier: 1,
          minutesPlayed: 90,
          isBench: true,
          status: "final",
          events: [],
        },
      ],
    });

    expect(vm.source).toBe("authoritative");
    expect(vm.totalPoints).toBe(68);
    expect(vm.rawXiPoints).toBe(76);
    expect(vm.transferHitPoints).toBe(8);
    expect(vm.activeChip).toBe("triple_captain");
    expect(vm.effectiveCaptainId).toBe("captain");
    expect(vm.captainMultiplier).toBe(3);
    expect(vm.tripleCaptainContribution).toBe(8);
    expect(vm.breakdown[0].totalPoints).toBe(24);
    expect(vm.finalized).toBe(true);
  });

  it("legacy view model preserves mock totals without engine fields", () => {
    const vm = buildLegacyViewModel(
      {
        gameweek: 13,
        totalPoints: 62,
        benchPoints: 3,
        captainId: "p8",
        averagePoints: 44,
        highestPoints: 88,
        autoSubs: [],
        breakdown: [],
      },
      ["p12", "p13", "p14", "p15"],
      ["p1", "p2", "p3", "p4", "p5", "p6", "p7", "p8", "p9", "p10", "p11"],
    );
    expect(vm.source).toBe("legacy_mock");
    expect(vm.totalPoints).toBe(62);
    expect(vm.originalBenchPoints).toBe(3);
    expect(vm.captainMultiplier).toBe(1);
    expect(vm.autoSubs).toEqual([]);
    expect(vm.activeChip).toBeNull();
  });
});

describe("fantasyStateStore — result persistence", () => {
  beforeEach(() => {
    const g = globalThis as any;
    if (typeof g.window === "undefined") {
      const store = new Map<string, string>();
      g.window = {
        localStorage: {
          getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
          setItem: (k: string, v: string) => {
            store.set(k, v);
          },
          removeItem: (k: string) => {
            store.delete(k);
          },
          clear: () => store.clear(),
        },
        dispatchEvent: () => true,
      };
    }
    fantasyStateStore.reset();
  });

  it("stable reload: save then read returns identical view model", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team);
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    fantasyStateStore.saveResult(14, vm);
    const back = fantasyStateStore.getResult(14);
    expect(back).toBeDefined();
    expect(back?.totalPoints).toBe(vm.totalPoints);
    expect(back?.captainBonus).toBe(vm.captainBonus);
    expect(back?.effectiveStartingIds).toEqual(vm.effectiveStartingIds);
    expect(back?.autoSubs).toEqual(vm.autoSubs);
  });

  it("clearResult removes only the given gameweek", () => {
    const { players, team } = mkFixtures({ captain: "p8", vice: "p9" });
    const breakdown = mkBreakdown(team);
    const vm = buildPointsViewModel({
      gameweek: 14,
      team,
      players,
      chips: DEFAULT_CHIPS,
      transferHitPoints: 0,
      breakdown,
    });
    fantasyStateStore.saveResult(14, vm);
    fantasyStateStore.saveResult(13, { ...vm, gameweek: 13, totalPoints: 42 });
    fantasyStateStore.clearResult(14);
    expect(fantasyStateStore.getResult(14)).toBeUndefined();
    expect(fantasyStateStore.getResult(13)?.totalPoints).toBe(42);
  });
});
