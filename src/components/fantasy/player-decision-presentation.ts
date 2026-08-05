import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";

export type PlayerPerformanceMetric = "totalPoints" | "form" | "ownership" | "expectedPoints";

export type PlayerPerformanceAvailability = Readonly<
  Partial<Record<PlayerPerformanceMetric, boolean>>
>;

export interface PlayerDecisionPerformance {
  readonly totalPoints?: number;
  readonly form?: number;
  readonly ownership?: number;
  readonly expectedPoints?: number;
}

export interface PlayerDecisionPresentation {
  readonly id: string;
  readonly name: FantasyPlayer["name"];
  readonly clubId: string;
  readonly position: FantasyPlayer["position"];
  readonly price: number;
  readonly status: FantasyPlayer["status"];
  readonly nextFixture: FixtureDifficulty | null;
  readonly performance: PlayerDecisionPerformance;
}

export interface BuildPlayerDecisionPresentationInput {
  readonly player: FantasyPlayer;
  readonly fixtures?: readonly FixtureDifficulty[];
  readonly performanceAvailability?: PlayerPerformanceAvailability;
}

function kickoffEpoch(fixture: FixtureDifficulty): number {
  if (!fixture.kickoffAt) return Number.POSITIVE_INFINITY;
  const value = Date.parse(fixture.kickoffAt);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

function compareFixtures(left: FixtureDifficulty, right: FixtureDifficulty): number {
  if (left.gameweek !== right.gameweek) return left.gameweek - right.gameweek;

  const leftKickoff = kickoffEpoch(left);
  const rightKickoff = kickoffEpoch(right);
  if (leftKickoff !== rightKickoff) return leftKickoff < rightKickoff ? -1 : 1;
  if (left.isHome !== right.isHome) return left.isHome ? -1 : 1;
  return left.opponentClubId.localeCompare(right.opponentClubId);
}

function isAvailableMetric(
  value: number | undefined,
  available: boolean | undefined,
): value is number {
  return available === true && typeof value === "number" && Number.isFinite(value);
}

export function selectUpcomingFixture(
  clubId: string,
  fixtures: readonly FixtureDifficulty[],
): FixtureDifficulty | null {
  return (
    fixtures
      .filter((fixture) => fixture.clubId === clubId && fixture.isBlank !== true)
      .slice()
      .sort(compareFixtures)[0] ?? null
  );
}

export function buildPlayerDecisionPresentation({
  player,
  fixtures = [],
  performanceAvailability,
}: BuildPlayerDecisionPresentationInput): PlayerDecisionPresentation {
  const performance: PlayerDecisionPerformance = {
    ...(isAvailableMetric(player.totalPoints, performanceAvailability?.totalPoints)
      ? { totalPoints: player.totalPoints }
      : {}),
    ...(isAvailableMetric(player.form, performanceAvailability?.form) ? { form: player.form } : {}),
    ...(isAvailableMetric(player.ownership, performanceAvailability?.ownership)
      ? { ownership: player.ownership }
      : {}),
    ...(isAvailableMetric(player.expectedPoints, performanceAvailability?.expectedPoints)
      ? { expectedPoints: player.expectedPoints }
      : {}),
  };

  return {
    id: player.id,
    name: player.name,
    clubId: player.clubId,
    position: player.position,
    price: player.price,
    status: player.status,
    nextFixture: selectUpcomingFixture(player.clubId, fixtures),
    performance,
  };
}
