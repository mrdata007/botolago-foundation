// @ts-nocheck
import { describe, it, expect } from "bun:test";
import {
  selectStableCloudResult,
  buildCloudFinalizationPlan,
  buildCloudAdvancePlan,
} from "./fantasy-cloud-finalize";

// ---------- fixtures ----------

const clock = () => "2026-01-01T00:00:00.000Z";

const player = (id: string, position: "GK" | "DEF" | "MID" | "FWD", price = 5) => ({
  id,
  name: { fr: id, ar: id },
  clubId: "war",
  position,
  price,
  form: 5,
  totalPoints: 20,
  ownership: 10,
  expectedPoints: 5,
});

const squad15 = () => {
  const rows: Array<{
    playerId: string;
    slot: number;
    isCaptain: boolean;
    isViceCaptain: boolean;
  }> = [];
  // 2 GK, 5 DEF, 5 MID, 3 FWD = 15
  const layout = [
    ...Array(2).fill("GK"),
    ...Array(5).fill("DEF"),
    ...Array(5).fill("MID"),
    ...Array(3).fill("FWD"),
  ];
  layout.forEach((_, i) =>
    rows.push({
      playerId: `p${i + 1}`,
      slot: i,
      isCaptain: i === 5,
      isViceCaptain: i === 6,
    }),
  );
  return rows;
};

const players = () => {
  const list: any[] = [];
  const layout = [
    ...Array(2).fill("GK"),
    ...Array(5).fill("DEF"),
    ...Array(5).fill("MID"),
    ...Array(3).fill("FWD"),
  ];
  layout.forEach((pos, i) => list.push(player(`p${i + 1}`, pos as any)));
  // A few alternates for Free Hit swaps.
  list.push(player("alt1", "MID"));
  list.push(player("alt2", "FWD"));
  return list;
};

const breakdown = () =>
  Array.from({ length: 15 }, (_, i) => ({
    playerId: `p${i + 1}`,
    events: [],
    minutesPlayed: 90,
    totalPoints: 2,
    isCaptain: i === 5,
  }));

function makeSnapshot(overrides: any = {}) {
  const base = {
    teamId: "team-1",
    version: 3,
    team: {
      teamName: "T",
      managerName: "M",
      formation: "4-4-2" as const,
      bank: 1,
      freeTransfers: 1,
      pendingTransfers: 0,
      squad: squad15(),
    },
    lifecycle: {
      chips: { active: null, used: [] },
      currentGameweek: 14,
      transferHitPoints: 0,
      results: {},
    },
    finalizedResults: {},
    source: "cloud" as const,
    currentGameweekId: "gw-14",
    purchasePrices: Object.fromEntries(squad15().map((s) => [s.playerId, 5])),
  };
  return {
    ...base,
    ...overrides,
    lifecycle: { ...base.lifecycle, ...(overrides.lifecycle ?? {}) },
  };
}

// ---------- selectStableCloudResult ----------

describe("selectStableCloudResult", () => {
  it("returns finalized result from finalizedResults map", () => {
    const vm = { gameweek: 14, finalized: true, totalPoints: 55 } as any;
    const snap = makeSnapshot({ finalizedResults: { 14: vm } });
    expect(selectStableCloudResult(snap, 14)).toBe(vm);
  });

  it("returns null when no finalized entry exists", () => {
    const snap = makeSnapshot();
    expect(selectStableCloudResult(snap, 14)).toBeNull();
  });

  it("falls back to lifecycle.results only when finalized", () => {
    const vm = { gameweek: 14, finalized: true, totalPoints: 42 } as any;
    const snap = makeSnapshot({
      lifecycle: {
        chips: { active: null, used: [] },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: { 14: vm },
      },
    });
    expect(selectStableCloudResult(snap, 14)).toBe(vm);
  });

  it("ignores non-finalized lifecycle results (provisional)", () => {
    const provisional = { gameweek: 14, finalized: false, totalPoints: 12 } as any;
    const snap = makeSnapshot({
      lifecycle: {
        chips: { active: null, used: [] },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: { 14: provisional },
      },
    });
    expect(selectStableCloudResult(snap, 14)).toBeNull();
  });

  it("returns null for missing snapshot", () => {
    expect(selectStableCloudResult(null, 14)).toBeNull();
    expect(selectStableCloudResult(undefined, 14)).toBeNull();
  });
});

