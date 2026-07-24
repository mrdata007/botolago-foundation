import type { FantasyPosition } from "./contracts";

export interface SubstitutionPlayer {
  readonly id: string;
  readonly position: FantasyPosition;
  readonly starter: boolean;
  readonly benchOrder: number | null;
  readonly didPlay: boolean;
  readonly captain: boolean;
  readonly viceCaptain: boolean;
}

export interface FormationLimit {
  readonly position: FantasyPosition;
  readonly minimum: number;
  readonly maximum: number;
}
export interface AutomaticSubstitution {
  readonly playerOutId: string;
  readonly playerInId: string;
  readonly reason: string;
}

export function calculateAutomaticSubstitutions(
  players: readonly SubstitutionPlayer[],
  formation: readonly FormationLimit[],
  benchBoost: boolean,
): {
  readonly substitutions: readonly AutomaticSubstitution[];
  readonly effectiveCaptainId: string | null;
} {
  const originalCaptain = players.find((player) => player.captain);
  const vice = players.find((player) => player.viceCaptain);
  const effectiveCaptainId = originalCaptain?.didPlay
    ? originalCaptain.id
    : vice?.didPlay
      ? vice.id
      : null;
  if (benchBoost) return { substitutions: [], effectiveCaptainId };

  const activeStarters = players.filter((player) => player.starter && player.didPlay);
  const missing = players.filter((player) => player.starter && !player.didPlay);
  const bench = players
    .filter((player) => !player.starter && player.didPlay)
    .sort((a, b) => (a.benchOrder ?? 99) - (b.benchOrder ?? 99));
  const substitutions: AutomaticSubstitution[] = [];

  for (const absent of missing) {
    const candidateIndex = bench.findIndex((candidate) => {
      if (candidate.position === "GK" || absent.position === "GK")
        return candidate.position === absent.position;
      return isValidFormation([...activeStarters, candidate], formation);
    });
    if (candidateIndex < 0) continue;
    const [candidate] = bench.splice(candidateIndex, 1);
    if (!candidate) continue;
    activeStarters.push(candidate);
    substitutions.push({
      playerOutId: absent.id,
      playerInId: candidate.id,
      reason: absent.position === "GK" ? "goalkeeper_did_not_play" : "outfield_did_not_play",
    });
  }
  return { substitutions, effectiveCaptainId };
}

function isValidFormation(
  players: readonly SubstitutionPlayer[],
  limits: readonly FormationLimit[],
): boolean {
  return limits.every((limit) => {
    const count = players.filter((player) => player.position === limit.position).length;
    return count >= limit.minimum && count <= limit.maximum;
  });
}
