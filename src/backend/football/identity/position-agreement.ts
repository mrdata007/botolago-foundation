import type { PositionSignal, ProviderSquad } from "./contracts";

/** Fewer paired players with both positions known than this and no rate is claimed. */
export const MIN_PAIRS_FOR_POSITION_AGREEMENT = 30;

/** A pairing that rests on independent evidence (an incident both providers attribute), never on a name. */
export interface IndependentPair {
  readonly sofascoreId: string;
  readonly flashscoreId: string;
}

export type PositionAgreement =
  | {
      readonly status: "POSITION_AGREEMENT_NOT_ESTABLISHED";
      readonly pairsConsidered: number;
      readonly bothPositionsKnown: number;
      readonly reason: string;
    }
  | {
      readonly status: "MEASURED_SIGNAL_ONLY";
      readonly pairsConsidered: number;
      readonly bothPositionsKnown: number;
      readonly agree: number;
      readonly disagree: number;
      /** Sofascore position (row) against Flashscore position (column). */
      readonly matrix: Readonly<Record<string, Readonly<Record<string, number>>>>;
    };

/**
 * Agreement between Sofascore's position and Flashscore's `PLAYER_TYPE_ID`
 * for players the two providers are already known to share from independent
 * evidence. This only measures; the Flashscore field stays a reviewer/ranking
 * signal either way, and nobody is paired by name to make the number bigger.
 */
export function measurePositionAgreement(
  pairs: readonly IndependentPair[],
  squads: readonly ProviderSquad[],
): PositionAgreement {
  const positions = (provider: "sofascore" | "flashscore") => {
    const map = new Map<string, PositionSignal | null>();
    for (const squad of squads)
      if (squad.provider === provider)
        for (const player of squad.players) map.set(player.externalPlayerId, player.positionSignal);
    return map;
  };
  const sofa = positions("sofascore");
  const flash = positions("flashscore");
  const matrix: Record<string, Record<string, number>> = {};
  let known = 0;
  let agree = 0;
  for (const pair of pairs) {
    const a = sofa.get(pair.sofascoreId) ?? null;
    const b = flash.get(pair.flashscoreId) ?? null;
    if (a === null || b === null) continue;
    known += 1;
    if (a === b) agree += 1;
    matrix[a] = { ...(matrix[a] ?? {}), [b]: ((matrix[a] ?? {})[b] ?? 0) + 1 };
  }
  if (known < MIN_PAIRS_FOR_POSITION_AGREEMENT)
    return {
      status: "POSITION_AGREEMENT_NOT_ESTABLISHED",
      pairsConsidered: pairs.length,
      bothPositionsKnown: known,
      reason: `fewer than ${MIN_PAIRS_FOR_POSITION_AGREEMENT} independently paired players with both positions`,
    };
  return {
    status: "MEASURED_SIGNAL_ONLY",
    pairsConsidered: pairs.length,
    bothPositionsKnown: known,
    agree,
    disagree: known - agree,
    matrix,
  };
}

/**
 * The independent pairs among reconciled match players: only those whose two
 * provider entries were paired on an incident both providers attribute to him.
 * A pairing that rests on a shirt number, a single source or anything else is
 * left out, and names are never used.
 */
export function independentPairs(
  players: readonly {
    readonly identity: string;
    readonly sofascoreId: string | null;
    readonly flashscoreId: string | null;
  }[],
): IndependentPair[] {
  const seen = new Set<string>();
  const pairs: IndependentPair[] = [];
  for (const player of players) {
    if (player.identity !== "incident" || !player.sofascoreId || !player.flashscoreId) continue;
    const key = `${player.sofascoreId}|${player.flashscoreId}`;
    if (seen.has(key)) continue;
    seen.add(key);
    pairs.push({ sofascoreId: player.sofascoreId, flashscoreId: player.flashscoreId });
  }
  return pairs;
}
