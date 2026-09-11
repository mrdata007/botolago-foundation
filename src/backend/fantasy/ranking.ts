export interface FantasyRankingFacts {
  readonly teamId: string;
  readonly totalPoints: number;
  readonly transferHitPoints: number;
  readonly confirmedTransfers: number;
  readonly latestFinalizedGameweekScore: number | null;
  readonly teamCreatedAt: string;
}

export function compareFantasyRank(a: FantasyRankingFacts, b: FantasyRankingFacts): number {
  return (
    b.totalPoints - a.totalPoints ||
    a.transferHitPoints - b.transferHitPoints ||
    a.confirmedTransfers - b.confirmedTransfers ||
    compareNullableScoreDesc(a.latestFinalizedGameweekScore, b.latestFinalizedGameweekScore) ||
    a.teamCreatedAt.localeCompare(b.teamCreatedAt) ||
    a.teamId.localeCompare(b.teamId)
  );
}

function compareNullableScoreDesc(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return 1;
  if (b === null) return -1;
  return b - a;
}
