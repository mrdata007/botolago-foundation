export const FINALIZATION_STAGES = [
  "verify_football",
  "freeze_inputs",
  "calculate_player_points",
  "apply_lineups",
  "apply_substitutions",
  "apply_chips_and_hits",
  "persist_results",
  "restore_free_hit",
  "roll_free_transfers",
  "recalculate_rankings",
  "emit_notifications",
  "mark_finalized",
] as const;

export type FinalizationStage = (typeof FINALIZATION_STAGES)[number];

export interface FinalizationCheckpoint {
  readonly gameweekId: string;
  readonly calculationVersion: number;
  readonly completedStages: readonly FinalizationStage[];
  readonly finalized: boolean;
}

export interface FinalizationStageRunner {
  run(stage: FinalizationStage, checkpoint: FinalizationCheckpoint): Promise<void>;
}

/**
 * Resumable orchestration only. Each runner stage owns a bounded transactional
 * database operation and must be idempotent under the same calculation version.
 */
export async function finalizeGameweek(
  initial: FinalizationCheckpoint,
  runner: FinalizationStageRunner,
  persistCheckpoint: (checkpoint: FinalizationCheckpoint) => Promise<void>,
): Promise<FinalizationCheckpoint> {
  if (initial.finalized) return initial;
  if (!Number.isInteger(initial.calculationVersion) || initial.calculationVersion <= 0)
    throw new Error("invalid_calculation_version");
  let checkpoint = initial;
  for (const stage of FINALIZATION_STAGES) {
    if (checkpoint.completedStages.includes(stage)) continue;
    await runner.run(stage, checkpoint);
    checkpoint = {
      ...checkpoint,
      completedStages: [...checkpoint.completedStages, stage],
      finalized: stage === "mark_finalized",
    };
    await persistCheckpoint(checkpoint);
  }
  return checkpoint;
}

export interface FreeHitSnapshot<TPlayer> {
  readonly teamId: string;
  readonly gameweekId: string;
  readonly teamVersion: number;
  readonly bank: number;
  readonly freeTransfers: number;
  readonly players: readonly TPlayer[];
  readonly restoredAt: string | null;
}

export function captureFreeHitSnapshot<TPlayer>(
  existing: FreeHitSnapshot<TPlayer> | null,
  next: Omit<FreeHitSnapshot<TPlayer>, "restoredAt">,
): FreeHitSnapshot<TPlayer> {
  if (existing) return existing;
  return { ...next, players: [...next.players], restoredAt: null };
}

export function restoreFreeHitSnapshot<TPlayer>(
  snapshot: FreeHitSnapshot<TPlayer>,
  restoredAt: string,
): { readonly changed: boolean; readonly snapshot: FreeHitSnapshot<TPlayer> } {
  if (snapshot.restoredAt) return { changed: false, snapshot };
  return { changed: true, snapshot: { ...snapshot, restoredAt } };
}