// ---------- buildCloudFinalizationPlan ----------

describe("buildCloudFinalizationPlan", () => {
  it("short-circuits when the GW is already finalized (skipReason=already_finalized)", () => {
    const existing = {
      gameweek: 14,
      finalized: true,
      chipUsed: "wildcard",
      totalPoints: 60,
    } as any;
    const snap = makeSnapshot({ finalizedResults: { 14: existing } });
    const plan = buildCloudFinalizationPlan({
      snapshot: snap,
      gw: 14,
      players: players(),
      breakdown: breakdown(),
      now: clock,
    });
    expect(plan.skipReason).toBe("already_finalized");
    expect(plan.result).toBe(existing);
    expect(plan.chipFinalize).toBe("wildcard");
    // nextLifecycle is untouched.
    expect(plan.nextLifecycle).toBe(snap.lifecycle);
    expect(plan.freeHitRestored).toBe(false);
  });

  it("builds a fresh finalize plan when no stable result exists", () => {
    const snap = makeSnapshot();
    const plan = buildCloudFinalizationPlan({
      snapshot: snap,
      gw: 14,
      players: players(),
      breakdown: breakdown(),
      now: clock,
    });
    expect(plan.skipReason).toBeNull();
    expect(plan.result.finalized).toBe(true);
    expect(plan.result.finalizedAt).toBe(clock());
    expect(plan.chipFinalize).toBeNull();
    expect(plan.nextLifecycle.transferHitPoints).toBe(0);
    expect(plan.nextLifecycle.results[14]).toBe(plan.result);
    // Non-Free-Hit: post-team mirrors snapshot squad.
    expect(plan.postTeam.squad).toBe(snap.team.squad);
    expect(plan.postPurchasePrices).toBe(snap.purchasePrices);
    expect(plan.freeHitRestored).toBe(false);
  });

  it("moves the active chip into used[] with de-duplication", () => {
    const snap = makeSnapshot({
      lifecycle: {
        chips: { active: "bench_boost", used: ["bench_boost"] },
        currentGameweek: 14,
        transferHitPoints: 4,
        results: {},
      },
    });
    const plan = buildCloudFinalizationPlan({
      snapshot: snap,
      gw: 14,
      players: players(),
      breakdown: breakdown(),
      now: clock,
    });
    expect(plan.chipFinalize).toBe("bench_boost");
    // De-duplicated: not appended twice.
    expect(plan.nextLifecycle.chips.used).toEqual(["bench_boost"]);
    expect(plan.nextLifecycle.chips.active).toBeNull();
    expect(plan.nextLifecycle.transferHitPoints).toBe(0);
    expect(plan.result.chipUsed).toBe("bench_boost");
    expect(plan.result.hitPointsApplied).toBe(4);
  });

  it("Free Hit finalize restores the pre-mutation squad and preserves snapshot purchase prices", () => {
    const preSquad = squad15();
    const mutatedSquad = squad15().map((s) => ({ ...s, playerId: s.playerId + "_x" }));
    const snap = makeSnapshot({
      team: {
        teamName: "T",
        managerName: "M",
        formation: "3-5-2" as const,
        bank: 0.5,
        freeTransfers: 0,
        pendingTransfers: 3,
        squad: mutatedSquad,
      },
      lifecycle: {
        chips: {
          active: "free_hit",
          used: [],
          freeHitSnapshot: {
            squad: preSquad,
            formation: "4-4-2",
            bank: 2.0,
            freeTransfers: 1,
          },
        },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: {},
      },
      // These are the pre-Free-Hit purchase prices.
      purchasePrices: Object.fromEntries(preSquad.map((s) => [s.playerId, 5])),
    });
    const plan = buildCloudFinalizationPlan({
      snapshot: snap,
      gw: 14,
      players: [...players(), ...mutatedSquad.map((s) => player(s.playerId, "MID"))],
      breakdown: breakdown(),
      now: clock,
    });
    expect(plan.freeHitRestored).toBe(true);
    expect(plan.postTeam.formation).toBe("4-4-2");
    expect(plan.postTeam.bank).toBe(2.0);
    expect(plan.postTeam.freeTransfers).toBe(1);
    expect(plan.postTeam.pendingTransfers).toBe(0);
    expect(plan.postTeam.squad).toBe(preSquad);
    expect(plan.postPurchasePrices).toBe(snap.purchasePrices);
    // freeHitSnapshot dropped after finalize.
    expect(plan.nextLifecycle.chips.freeHitSnapshot).toBeUndefined();
    expect(plan.nextLifecycle.chips.used).toEqual(["free_hit"]);
  });
});

