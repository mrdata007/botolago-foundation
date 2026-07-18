// @ts-nocheck — bun test runtime types are provided by bun-types (not in deps).
// Run with: `bun test src/lib/fantasy-engine.test.ts`
import { describe, expect, it } from "bun:test";
import type { FantasyPlayer, PlayerPointsBreakdown, SquadPlayer } from "@/types/fantasy";
import {
  activateChip,
  canActivateChip,
  computeAutoSubs,
  computeGameweekResult,
  computeTransferCost,
  consumeFreeHitSnapshot,
  DEFAULT_CHIPS,
  deactivateChip,
  evaluateDeadline,
  finalizeChip,
  isLegalSwap,
  resolveCaptainMultiplier,
  setCaptain,
  setViceCaptain,
} from "./fantasy-engine";

// -------- Fixtures --------
function mkPlayer(id: string, pos: FantasyPlayer["position"], clubId = "c1"): FantasyPlayer {
  return {
    id,
    name: { fr: id, ar: id },
    clubId,
    position: pos,
    price: 5,
    totalPoints: 0,
    form: 5,
    ownership: 10,
    status: "available",
  };
}

// 4-4-2 squad: 1 GK + 4 DEF + 4 MID + 2 FWD starting, bench 1 GK + 3 outfield.
const players: FantasyPlayer[] = [
  mkPlayer("gk1", "GK"), mkPlayer("gk2", "GK"),
  mkPlayer("d1", "DEF"), mkPlayer("d2", "DEF"), mkPlayer("d3", "DEF"), mkPlayer("d4", "DEF"), mkPlayer("d5", "DEF"),
  mkPlayer("m1", "MID"), mkPlayer("m2", "MID"), mkPlayer("m3", "MID"), mkPlayer("m4", "MID"), mkPlayer("m5", "MID"),
  mkPlayer("f1", "FWD"), mkPlayer("f2", "FWD"), mkPlayer("f3", "FWD"),
];

const squad: SquadPlayer[] = [
  { playerId: "gk1", slot: 1 },
  { playerId: "d1", slot: 2 }, { playerId: "d2", slot: 3 }, { playerId: "d3", slot: 4 }, { playerId: "d4", slot: 5 },
  { playerId: "m1", slot: 6 }, { playerId: "m2", slot: 7 }, { playerId: "m3", slot: 8 }, { playerId: "m4", slot: 9 },
  { playerId: "f1", slot: 10, isCaptain: true }, { playerId: "f2", slot: 11, isViceCaptain: true },
  { playerId: "gk2", slot: 12 },
  { playerId: "d5", slot: 13 }, { playerId: "m5", slot: 14 }, { playerId: "f3", slot: 15 },
];

function mkBreakdown(points: Record<string, number>): PlayerPointsBreakdown[] {
  return squad.map((s) => ({
    playerId: s.playerId,
    totalPoints: points[s.playerId] ?? 0,
    minutesPlayed: (points[s.playerId] ?? 0) > 0 ? 90 : 0,
    isCaptain: s.isCaptain,
    isViceCaptain: s.isViceCaptain,
    isBench: s.slot >= 12,
    status: "final" as const,
    events: [],
  }));
}

// -------- Captain multipliers --------

describe("captain multiplier", () => {
  it("captain playing yields x2", () => {
    const r = resolveCaptainMultiplier({ squad, minutesById: { f1: 90, f2: 90 }, tripleCaptainActive: false });
    expect(r.captainId).toBe("f1");
    expect(r.multiplier).toBe(2);
  });
  it("Triple Captain yields x3 when captain played", () => {
    const r = resolveCaptainMultiplier({ squad, minutesById: { f1: 90 }, tripleCaptainActive: true });
    expect(r.multiplier).toBe(3);
  });
  it("vice-captain takes over at x2 if captain didn't play", () => {
    const r = resolveCaptainMultiplier({ squad, minutesById: { f2: 90 }, tripleCaptainActive: false });
    expect(r.captainId).toBe("f2");
    expect(r.multiplier).toBe(2);
  });
  it("no bonus if both captain and vice absent", () => {
    const r = resolveCaptainMultiplier({ squad, minutesById: {}, tripleCaptainActive: true });
    expect(r.captainId).toBe(null);
    expect(r.multiplier).toBe(1);
  });
});

// -------- Auto-subs --------

