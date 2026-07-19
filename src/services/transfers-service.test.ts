// Run with: `bun test src/services/transfers-service.test.ts`
import { describe, it, expect } from "bun:test";
import { applyConfirmedTransfers, previewTransfers } from "./transfers-service";
import { DEFAULT_CHIPS, type ChipsState } from "@/lib/fantasy-engine";
import type { FantasyTeam, SquadPlayer } from "@/types/fantasy";

const sp = (playerId: string, slot: number): SquadPlayer => ({
  playerId,
  slot,
  isCaptain: false,
  isViceCaptain: false,
});

const team: FantasyTeam = {
  managerName: "U",
  teamName: "Test",
  formation: "3-4-3",
  bank: 2.0,
  freeTransfers: 1,
  pendingTransfers: 0,
  squad: [
    sp("gk1", 1),
    sp("d1", 2),
    sp("d2", 3),
    sp("d3", 4),
    sp("m1", 5),
    sp("m2", 6),
    sp("m3", 7),
    sp("m4", 8),
    sp("f1", 9),
    sp("f2", 10),
    sp("f3", 11),
    sp("gk2", 12),
    sp("d4", 13),
    sp("m5", 14),
    sp("f4", 15),
  ],
};

const future = new Date(Date.now() + 60_000).toISOString();
const past = new Date(Date.now() - 60_000).toISOString();

describe("previewTransfers", () => {
  it("computes free/paid/hit for a normal transfer within free-transfer budget", () => {
    const p = previewTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1"],
      inIds: ["m1b"],
      netCost: 0.5,
    });
    expect(p.totalTransfers).toBe(1);
    expect(p.free).toBe(1);
    expect(p.paid).toBe(0);
    expect(p.hitPoints).toBe(0);
    expect(p.chipActive).toBeNull();
    expect(p.freeTransfersAfter).toBe(0);
    expect(p.bankAfter).toBeCloseTo(1.5);
  });

  it("charges a hit for paid transfers beyond the free-transfer budget", () => {
    const p = previewTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1", "d1"],
      inIds: ["m1b", "d1b"],
      netCost: 0,
    });
    expect(p.paid).toBe(1);
    expect(p.hitPoints).toBe(4);
  });

  it("zeroes cost when Wildcard is active regardless of transfer count", () => {
    const chips: ChipsState = { ...DEFAULT_CHIPS, active: "wildcard" };
    const p = previewTransfers({
      team,
      chips,
      outIds: ["m1", "d1", "d2", "f1"],
      inIds: ["m1b", "d1b", "d2b", "f1b"],
      netCost: 0,
    });
    expect(p.hitPoints).toBe(0);
    expect(p.paid).toBe(0);
    expect(p.chipActive).toBe("wildcard");
    expect(p.freeTransfersAfter).toBe(team.freeTransfers);
  });

  it("zeroes cost when Free Hit is active and does not consume free transfers", () => {
    const chips: ChipsState = { ...DEFAULT_CHIPS, active: "free_hit" };
    const p = previewTransfers({
      team,
      chips,
      outIds: ["m1", "d1"],
      inIds: ["m1b", "d1b"],
      netCost: 0,
    });
    expect(p.hitPoints).toBe(0);
    expect(p.chipActive).toBe("free_hit");
    expect(p.freeTransfersAfter).toBe(team.freeTransfers);
  });

  it("flags over-budget when netCost exceeds bank", () => {
    const p = previewTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1"],
      inIds: ["m1b"],
      netCost: 5.0,
    });
    expect(p.overBudget).toBe(true);
  });
});

describe("applyConfirmedTransfers", () => {
  it("returns the next squad, bank, and free transfers for a normal confirmation", () => {
    const res = applyConfirmedTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1"],
      inIds: ["m1b"],
      netCost: 0.3,
      deadlineIso: future,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.nextSquad.find((s) => s.playerId === "m1b")?.slot).toBe(5);
    expect(res.value.nextBank).toBeCloseTo(1.7);
    expect(res.value.nextFreeTransfers).toBe(0);
    expect(res.value.hitPointsApplied).toBe(0);
    expect(res.value.freeHitSnapshotTaken).toBe(false);
  });

  it("rejects when the deadline has passed", () => {
    const res = applyConfirmedTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1"],
      inIds: ["m1b"],
      netCost: 0,
      deadlineIso: past,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("deadline_passed");
  });

  it("rejects when the resulting bank would be negative", () => {
    const res = applyConfirmedTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: ["m1"],
      inIds: ["m1b"],
      netCost: 10,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("over_budget");
  });

  it("wildcard confirmation charges zero and keeps free transfers intact", () => {
    const chips: ChipsState = { ...DEFAULT_CHIPS, active: "wildcard" };
    const res = applyConfirmedTransfers({
      team,
      chips,
      outIds: ["m1", "d1", "f1"],
      inIds: ["m1b", "d1b", "f1b"],
      netCost: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.hitPointsApplied).toBe(0);
    expect(res.value.nextFreeTransfers).toBe(team.freeTransfers);
    expect(res.value.chips.active).toBe("wildcard");
    expect(res.value.chips.freeHitSnapshot).toBeUndefined();
  });

  it("free_hit first confirmation captures an exact pre-mutation snapshot", () => {
    const chips: ChipsState = { ...DEFAULT_CHIPS, active: "free_hit" };
    const res = applyConfirmedTransfers({
      team,
      chips,
      outIds: ["m1", "d1"],
      inIds: ["m1b", "d1b"],
      netCost: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.freeHitSnapshotTaken).toBe(true);
    const snap = res.value.chips.freeHitSnapshot!;
    expect(snap.formation).toBe(team.formation);
    expect(snap.bank).toBe(team.bank);
    expect(snap.freeTransfers).toBe(team.freeTransfers);
    expect(snap.squad.map((s) => s.playerId)).toEqual(team.squad.map((s) => s.playerId));
    expect(res.value.hitPointsApplied).toBe(0);
  });

  it("free_hit subsequent confirmations do NOT overwrite the original snapshot", () => {
    const originalSnap = {
      squad: team.squad.map((s) => ({ ...s })),
      formation: team.formation,
      bank: team.bank,
      freeTransfers: team.freeTransfers,
    };
    // Simulate a team that has already had a Free Hit mutation applied.
    const mutatedTeam: FantasyTeam = {
      ...team,
      bank: 1.0,
      squad: team.squad.map((s) => (s.playerId === "m1" ? { ...s, playerId: "m1b" } : s)),
    };
    const chips: ChipsState = {
      ...DEFAULT_CHIPS,
      active: "free_hit",
      freeHitSnapshot: originalSnap,
    };
    const res = applyConfirmedTransfers({
      team: mutatedTeam,
      chips,
      outIds: ["d1"],
      inIds: ["d1b"],
      netCost: 0,
    });
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.value.freeHitSnapshotTaken).toBe(false);
    expect(res.value.chips.freeHitSnapshot).toEqual(originalSnap);
  });

  it("rejects when no changes are pending", () => {
    const res = applyConfirmedTransfers({
      team,
      chips: DEFAULT_CHIPS,
      outIds: [],
      inIds: [],
      netCost: 0,
    });
    expect(res.ok).toBe(false);
    if (res.ok) return;
    expect(res.error).toBe("no_changes");
  });
});
