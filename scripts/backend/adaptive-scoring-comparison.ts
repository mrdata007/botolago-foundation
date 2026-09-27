import {
  certified,
  SIMPLE_FIELDS,
  DETAIL_FIELDS,
  readiness,
  scoreCertifiedPlayerFixture,
  type CertifiedStats,
  type FieldEvidence,
  type ScoringMode,
} from "../../src/backend/fantasy/adaptive-scoring";
import {
  scorePlayerFixture,
  type PlayerFixtureStats,
  type ScoringRules,
} from "../../src/backend/fantasy/scoring";
import type { FantasyPosition } from "../../src/backend/fantasy/contracts";
export interface ComparisonFixture {
  fixtureId: string;
  externalId: string;
  finished: boolean;
  mode: ScoringMode | null;
  fullReady: boolean;
  simpleReady: boolean;
  missingCoreFacts: readonly string[];
  players: readonly {
    playerId: string;
    position: FantasyPosition;
    stats: CertifiedStats;
    evidence: FieldEvidence;
    legacyStats?: PlayerFixtureStats;
  }[];
}
/** Pure/read-only: the production exporter must supply validated observations,
 * never turn legacy normalized zeros into field evidence. */
export function compareAdaptiveFixtures(
  fixtures: readonly ComparisonFixture[],
  rules: ScoringRules,
) {
  const sum = (events: readonly { points: number }[]) =>
    events.reduce((total, event) => total + event.points, 0);
  return {
    writesAttempted: false as const,
    fixtures: fixtures.map((fixture) => {
      const proposedMode =
        fixture.mode ?? (fixture.finished ? (fixture.fullReady ? "full" : "simple") : null);
      const ready =
        proposedMode === "full"
          ? fixture.fullReady
          : proposedMode === "simple" && fixture.simpleReady;
      const players = fixture.players.map((player) => {
        const coverage = readiness(player.stats, player.evidence, player.position);
        const proposedPoints = sum(
          scoreCertifiedPlayerFixture(
            player.playerId,
            fixture.fixtureId,
            player.position,
            player.stats,
            player.evidence,
            rules,
            proposedMode,
          ),
        );
        const previousPoints = player.legacyStats
          ? sum(
              scorePlayerFixture(
                player.playerId,
                fixture.fixtureId,
                player.position,
                player.legacyStats,
                rules,
              ),
            )
          : null;
        return {
          playerId: player.playerId,
          provisionalPoints: proposedPoints,
          missingFields: [...SIMPLE_FIELDS, ...DETAIL_FIELDS].filter(
            (field) => !certified(field, player.stats, player.evidence),
          ),
          previousPoints,
          scoreDifference:
            ready &&
            (proposedMode === "full" ? coverage.full : coverage.simple) &&
            previousPoints !== null
              ? proposedPoints - previousPoints
              : null,
        };
      });
      return {
        fixtureId: fixture.fixtureId,
        externalId: fixture.externalId,
        proposedMode,
        pending: !ready,
        missingCoreFacts: fixture.missingCoreFacts,
        players,
        scoreDifference:
          ready && players.length > 0 && players.every((p) => p.scoreDifference !== null)
            ? players.reduce((n, p) => n + p.scoreDifference!, 0)
            : null,
      };
    }),
  };
}