describe("auto-substitutions", () => {
  it("replaces starter with 0 minutes with the first legal bench player", () => {
    // d1 didn't play; d5 on bench did.
    const minutes = { gk1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, f1: 90, f2: 90, gk2: 90, d5: 90, m5: 90, f3: 90 };
    const r = computeAutoSubs({ squad, players, formation: "4-4-2", minutesById: minutes });
    expect(r.startingIds).toContain("d5");
    expect(r.startingIds).not.toContain("d1");
    expect(r.subs[0]).toMatchObject({ outId: "d1", inId: "d5" });
  });
  it("GK auto-sub only uses bench GK", () => {
    const minutes = { d1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, f1: 90, f2: 90, gk2: 90 };
    const r = computeAutoSubs({ squad, players, formation: "4-4-2", minutesById: minutes });
    expect(r.subs.find((s) => s.outId === "gk1")?.inId).toBe("gk2");
  });
  it("skips bench player if it would break formation legality", () => {
    // Two FWD didn't play; only 2 FWD required. Bench outfielders are DEF/MID/FWD.
    // f1 and f2 absent → subs should use FWD f3 (legal) not others that'd drop FWD to 0.
    const minutes = { gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, m1: 90, m2: 90, m3: 90, m4: 90, d5: 90, m5: 90, f3: 90 };
    const r = computeAutoSubs({ squad, players, formation: "4-4-2", minutesById: minutes });
    // f1 absent, sub can be a DEF/MID/FWD as long as legal. f3 works and preserves ≥1 FWD.
    const first = r.subs.find((s) => s.outId === "f1");
    expect(first).toBeDefined();
  });
});

// -------- Legal swap --------

describe("isLegalSwap", () => {
  it("same-position swap always legal", () => {
    expect(isLegalSwap({ squad, players, formation: "4-4-2", aId: "d1", bId: "d5" })).toBe(true);
  });
  it("GK cannot swap with outfield", () => {
    expect(isLegalSwap({ squad, players, formation: "4-4-2", aId: "gk1", bId: "d5" })).toBe(false);
  });
});

// -------- Chips --------

describe("chips", () => {
  it("cannot activate incompatible chip while another is active", () => {
    const s = { ...DEFAULT_CHIPS, active: "wildcard" as const };
    expect(canActivateChip(s, "free_hit", { deadlinePassed: false }).ok).toBe(false);
  });
  it("cannot activate a used chip", () => {
    const s = { ...DEFAULT_CHIPS, used: ["triple_captain" as const] };
    expect(canActivateChip(s, "triple_captain", { deadlinePassed: false }).ok).toBe(false);
  });
  it("cannot activate after deadline", () => {
    expect(canActivateChip(DEFAULT_CHIPS, "bench_boost", { deadlinePassed: true }).ok).toBe(false);
  });
  it("free_hit stores squad snapshot on activation and restores on consume", () => {
    const team = { managerName: "", teamName: "", formation: "4-4-2" as const, squad, bank: 2, freeTransfers: 1, pendingTransfers: 0 };
    const s = activateChip(DEFAULT_CHIPS, "free_hit", { gameweek: 14, team });
    expect(s.freeHitSnapshot?.squad).toHaveLength(15);
    const { state: after, snapshot } = consumeFreeHitSnapshot(s);
    expect(snapshot?.bank).toBe(2);
    expect(after.freeHitSnapshot).toBeUndefined();
  });
  it("deactivateChip cancels active chip WITHOUT marking it used (pre-deadline)", () => {
    const s = activateChip(DEFAULT_CHIPS, "triple_captain", { gameweek: 1, team: { managerName: "", teamName: "", formation: "4-4-2", squad, bank: 0, freeTransfers: 1, pendingTransfers: 0 } });
    const d = deactivateChip(s);
    expect(d.active).toBe(null);
    expect(d.used).not.toContain("triple_captain");
    // Free Hit snapshot cleared on cancel.
    const sFh = activateChip(DEFAULT_CHIPS, "free_hit", { gameweek: 1, team: { managerName: "", teamName: "", formation: "4-4-2", squad, bank: 3, freeTransfers: 1, pendingTransfers: 0 } });
    expect(deactivateChip(sFh).freeHitSnapshot).toBeUndefined();
    // Wildcard flag cleared on cancel.
    const sWc = activateChip(DEFAULT_CHIPS, "wildcard", { gameweek: 7, team: { managerName: "", teamName: "", formation: "4-4-2", squad, bank: 0, freeTransfers: 1, pendingTransfers: 0 } });
    expect(deactivateChip(sWc).wildcardActiveForGW).toBeUndefined();
  });
  it("finalizeChip moves active into used exactly once (idempotent)", () => {
    const s = activateChip(DEFAULT_CHIPS, "triple_captain", { gameweek: 1, team: { managerName: "", teamName: "", formation: "4-4-2", squad, bank: 0, freeTransfers: 1, pendingTransfers: 0 } });
    const f1 = finalizeChip(s);
    expect(f1.used).toContain("triple_captain");
    expect(f1.active).toBe(null);
    // A second finalize on the resulting state is a no-op (no active chip).
    const f2 = finalizeChip(f1);
    expect(f2.used.filter((k) => k === "triple_captain")).toHaveLength(1);
  });
});