// ---------- buildCloudAdvancePlan ----------

describe("buildCloudAdvancePlan", () => {
  it("errors when current GW is not finalized", () => {
    const snap = makeSnapshot();
    const plan = buildCloudAdvancePlan({
      snapshot: snap,
      nextGameweekNumber: 15,
      nextGameweekId: "gw-15",
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toBe("must_finalize_first");
  });

  it("errors when target equals current (already advanced)", () => {
    const snap = makeSnapshot({
      lifecycle: {
        chips: { active: null, used: [] },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: { 14: { finalized: true } as any },
      },
    });
    const plan = buildCloudAdvancePlan({
      snapshot: snap,
      nextGameweekNumber: 14,
      nextGameweekId: "gw-14",
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toBe("already_advanced");
  });

  it("errors when target is in the past", () => {
    const snap = makeSnapshot({
      lifecycle: {
        chips: { active: null, used: [] },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: { 14: { finalized: true } as any },
      },
    });
    const plan = buildCloudAdvancePlan({
      snapshot: snap,
      nextGameweekNumber: 13,
      nextGameweekId: "gw-13",
    });
    expect(plan.ok).toBe(false);
    if (!plan.ok) expect(plan.error).toBe("target_in_past");
  });

  it("rolls free transfers (+1, cap 2), sets next GW, and preserves chip lifecycle", () => {
    const usedChips = { active: null, used: ["bench_boost"] };
    const snap = makeSnapshot({
      team: {
        teamName: "T",
        managerName: "M",
        formation: "4-4-2" as const,
        bank: 1,
        freeTransfers: 0, // → rolls to 1
        pendingTransfers: 5,
        squad: squad15(),
      },
      lifecycle: {
        chips: usedChips,
        currentGameweek: 14,
        transferHitPoints: 8,
        results: { 14: { finalized: true } as any },
      },
    });
    const plan = buildCloudAdvancePlan({
      snapshot: snap,
      nextGameweekNumber: 15,
      nextGameweekId: "gw-15",
    });
    expect(plan.ok).toBe(true);
    if (!plan.ok) return;
    expect(plan.nextFreeTransfers).toBe(1);
    expect(plan.postTeam.freeTransfers).toBe(1);
    expect(plan.postTeam.pendingTransfers).toBe(0);
    expect(plan.currentGameweekId).toBe("gw-15");
    expect(plan.expectedVersion).toBe(3);
    expect(plan.nextLifecycle.currentGameweek).toBe(15);
    expect(plan.nextLifecycle.transferHitPoints).toBe(0);
    // Chip used[] preserved untouched by advance.
    expect(plan.nextLifecycle.chips.used).toEqual(["bench_boost"]);
    // Squad + purchase prices preserved for the next GW.
    expect(plan.postTeam.squad).toBe(snap.team.squad);
    expect(plan.postPurchasePrices).toBe(snap.purchasePrices);
  });

  it("caps free-transfer rollover at 2", () => {
    const snap = makeSnapshot({
      team: {
        teamName: "T",
        managerName: "M",
        formation: "4-4-2" as const,
        bank: 1,
        freeTransfers: 2, // 2 + 1 = 3 → capped at 2
        pendingTransfers: 0,
        squad: squad15(),
      },
      lifecycle: {
        chips: { active: null, used: [] },
        currentGameweek: 14,
        transferHitPoints: 0,
        results: { 14: { finalized: true } as any },
      },
    });
    const plan = buildCloudAdvancePlan({
      snapshot: snap,
      nextGameweekNumber: 15,
      nextGameweekId: "gw-15",
    });
    expect(plan.ok).toBe(true);
    if (plan.ok) expect(plan.nextFreeTransfers).toBe(2);
  });
});
