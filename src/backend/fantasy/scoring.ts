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
  readonly ownGoal: number;
}

export interface PlayerFixtureStats {
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
  readonly ownGoals: number;
  readonly bonus: number;
}

export interface PointEvent {
  readonly category: string;
  readonly points: number;
  readonly sourceKey: string;
}

export function scorePlayerFixture(
  playerId: string,
  fixtureId: string,
  position: FantasyPosition,
  stats: PlayerFixtureStats,
  rules: ScoringRules,
): readonly PointEvent[] {
  const events: PointEvent[] = [];
  const add = (category: string, points: number, suffix = "1") => {
    if (points !== 0)
      events.push({
        category,
        points,
        sourceKey: `${fixtureId}:${playerId}:${category}:${suffix}`,
      });
  };
  if (stats.minutes > 0)
    add(
      "appearance",
      stats.minutes >= rules.fullAppearanceMinutes ? rules.appearanceFull : rules.appearanceShort,
    );
  add("goal", stats.goals * rules.goal[position], String(stats.goals));
  add("assist", stats.assists * rules.assist, String(stats.assists));
  if (stats.cleanSheet && stats.minutes >= rules.fullAppearanceMinutes)
    add("clean_sheet", rules.cleanSheet[position]);
  const concededRate = rules.goalsConcededPerPoint[position];
  if (concededRate && stats.minutes >= rules.fullAppearanceMinutes)
    add(
      "goals_conceded",
      -Math.floor(stats.goalsConceded / concededRate),
      String(stats.goalsConceded),
    );
  add("saves", Math.floor(stats.saves / rules.savesPerPoint), String(stats.saves));
  add("penalty_save", stats.penaltiesSaved * rules.penaltySave, String(stats.penaltiesSaved));
  add("penalty_miss", stats.penaltiesMissed * rules.penaltyMiss, String(stats.penaltiesMissed));
  add("yellow_card", stats.yellowCards * rules.yellowCard, String(stats.yellowCards));
  add("red_card", stats.redCards * rules.redCard, String(stats.redCards));
  add("own_goal", stats.ownGoals * rules.ownGoal, String(stats.ownGoals));
  add("bonus", stats.bonus, String(stats.bonus));
  return events;
}

export function applyLineupMultiplier(points: number, multiplier: number): number {
  if (!Number.isFinite(points) || !Number.isFinite(multiplier) || multiplier < 0)
    throw new Error("invalid_scoring_input");
  return points * multiplier;
}
