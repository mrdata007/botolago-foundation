import type { FantasyPlayer, FixtureDifficulty } from "@/types/fantasy";

export type PlayerFixtureDataState = "loading" | "ready" | "error";

export type PlayerPerformanceMetric = "totalPoints" | "form" | "ownership" | "expectedPoints";

export type PlayerPerformanceAvailability = Readonly<
  Partial<Record<PlayerPerformanceMetric, boolean>>
>;

export const PLAYER_STATUS_SORT_ORDER = {
  available: 0,
  doubtful: 1,
  injured: 2,
  suspended: 3,
  unavailable: 4,
  ineligible: 5,
} satisfies Record<FantasyPlayer["status"], number>;

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
  /** Epoch milliseconds captured when the fixture query settled. */
  readonly fixtureReferenceTime?: number;
  readonly performanceAvailability?: PlayerPerformanceAvailability;
}

function kickoffEpoch(fixture: FixtureDifficulty): number {
  if (!fixture.kickoffAt) return Number.POSITIVE_INFINITY;
  const value = Date.parse(fixture.kickoffAt);
  return Number.isNaN(value) ? Number.POSITIVE_INFINITY : value;
}

export function compareFixtureSchedule(left: FixtureDifficulty, right: FixtureDifficulty): number {
  if (left.gameweek !== right.gameweek) return left.gameweek - right.gameweek;

  const leftKickoff = kickoffEpoch(left);
  const rightKickoff = kickoffEpoch(right);
  if (leftKickoff !== rightKickoff) return leftKickoff < rightKickoff ? -1 : 1;
  if (left.isHome !== right.isHome) return left.isHome ? -1 : 1;
  return left.opponentClubId.localeCompare(right.opponentClubId);
}

export function isUpcomingFixture(fixture: FixtureDifficulty, referenceTime?: number): boolean {
  if (referenceTime === undefined || !Number.isFinite(referenceTime) || !fixture.kickoffAt) {
    return true;
  }

  const kickoff = Date.parse(fixture.kickoffAt);
  return Number.isNaN(kickoff) || kickoff > referenceTime;
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
  referenceTime?: number,
): FixtureDifficulty | null {
  return (
    fixtures
      .filter((fixture) => fixture.clubId === clubId && isUpcomingFixture(fixture, referenceTime))
      .sort(compareFixtureSchedule)[0] ?? null
  );
}

export function getPlayerFixtureFallbackKey(
  state: PlayerFixtureDataState,
):
  | "fantasy.players.fixture_loading"
  | "fantasy.players.fixture_error"
  | "fantasy.players.no_fixture" {
  if (state === "loading") return "fantasy.players.fixture_loading";
  if (state === "error") return "fantasy.players.fixture_error";
  return "fantasy.players.no_fixture";
}

export function buildPlayerDecisionPresentation({
  player,
  fixtures = [],
  fixtureReferenceTime,
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
    nextFixture: selectUpcomingFixture(player.clubId, fixtures, fixtureReferenceTime),
    performance,
  };
}