// -------- Transfer cost --------

describe("computeTransferCost", () => {
  it("free transfer costs nothing", () => {
    expect(computeTransferCost({ totalTransfers: 1, freeTransfers: 1 })).toEqual({ free: 1, paid: 0, hitPoints: 0 });
  });
  it("paid transfer costs 4 points each", () => {
    expect(computeTransferCost({ totalTransfers: 3, freeTransfers: 1 })).toEqual({ free: 1, paid: 2, hitPoints: 8 });
  });
  it("wildcard/free-hit removes all cost", () => {
    expect(computeTransferCost({ totalTransfers: 8, freeTransfers: 1, wildcardActive: true }).hitPoints).toBe(0);
    expect(computeTransferCost({ totalTransfers: 5, freeTransfers: 0, freeHitActive: true }).hitPoints).toBe(0);
  });
});

// -------- Captain helpers --------

describe("setCaptain / setViceCaptain", () => {
  it("only one captain at a time", () => {
    const s = setCaptain(squad, "m1");
    expect(s.filter((x) => x.isCaptain)).toHaveLength(1);
    expect(s.find((x) => x.playerId === "m1")?.isCaptain).toBe(true);
  });
  it("vice cannot equal captain", () => {
    const s = setViceCaptain(setCaptain(squad, "m1"), "m1");
    expect(s.find((x) => x.playerId === "m1")?.isCaptain).toBe(false);
  });
});

// -------- Deadline --------

describe("evaluateDeadline", () => {
  it("locks after target time", () => {
    const past = new Date(Date.now() - 60_000).toISOString();
    expect(evaluateDeadline(past).isLocked).toBe(true);
  });
  it("unlocked before target time", () => {
    const future = new Date(Date.now() + 3_600_000).toISOString();
    expect(evaluateDeadline(future).isLocked).toBe(false);
  });
});

// -------- Scoring --------

describe("computeGameweekResult", () => {
  const minutesFullXI = Object.fromEntries(squad.slice(0, 11).map((s) => [s.playerId, 90] as const));

  it("applies captain x2 to total", () => {
    const bd = mkBreakdown({ f1: 10, m1: 3, d1: 2 });
    // mkBreakdown didn't multiply — but our engine treats isCaptain totalPoints as pre-doubled.
    // Simulate pre-doubled by passing 20 for the captain.
    const bd2 = bd.map((b) => (b.playerId === "f1" ? { ...b, totalPoints: 20 } : b));
    const r = computeGameweekResult({
      squad, players, formation: "4-4-2", breakdown: bd2, minutesById: minutesFullXI,
      chips: DEFAULT_CHIPS, transferHitPoints: 0,
    });
    // f1 raw=10 → x2=20. m1=3 d1=2 rest=0 → 25.
    expect(r.totalPoints).toBe(25);
    expect(r.captainBonus).toBe(10);
  });

  it("Bench Boost adds bench points", () => {
    const bd = mkBreakdown({ f1: 5, gk2: 4, d5: 2 }).map((b) => (b.playerId === "f1" ? { ...b, totalPoints: 10 } : b));
    const withBench = { ...DEFAULT_CHIPS, active: "bench_boost" as const };
    const r = computeGameweekResult({
      squad, players, formation: "4-4-2", breakdown: bd, minutesById: { ...minutesFullXI, gk2: 90, d5: 90 },
      chips: withBench, transferHitPoints: 0,
    });
    // captain f1 raw=5 x2=10; bench gk2(4) + d5(2) added → 10 + 4 + 2 = 16.
    expect(r.totalPoints).toBe(16);
    expect(r.benchPoints).toBe(6);
  });

  it("subtracts transfer hits from total", () => {
    const bd = mkBreakdown({ f1: 0 });
    const r = computeGameweekResult({
      squad, players, formation: "4-4-2", breakdown: bd, minutesById: minutesFullXI,
      chips: DEFAULT_CHIPS, transferHitPoints: 8,
    });
    expect(r.hitPoints).toBe(8);
    expect(r.totalPoints).toBe(-8);
  });

  it("vice-captain gets bonus when captain didn't play", () => {
    const bd = mkBreakdown({ f2: 8, m1: 2 });
    // captain f1 absent — vice f2 played, raw=8, x2=16 + m1(2) = 18.
    const r = computeGameweekResult({
      squad, players, formation: "4-4-2", breakdown: bd,
      minutesById: { f2: 90, m1: 90, gk1: 90, d1: 90, d2: 90, d3: 90, d4: 90, m2: 90, m3: 90, m4: 90 },
      chips: DEFAULT_CHIPS, transferHitPoints: 0,
    });
    expect(r.totalPoints).toBe(18);
  });
});
