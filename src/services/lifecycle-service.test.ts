// @ts-nocheck
import "./__test-shim";
import { afterEach, beforeEach, describe, expect, it } from "bun:test";
import { fantasyStateStore } from "@/services/fantasy-state";
import { fantasyService } from "@/services/fantasy-mock";
import { activateChip, DEFAULT_CHIPS } from "@/lib/fantasy-engine";
import {
  advanceGameweek,
  finalizeGameweek,
  isGameweekFinalized,
  rollFreeTransfers,
} from "./lifecycle-service";

async function resetAll() {
  fantasyStateStore.reset();
  fantasyService.__testing?.reset?.();
}

beforeEach(async () => { await resetAll(); });
afterEach(async () => { await resetAll(); });

async function loadInputs(gw = 14) {
  const team = await fantasyService.getTeam();
  const players = await fantasyService.getPlayers();
  const raw = await fantasyService.getGameweekResult(gw);
  return { team, players, breakdown: raw.breakdown, averagePoints: raw.averagePoints, highestPoints: raw.highestPoints };
}

describe("rollFreeTransfers", () => {
  it("adds 1 and caps at 2", () => {
    expect(rollFreeTransfers(0)).toBe(1);
    expect(rollFreeTransfers(1)).toBe(2);
    expect(rollFreeTransfers(2)).toBe(2);
    expect(rollFreeTransfers(-5)).toBe(1);
  });
});

describe("finalizeGameweek", () => {
  it("persists result and marks GW finalized", async () => {
    const inp = await loadInputs(14);
    const out = finalizeGameweek({ gameweek: 14, ...inp });
    expect(out.changed).toBe(true);
    expect(out.result.finalized).toBe(true);
    expect(isGameweekFinalized(14)).toBe(true);
  });

  it("is idempotent — a second finalize returns the same result and no duplicate chip use", async () => {
    const inp = await loadInputs(14);
    // Activate triple_captain first so we can also check chip semantics.
    const state0 = fantasyStateStore.read();
    const chipsAfterActivate = activateChip(state0.chips, "triple_captain", { gameweek: 14, team: inp.team });
    fantasyStateStore.write({ chips: chipsAfterActivate });

    const first = finalizeGameweek({ gameweek: 14, ...inp });
    const second = finalizeGameweek({ gameweek: 14, ...inp });
    expect(first.changed).toBe(true);
    expect(second.changed).toBe(false);
    expect(second.result.finalizedAt).toBe(first.result.finalizedAt);
    const chips = fantasyStateStore.read().chips;
    expect(chips.used.filter((k) => k === "triple_captain")).toHaveLength(1);
    expect(chips.active).toBe(null);
  });

  it("restores the Free Hit snapshot exactly on finalize", async () => {
    const team0 = await fantasyService.getTeam();
    const inp = await loadInputs(14);
    // Activate Free Hit — this records a snapshot in ChipsState.
    const state0 = fantasyStateStore.read();
    const chips = activateChip(state0.chips, "free_hit", { gameweek: 14, team: team0 });
    fantasyStateStore.write({ chips });
    // Mutate the persisted team: change formation and bank to prove reversion.
    fantasyService.saveTeam({ formation: "3-5-2", bank: 0, freeTransfers: 0 });

    const out = finalizeGameweek({ gameweek: 14, ...inp, team: await fantasyService.getTeam() });
    expect(out.freeHitRestored).toBe(true);
    const restored = await fantasyService.getTeam();
    expect(restored.formation).toBe(team0.formation);
    expect(restored.bank).toBe(team0.bank);
    expect(restored.freeTransfers).toBe(team0.freeTransfers);
  });

  it("keeps the wildcard team after finalize (no reversion)", async () => {
    const inp = await loadInputs(14);
    const state0 = fantasyStateStore.read();
    const chips = activateChip(state0.chips, "wildcard", { gameweek: 14, team: inp.team });
    fantasyStateStore.write({ chips });
    fantasyService.saveTeam({ formation: "3-5-2" });

    finalizeGameweek({ gameweek: 14, ...inp, team: await fantasyService.getTeam() });
    const after = await fantasyService.getTeam();
    expect(after.formation).toBe("3-5-2");
    const persistedChips = fantasyStateStore.read().chips;
    expect(persistedChips.used).toContain("wildcard");
    expect(persistedChips.active).toBe(null);
  });

  it("records the transfer hit in the finalized result", async () => {
    const inp = await loadInputs(14);
    fantasyStateStore.write({ transferHitPoints: 8 });
    const out = finalizeGameweek({ gameweek: 14, ...inp });
    expect(out.result.hitPointsApplied).toBe(8);
  });
});

describe("advanceGameweek", () => {
  it("requires the current gameweek to be finalized", async () => {
    const team = await fantasyService.getTeam();
    const res = advanceGameweek({ targetGameweek: fantasyStateStore.read().currentGameweek + 1, team });
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.error).toBe("must_finalize_first");
  });

  it("caps free transfers at 2, clears hit and pending, preserves history", async () => {
    const inp = await loadInputs(14);
    finalizeGameweek({ gameweek: 14, ...inp });
    fantasyService.saveTeam({ freeTransfers: 2, pendingTransfers: 3 });
    fantasyStateStore.write({ transferHitPoints: 12 });
    const team = await fantasyService.getTeam();
    const res = advanceGameweek({ targetGameweek: 15, team });
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.nextFreeTransfers).toBe(2);
    const after = await fantasyService.getTeam();
    expect(after.pendingTransfers).toBe(0);
    expect(fantasyStateStore.read().transferHitPoints).toBe(0);
    expect(fantasyStateStore.read().currentGameweek).toBe(15);
    // Finalized result and used chips still there.
    expect(fantasyStateStore.read().results[14]?.finalized).toBe(true);
  });

  it("is idempotent when called again with the same target", async () => {
    const inp = await loadInputs(14);
    finalizeGameweek({ gameweek: 14, ...inp });
    const team = await fantasyService.getTeam();
    const r1 = advanceGameweek({ targetGameweek: 15, team });
    const r2 = advanceGameweek({ targetGameweek: 15, team: await fantasyService.getTeam() });
    expect(r1.ok).toBe(true);
    expect(r2.ok).toBe(true);
    if (r2.ok) expect(r2.changed).toBe(false);
  });
});
