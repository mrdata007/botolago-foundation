import type { FantasyPosition } from "./contracts";

export interface ScoringRules {
  readonly appearanceShort: number;
  readonly appearanceFull: number;
  readonly fullAppearanceMinutes: number;
  readonly assist: number;
  readonly goal: Readonly<Record<FantasyPosition, number>>;
  readonly cleanSheet: Readonly<Record<FantasyPosition, number>>;
  readonly goalsConcededPerPoint: Partial<Readonly<Record<FantasyPosition, number>>>;
  readonly savesPerPoint: number;
  readonly penaltySave: number;
  readonly penaltyMiss: number;
  readonly yellowCard: number;
  readonly redCard: number;
  readonly secondYellowDismissal: number;
  readonly ownGoal: number;
  readonly bonusEnabled: boolean;
  readonly playerOfMatchEnabled: boolean;
}

export interface PlayerFixtureStats {
  /** Official regulation minutes only; stoppage time must not inflate thresholds. */
  readonly minutes: number;
  readonly goals: number;
  readonly assists: number;
  readonly cleanSheet: boolean;
  readonly goalsConceded: number;
  readonly saves: number;
  readonly penaltiesSaved: number;
  readonly penaltiesMissed: number;
  readonly yellowCards: number;
  readonly redCards: number;
  readonly secondYellowDismissals: number;
  readonly ownGoals: number;
  readonly bonus: number;
  readonly playerOfMatchPoints: number;
}

export interface PointEvent {
  readonly category: string;
  readonly points: number;
  readonly sourceKey: string;
}

/**
 * Complete category snapshot for one player/fixture under an immutable ruleset.
 * Persist every returned category, including zero, with the existing point
 * upsert RPC. Stable keys replace prior aggregates when provider facts change;
 * they never identify individual Football events. Ordinary corrections retain
 * the scoring version and advance only the source sequence.
 */
export function scorePlayerFixture(
  playerId: string,
  fixtureId: string,
  position: FantasyPosition,
  stats: PlayerFixtureStats,
  rules: ScoringRules,
): readonly PointEvent[] {
  const events: PointEvent[] = [];
  const add = (category: string, points: number) => {
    events.push({
      category,
      points,
      sourceKey: `fixture-stats:${fixtureId}:${playerId}:${category}`,
    });
  };
  add(
    "appearance",
    stats.minutes <= 0
      ? 0
      : stats.minutes >= rules.fullAppearanceMinutes
        ? rules.appearanceFull
        : rules.appearanceShort,
  );
  add("goal", stats.goals * rules.goal[position]);
  add("assist", stats.assists * rules.assist);
  add(
    "clean_sheet",
    stats.cleanSheet && stats.minutes >= rules.fullAppearanceMinutes
      ? rules.cleanSheet[position]
      : 0,
  );
  const concededRate = rules.goalsConcededPerPoint[position];
  add(
    "goals_conceded",
    concededRate && stats.minutes >= rules.fullAppearanceMinutes
      ? -Math.floor(stats.goalsConceded / concededRate)
      : 0,
  );
  add("saves", position === "GK" ? Math.floor(stats.saves / rules.savesPerPoint) : 0);
  add("penalty_save", position === "GK" ? stats.penaltiesSaved * rules.penaltySave : 0);
  add("penalty_miss", stats.penaltiesMissed * rules.penaltyMiss);
  add("yellow_card", stats.yellowCards * rules.yellowCard);
  add("red_card", stats.redCards * rules.redCard);
  add("second_yellow_dismissal", stats.secondYellowDismissals * rules.secondYellowDismissal);
  add("own_goal", stats.ownGoals * rules.ownGoal);
  if (rules.bonusEnabled) add("bonus", stats.bonus);
  if (rules.playerOfMatchEnabled) add("player_of_match", stats.playerOfMatchPoints);
  return events;
}

export function applyLineupMultiplier(points: number, multiplier: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(multiplier) || multiplier < 0)
    throw new Error("invalid_scoring_input");
  return points * multiplier;
}
