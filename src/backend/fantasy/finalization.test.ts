import { describe, expect, it } from "bun:test";
import {
  FINALIZATION_STAGES,
  captureFreeHitSnapshot,
  finalizeGameweek,
  restoreFreeHitSnapshot,
  type FinalizationStage,
} from "./finalization";

describe("Fantasy finalization", () => {
  it("resumes after a partial failure without replaying completed stages", async () => {
    const executed: FinalizationStage[] = [];
    const checkpoints: number[] = [];
    const result = await finalizeGameweek(
      {
        gameweekId: "gw",
        calculationVersion: 2,
        completedStages: ["verify_football", "freeze_inputs"],
        finalized: false,
      },
      { run: async (stage) => void executed.push(stage) },
      async (checkpoint) => void checkpoints.push(checkpoint.completedStages.length),
    );
    expect(executed).toEqual(FINALIZATION_STAGES.slice(2));
    expect(checkpoints.at(-1)).toBe(FINALIZATION_STAGES.length);
    expect(result.finalized).toBeTrue();
  });

  it("short-circuits a finalized gameweek", async () => {
    let calls = 0;
    const checkpoint = {
      gameweekId: "gw",
      calculationVersion: 1,
      completedStages: FINALIZATION_STAGES,
      finalized: true,
    } as const;
    expect(
      await finalizeGameweek(
        checkpoint,
        { run: async () => void calls++ },
        async () => void calls++,
      ),
    ).toBe(checkpoint);
    expect(calls).toBe(0);
  });

  it("captures and restores Free Hit exactly once", () => {
    const first = captureFreeHitSnapshot(null, {
      teamId: "team",
      gameweekId: "gw",
      teamVersion: 3,
      bank: 2.5,
      freeTransfers: 1,
      players: ["a", "b"],
    });
    const repeated = captureFreeHitSnapshot(first, {
      teamId: "team",
      gameweekId: "gw",
      teamVersion: 4,
      bank: 0,
      freeTransfers: 0,
      players: ["replacement"],
    });
    expect(repeated).toBe(first);
    const restored = restoreFreeHitSnapshot(first, "2030-01-01T00:00:00Z");
    expect(restored.changed).toBeTrue();
    expect(restoreFreeHitSnapshot(restored.snapshot, "2030-01-02T00:00:00Z").changed).toBeFalse();
  });
});
