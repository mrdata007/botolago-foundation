import type { FieldEvidence, ScoringField } from "../../src/backend/fantasy/adaptive-scoring";
const TYPES: Record<string, ScoringField> = {
  119: "minutes",
  52: "goals",
  79: "assists",
  88: "goalsConceded",
  57: "saves",
  113: "penaltiesSaved",
  112: "penaltiesMissed",
  84: "yellowCards",
  83: "redCards",
  85: "secondYellowDismissals",
  324: "ownGoals",
};
/** Inspect the original response, before legacy normalization introduces zeros.
 * Sparse absence requires a separately reviewed provider coverage contract; an
 * absent field alone never certifies a zero for adaptive scoring. */
export function collectAdaptiveEvidence(
  payload: unknown,
  observedAt: string,
  normalizedRows?: readonly { externalPlayerId: string; [key: string]: unknown }[],
): Record<string, FieldEvidence> {
  const fixture = (
    payload as {
      data?: {
        id?: number;
        lineups?: Array<{
          player_id?: number;
          details?: Array<{ type_id: number; data?: { value?: unknown } }>;
        }>;
      };
    }
  )?.data;
  const result: Record<string, FieldEvidence> = {};
  for (const lineup of fixture?.lineups ?? []) {
    if (!lineup.player_id) continue;
    const evidence: FieldEvidence = {};
    for (const detail of lineup.details ?? []) {
      const field = TYPES[String(detail.type_id)];
      if (!field) continue;
      const value = detail.data?.value;
      evidence[field] = {
        state:
          typeof value === "number" && Number.isSafeInteger(value) && value >= 0
            ? "verified"
            : "unknown",
        source: "sportsmonks",
        observedAt,
        references: [
          `sportsmonks:fixture:${fixture?.id}:player:${lineup.player_id}:type:${detail.type_id}`,
        ],
      };
    }
    if (evidence.minutes?.state === "verified" && evidence.goalsConceded?.state === "verified")
      evidence.cleanSheet = { ...evidence.goalsConceded, state: "derived" };
    const normalized = normalizedRows?.find(
      (row) => row.externalPlayerId === String(lineup.player_id),
    );
    for (const detail of lineup.details ?? []) {
      const field = TYPES[String(detail.type_id)];
      if (field && normalized && normalized[field] !== detail.data?.value && evidence[field])
        evidence[field] = { ...evidence[field]!, state: "unknown" };
    }
    if (evidence.minutes?.state !== "verified" || evidence.goalsConceded?.state !== "verified")
      delete evidence.cleanSheet;
    result[String(lineup.player_id)] = evidence;
  }
  return result;
}
